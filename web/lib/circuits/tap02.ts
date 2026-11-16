// Copied from circuits/src/tap02.ts by web/scripts/sync-circuits.mjs. Edit the original.
/**
 * TAP-02 (TapeOut "Circuit Netlist Format and Evaluation Semantics") in TypeScript.
 *
 * This module is deliberately independent of the circuit builder: tests decode the
 * *encoded bytes* the builder produces and evaluate those, so a builder bug cannot hide
 * behind a simulator that shares its data structures.
 *
 * Covers: record encoding (NAND 0x00, LATCH 0x01, REF 0x02), signal numbering,
 * well-formedness (§3), state layout and one beat (§4), LSB-first bit packing (§5).
 * Checked against the official vectors in test/vectors/tap02-vectors.json.
 */

export const OP_NAND = 0x00;
export const OP_LATCH = 0x01;
export const OP_REF = 0x02;

const MAX_SIGNALS = 1 << 24;
const MAX_PINS = 1 << 16;
const MAX_GATES = 2 ** 32 - 1;

export class IllFormed extends Error {}

export interface Element {
  op: number;
  /** NAND: [a, b]; LATCH: [d]; REF: input signals */
  ins: number[];
  /** REF only: processor address, lowercase 0x-hex */
  cpu?: string;
  /** REF only: circuit id */
  cid?: bigint;
  /** number of signals this element produces */
  nOut: number;
  /** index of the first signal this element produces */
  firstOut: number;
}

export interface Circuit {
  nIn: number;
  nOut: number;
  elements: Element[];
  nSignals: number;
  nState: number;
  nGates: number;
  /** state offset of each element (meaningful for LATCH and REF) */
  stateBase: number[];
  subs: Map<string, Circuit>;
}

export type Resolver = (cpu: string, cid: bigint) => Circuit | undefined;

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || /[^0-9a-fA-F]/.test(h)) throw new Error(`bad hex: ${hex.slice(0, 20)}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = "0x";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

/** Decode records (§2). Throws IllFormed on unknown opcodes or truncated records. */
export function decode(data: Uint8Array, nIn: number): Element[] {
  let p = 0;
  let next = 2 + nIn;
  const els: Element[] = [];
  const take = (k: number): Uint8Array => {
    if (p + k > data.length) throw new IllFormed(`truncated record at byte ${p}`);
    const b = data.subarray(p, p + k);
    p += k;
    return b;
  };
  const u24 = (): number => {
    const b = take(3);
    return (b[0] << 16) | (b[1] << 8) | b[2];
  };
  while (p < data.length) {
    const op = take(1)[0];
    let e: Element;
    if (op === OP_NAND) {
      e = { op, ins: [u24(), u24()], nOut: 1, firstOut: 0 };
    } else if (op === OP_LATCH) {
      e = { op, ins: [u24()], nOut: 1, firstOut: 0 };
    } else if (op === OP_REF) {
      const cpu = bytesToHex(take(20)).toLowerCase();
      const idb = take(8);
      let cid = 0n;
      for (const x of idb) cid = (cid << 8n) | BigInt(x);
      const ni = take(1)[0];
      const no = take(1)[0];
      const ins: number[] = [];
      for (let i = 0; i < ni; i++) ins.push(u24());
      e = { op, ins, cpu, cid, nOut: no, firstOut: 0 };
    } else {
      throw new IllFormed(`unknown opcode 0x${op.toString(16).padStart(2, "0")} at byte ${p - 1}`);
    }
    e.firstOut = next;
    next += e.nOut;
    els.push(e);
  }
  return els;
}

/** Encode elements back to bytes (§2). */
export function encode(els: Element[]): Uint8Array {
  const out: number[] = [];
  const u24 = (s: number) => {
    if (s < 0 || s >= MAX_SIGNALS) throw new IllFormed(`signal ${s} does not fit u24`);
    out.push((s >> 16) & 0xff, (s >> 8) & 0xff, s & 0xff);
  };
  for (const e of els) {
    out.push(e.op);
    if (e.op === OP_REF) {
      const cpu = hexToBytes(e.cpu ?? "");
      if (cpu.length !== 20) throw new IllFormed("REF cpu must be 20 bytes");
      out.push(...cpu);
      let cid = e.cid ?? 0n;
      const idb: number[] = [];
      for (let i = 0; i < 8; i++) {
        idb.unshift(Number(cid & 0xffn));
        cid >>= 8n;
      }
      out.push(...idb, e.ins.length, e.nOut);
    }
    for (const s of e.ins) u24(s);
  }
  return Uint8Array.from(out);
}

/** Decode and check well-formedness (§3). */
export function load(data: Uint8Array, nIn: number, nOut: number, resolve?: Resolver): Circuit {
  const els = decode(data, nIn);
  let nSignals = 2 + nIn;
  for (const e of els) nSignals += e.nOut;
  if (nSignals > MAX_SIGNALS) throw new IllFormed("more than 2^24 signals");
  if (!(nIn >= 0 && nIn <= MAX_PINS && nOut >= 1 && nOut <= MAX_PINS)) throw new IllFormed("nIn/nOut out of range");
  if (nSignals - 2 - nIn < nOut) throw new IllFormed("too few signals for outputs");
  const c: Circuit = { nIn, nOut, elements: els, nSignals, nState: 0, nGates: 0, stateBase: [], subs: new Map() };
  for (const e of els) {
    for (const s of e.ins) {
      const limit = e.op === OP_LATCH ? nSignals : e.firstOut;
      if (s >= limit) throw new IllFormed(`signal ${s} referenced by element at ${e.firstOut} is not available`);
    }
    c.stateBase.push(c.nState);
    if (e.op === OP_LATCH) {
      c.nState += 1;
    } else if (e.op === OP_REF) {
      if (!resolve) throw new IllFormed("REF without a resolver");
      const sub = resolve(e.cpu!, e.cid!);
      if (!sub) throw new IllFormed("REF target is not a circuit of a registered processor");
      if (sub.nIn !== e.ins.length || sub.nOut !== e.nOut) throw new IllFormed("REF arity does not match the target circuit");
      if (sub.nState > MAX_SIGNALS) throw new IllFormed("REF size");
      c.subs.set(refKey(e.cpu!, e.cid!), sub);
      c.nState += sub.nState;
      c.nGates += sub.nGates;
    }
  }
  for (const e of els) if (e.op !== OP_REF) c.nGates += 1;
  if (c.nState > MAX_SIGNALS || c.nGates > MAX_GATES) throw new IllFormed("size overflow");
  return c;
}

const refKey = (cpu: string, cid: bigint) => `${cpu.toLowerCase()}#${cid}`;

/** One beat (§4). state.length must be nState, inputs.length nIn; values are 0/1. */
export function beat(c: Circuit, state: number[], inputs: number[]): { newState: number[]; outputs: number[] } {
  if (state.length !== c.nState || inputs.length !== c.nIn) throw new Error("beat: wrong vector length");
  const s: number[] = [0, 1, ...inputs];
  const newState = state.slice();
  c.elements.forEach((e, k) => {
    const base = c.stateBase[k];
    if (e.op === OP_NAND) {
      s.push(1 - (s[e.ins[0]] & s[e.ins[1]]));
    } else if (e.op === OP_LATCH) {
      s.push(state[base]);
    } else {
      const sub = c.subs.get(refKey(e.cpu!, e.cid!))!;
      const r = beat(sub, state.slice(base, base + sub.nState), e.ins.map((i) => s[i]));
      for (let i = 0; i < sub.nState; i++) newState[base + i] = r.newState[i];
      s.push(...r.outputs);
    }
  });
  c.elements.forEach((e, k) => {
    if (e.op === OP_LATCH) newState[c.stateBase[k]] = s[e.ins[0]];
  });
  return { newState, outputs: s.slice(s.length - c.nOut) };
}

/** §5: bit i -> bit (i mod 8) of byte floor(i/8); exactly ceil(n/8) bytes. */
export function pack(bits: number[]): Uint8Array {
  const out = new Uint8Array((bits.length + 7) >> 3);
  bits.forEach((v, i) => {
    if (v) out[i >> 3] |= 1 << (i & 7);
  });
  return out;
}

/** §5 lenient read, exactly as the contracts read inputs and state. */
export function unpack(data: Uint8Array, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i >> 3 < data.length ? (data[i >> 3] >> (i & 7)) & 1 : 0);
  return out;
}

/** Bits of a non-negative integer, LSB first. */
export function bitsOf(value: number | bigint, n: number): number[] {
  const v = BigInt(value);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Number((v >> BigInt(i)) & 1n));
  return out;
}

/**
 * 32-lane bitsliced evaluator for combinational circuits without REF.
 * Each signal is a 32-bit word; lane j of every word is an independent input vector.
 * Used for exhaustive truth-table checks (2^24 vectors in well under a second per circuit).
 */
export function compileBitsliced(c: Circuit): (inputs: Int32Array) => Int32Array {
  if (c.nState !== 0) throw new Error("bitsliced evaluator is for combinational circuits");
  for (const e of c.elements) if (e.op !== OP_NAND) throw new Error("bitsliced evaluator supports NAND only");
  const n = c.nSignals;
  const a = Int32Array.from(c.elements.map((e) => e.ins[0]));
  const b = Int32Array.from(c.elements.map((e) => e.ins[1]));
  const base = 2 + c.nIn;
  const s = new Int32Array(n);
  return (inputs: Int32Array) => {
    s[0] = 0;
    s[1] = -1;
    for (let i = 0; i < c.nIn; i++) s[2 + i] = inputs[i];
    for (let k = 0; k < a.length; k++) s[base + k] = ~(s[a[k]] & s[b[k]]);
    return s.slice(n - c.nOut);
  };
}
