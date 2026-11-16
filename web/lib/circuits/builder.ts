// Copied from circuits/src/builder.ts by web/scripts/sync-circuits.mjs. Edit the original.
/**
 * Gate-level circuit builder for TapeOut netlists (NAND + LATCH only).
 *
 * - Structural hashing: the same NAND(a, b) is built once.
 * - Constant folding and double-negation removal: NAND with constant 0, NOT(NOT x), x AND NOT x.
 * - LATCH with forward reference: `latch()` returns q now, `setD(q, d)` wires it later.
 * - `build(outputs)` removes dead gates, orders records so every NAND refers backwards,
 *   places the outputs as the last nOut signals (TAP-02 §4 step 4) and encodes TAP-02 bytes.
 *
 * Signal numbering while building: 0 = constant 0, 1 = constant 1, 2..2+nIn-1 = inputs,
 * then one signal per element in creation order. `build` renumbers.
 */
import { OP_LATCH, OP_NAND, encode, bytesToHex, type Element } from "./tap02";
import { keccak256Hex } from "./keccak";

export type Sig = number;
export const ZERO: Sig = 0;
export const ONE: Sig = 1;

interface BNand {
  kind: "nand";
  a: Sig;
  b: Sig;
}
interface BLatch {
  kind: "latch";
  d: Sig | null;
}
type BElem = BNand | BLatch;

export interface Netlist {
  name: string;
  nIn: number;
  nOut: number;
  nState: number;
  nand: number;
  latch: number;
  /** gateCount as the processor reports it: NAND + LATCH records */
  gates: number;
  elements: Element[];
  bytes: Uint8Array;
  hex: string;
  /** keccak256 of the netlist bytes: the value pinned in FuseRegistry */
  keccak: string;
}

export class Builder {
  readonly nIn: number;
  private elems: BElem[] = [];
  private hashed = new Map<string, Sig>();
  /** NOT gate output -> the signal it inverts */
  private notOf = new Map<Sig, Sig>();

  constructor(nIn: number) {
    if (!Number.isInteger(nIn) || nIn < 0) throw new Error("bad nIn");
    this.nIn = nIn;
  }

  input(i: number): Sig {
    if (i < 0 || i >= this.nIn) throw new Error(`input ${i} out of range`);
    return 2 + i;
  }

  /** Inputs [from, from + n) as a little-endian bus. */
  bus(from: number, n: number): Sig[] {
    return Array.from({ length: n }, (_, k) => this.input(from + k));
  }

  private push(e: BElem): Sig {
    this.elems.push(e);
    return 2 + this.nIn + this.elems.length - 1;
  }

  private check(s: Sig) {
    if (!Number.isInteger(s) || s < 0 || s >= 2 + this.nIn + this.elems.length) throw new Error(`unknown signal ${s}`);
  }

  nand(a: Sig, b: Sig): Sig {
    this.check(a);
    this.check(b);
    if (a === ZERO || b === ZERO) return ONE;
    if (a === ONE) return this.not(b);
    if (b === ONE) return this.not(a);
    if (a === b) return this.not(a);
    if (this.notOf.get(a) === b || this.notOf.get(b) === a) return ONE; // x AND NOT x = 0
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const key = `${lo},${hi}`;
    const hit = this.hashed.get(key);
    if (hit !== undefined) return hit;
    const g = this.push({ kind: "nand", a: lo, b: hi });
    this.hashed.set(key, g);
    return g;
  }

  not(a: Sig): Sig {
    this.check(a);
    if (a === ZERO) return ONE;
    if (a === ONE) return ZERO;
    const inv = this.notOf.get(a);
    if (inv !== undefined) return inv;
    const key = `${a},${a}`;
    const hit = this.hashed.get(key);
    if (hit !== undefined) return hit;
    const g = this.push({ kind: "nand", a, b: a });
    this.hashed.set(key, g);
    this.notOf.set(g, a);
    return g;
  }

  and(a: Sig, b: Sig): Sig {
    return this.not(this.nand(a, b));
  }

  /** a OR b = NAND(NOT a, NOT b) */
  or(a: Sig, b: Sig): Sig {
    return this.nand(this.not(a), this.not(b));
  }

  /** XOR in 4 NANDs; also returns the shared NAND(a, b) for reuse */
  xorParts(a: Sig, b: Sig): { x: Sig; nab: Sig; na: Sig; nb: Sig } {
    const nab = this.nand(a, b);
    const na = this.nand(a, nab); // NOT(a AND NOT b)
    const nb = this.nand(b, nab); // NOT(b AND NOT a)
    return { x: this.nand(na, nb), nab, na, nb };
  }

  xor(a: Sig, b: Sig): Sig {
    return this.xorParts(a, b).x;
  }

  /** New LATCH; returns its output q (the state bit from the previous beat). Wire d with setD. */
  latch(): Sig {
    return this.push({ kind: "latch", d: null });
  }

  setD(q: Sig, d: Sig) {
    this.check(d);
    const e = this.elems[q - 2 - this.nIn];
    if (!e || e.kind !== "latch") throw new Error(`signal ${q} is not a latch`);
    if (e.d !== null) throw new Error(`latch ${q} already wired`);
    e.d = d;
  }

  /** Assemble the netlist: dead-gate removal, ordering, output placement, TAP-02 encoding. */
  build(name: string, outputs: Sig[]): Netlist {
    if (outputs.length < 1) throw new Error("need at least one output");
    const base = 2 + this.nIn;
    const elemOf = (s: Sig): BElem | undefined => (s >= base ? this.elems[s - base] : undefined);

    // 1. liveness: everything feeding an output or a live latch's d
    const live = new Set<Sig>();
    const stack = [...outputs];
    while (stack.length) {
      const s = stack.pop()!;
      if (s < base || live.has(s)) continue;
      live.add(s);
      const e = elemOf(s)!;
      if (e.kind === "nand") stack.push(e.a, e.b);
      else {
        if (e.d === null) throw new Error(`latch ${s} has no d`);
        stack.push(e.d);
      }
    }

    // 2. ordering: live latches first (they are sources within a beat), then NANDs in creation order
    //    (creation order is topological). Output gates are held back and appended last when no other
    //    gate needs them earlier; otherwise buffer copies of the outputs are appended.
    //    LATCH d may refer forward (TAP-02 §3.5), so a latch fed by an output does not block this.
    const sigs = [...live].sort((x, y) => x - y);
    const latches = sigs.filter((s) => elemOf(s)!.kind === "latch");
    const nands = sigs.filter((s) => elemOf(s)!.kind === "nand");
    const outSet = new Set(outputs);
    const usedByNonOutputs = new Set<Sig>();
    for (const s of nands) {
      if (outSet.has(s)) continue;
      const e = elemOf(s) as BNand;
      usedByNonOutputs.add(e.a).add(e.b);
    }
    const canTail = (k: number): boolean => {
      const s = outputs[k];
      if (s < base || elemOf(s)!.kind !== "nand") return false; // input, constant or latch
      if (outputs.indexOf(s) !== k) return false; // the same signal twice
      if (usedByNonOutputs.has(s)) return false;
      for (let j = 0; j < k; j++) {
        const e = elemOf(outputs[j]); // an earlier output may not depend on a later one
        if (e && e.kind === "nand" && (e.a === s || e.b === s)) return false;
      }
      return true;
    };
    const tailOk = outputs.every((_, k) => canTail(k));

    const order: Sig[] = [...latches, ...nands.filter((s) => !(tailOk && outSet.has(s)))];
    if (tailOk) order.push(...outputs);
    const map = new Map<Sig, Sig>([
      [ZERO, ZERO],
      [ONE, ONE],
    ]);
    for (let i = 0; i < this.nIn; i++) map.set(2 + i, 2 + i);
    order.forEach((s, k) => map.set(s, base + k));
    const renum = (s: Sig): Sig => {
      const m = map.get(s);
      if (m === undefined) throw new Error(`internal: signal ${s} not placed`);
      return m;
    };
    const elements: Element[] = order.map((s, k) => {
      const e = elemOf(s)!;
      const ins = e.kind === "nand" ? [e.a, e.b] : [e.d!];
      return { op: e.kind === "nand" ? OP_NAND : OP_LATCH, ins: ins.map(renum), nOut: 1, firstOut: base + k };
    });
    if (!tailOk) {
      // NOT y is re-emitted as one gate; anything else is buffered as NOT(NOT x)
      const emit = (a: Sig, b2: Sig): Sig => {
        const idx = base + elements.length;
        elements.push({ op: OP_NAND, ins: [a, b2], nOut: 1, firstOut: idx });
        return idx;
      };
      const plan = outputs.map((s) => {
        const inv = this.notOf.get(s);
        return inv !== undefined ? { one: renum(inv) } : { two: renum(s) };
      });
      // all first-stage gates must precede every output, so emit first stages, then finals in order
      const firsts = plan.map((p) => ("two" in p ? emit(p.two!, p.two!) : -1));
      plan.forEach((p, k) => {
        if ("one" in p) emit(p.one!, p.one!);
        else emit(firsts[k], firsts[k]);
      });
    }
    const bytes = encode(elements);
    const nLatch = latches.length;
    return {
      name,
      nIn: this.nIn,
      nOut: outputs.length,
      nState: nLatch,
      nand: elements.length - nLatch,
      latch: nLatch,
      gates: elements.length,
      elements,
      bytes,
      hex: bytesToHex(bytes),
      keccak: keccak256Hex(bytes),
    };
  }
}

// ---------------------------------------------------------------------------
// Arithmetic blocks. Gate counts are part of the design; see docs/ARCHITECTURE.md.
// ---------------------------------------------------------------------------

/**
 * Unsigned x <= y for little-endian buses of equal width.
 * Carry chain of y + NOT(x) + 1 (no borrow <=> x <= y), 2 + 5·(n-1) NANDs:
 *   bit 0:  c1 = y0 OR NOT x0            = NAND(x0, NAND(x0, y0))           (2 gates)
 *   bit i:  c' = MAJ(y, NOT x, c)        = NAND(n2, NAND(c, n3))             (5 gates)
 *           with n1 = NAND(x, y), n2 = NAND(y, n1) = NOT(y AND NOT x), n3 = NAND(x, n1) = y OR NOT x
 * No explicit inverter is needed: n2 and n3 already carry the inverted operand.
 */
export function lessOrEqual(b: Builder, x: Sig[], y: Sig[]): Sig {
  if (x.length !== y.length || x.length === 0) throw new Error("lessOrEqual: width mismatch");
  let c: Sig = ONE;
  for (let i = 0; i < x.length; i++) {
    const n1 = b.nand(x[i], y[i]);
    const n3 = b.nand(x[i], n1); // y OR NOT x
    if (c === ONE) {
      c = n3;
      continue;
    }
    const n2 = b.nand(y[i], n1); // NOT(y AND NOT x)
    c = b.nand(n2, b.nand(c, n3));
  }
  return c;
}

/**
 * Ripple-carry adder: returns n sum bits and the carry out.
 * Half adder at bit 0 (5 NANDs), full adders after (9 NANDs each).
 */
export function add(b: Builder, x: Sig[], y: Sig[]): { sum: Sig[]; carry: Sig } {
  if (x.length !== y.length || x.length === 0) throw new Error("add: width mismatch");
  const sum: Sig[] = [];
  let c: Sig = ZERO;
  for (let i = 0; i < x.length; i++) {
    const h = b.xorParts(x[i], y[i]);
    if (c === ZERO) {
      sum.push(h.x);
      c = b.not(h.nab);
      continue;
    }
    const m1 = b.nand(h.x, c);
    const m2 = b.nand(h.x, m1);
    const m3 = b.nand(c, m1);
    sum.push(b.nand(m2, m3));
    c = b.nand(h.nab, m1); // (x AND y) OR (c AND (x XOR y))
  }
  return { sum, carry: c };
}

/** Majority of three: (a AND b) OR (c AND (a XOR b)), 6 NANDs; also exposes the inverted form cheaply. */
export function majority3(b: Builder, a: Sig, bb: Sig, c: Sig): { maj: Sig; nabRaw: Sig; ncx: Sig } {
  const h = b.xorParts(a, bb);
  const ncx = b.nand(c, h.x);
  return { maj: b.nand(h.nab, ncx), nabRaw: h.nab, ncx };
}
