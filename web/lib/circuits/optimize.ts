// Copied from circuits/src/optimize.ts by web/scripts/sync-circuits.mjs. Edit the original.
/**
 * Gate golf: shrink a NAND + LATCH netlist without changing what it does, then prove it.
 *
 * Fewer gates means a cheaper tape-out (TapeOut mints one transistor per gate) and less gas on every check, since
 * the processor evaluates every gate each time a wallet asks. The rewrites:
 *
 * - Structural pass (the Builder's own rules, re-run on decoded bytes): identical NANDs merged with their inputs as an
 *   unordered pair, constants folded, NOT(NOT x) removed, x AND NOT x folded, dead gates dropped.
 * - Functional reduction: every signal's exact function is built as a reduced ordered BDD. A gate whose function
 *   already exists elsewhere in the circuit is replaced by that signal; one that equals the complement of an existing
 *   signal becomes a single inverter of it; one that is constant becomes the constant. This catches what structural
 *   hashing can't: the same function built two different ways, and conditions another condition already implies
 *   (e.g. "amount <= cap/2 AND amount <= cap" is just the first comparator).
 *
 * LATCHes are never touched: the same latches, in the same order (so the same state bits), with their next-state
 * functions proved equal. Inputs and outputs keep their order and count, so the circuit stays plug-compatible with
 * its socket.
 *
 * Proof: the candidate is checked against the original on every input. With inputs + state bits <= 24 it is run
 * exhaustively, 32 vectors a word; above that, the outputs and next-state functions of both are built as BDDs with one
 * shared variable order, and equal BDDs mean equal functions on every input. A candidate that fails, or can't be
 * proved, is never returned.
 */
import { Builder, ONE, ZERO, type Netlist, type Sig } from "./builder";
import { OP_LATCH, OP_NAND, decode, type Element } from "./tap02";

// ---------------------------------------------------------------------------------------------------------------
// A small reduced ordered BDD package (no complement edges; node 0 = false, 1 = true).
// ---------------------------------------------------------------------------------------------------------------

export class BddTooBig extends Error {}

class Bdd {
  readonly F = 0;
  readonly T = 1;
  private level: number[] = [1e9, 1e9];
  private lo: number[] = [0, 1];
  private hi: number[] = [0, 1];
  private unique = new Map<string, number>();
  private nandMemo = new Map<string, number>();
  private notMemo = new Map<number, number>();
  private readonly limit: number;
  constructor(limit = 1_500_000) { this.limit = limit; }

  get size() { return this.level.length; }

  private mk(v: number, l: number, h: number): number {
    if (l === h) return l;
    const key = `${v},${l},${h}`;
    const hit = this.unique.get(key);
    if (hit !== undefined) return hit;
    if (this.level.length >= this.limit) throw new BddTooBig(`more than ${this.limit} BDD nodes`);
    this.level.push(v); this.lo.push(l); this.hi.push(h);
    const id = this.level.length - 1;
    this.unique.set(key, id);
    return id;
  }

  variable(v: number) { return this.mk(v, this.F, this.T); }

  not(f: number): number {
    if (f === this.F) return this.T;
    if (f === this.T) return this.F;
    const hit = this.notMemo.get(f);
    if (hit !== undefined) return hit;
    const r = this.mk(this.level[f], this.not(this.lo[f]), this.not(this.hi[f]));
    this.notMemo.set(f, r);
    this.notMemo.set(r, f);
    return r;
  }

  nand(f: number, g: number): number {
    if (f === this.F || g === this.F) return this.T;
    if (f === this.T) return this.not(g);
    if (g === this.T) return this.not(f);
    if (f === g) return this.not(f);
    const [a, b] = f < g ? [f, g] : [g, f];
    const key = `${a},${b}`;
    const hit = this.nandMemo.get(key);
    if (hit !== undefined) return hit;
    const v = Math.min(this.level[a], this.level[b]);
    const a0 = this.level[a] === v ? this.lo[a] : a, a1 = this.level[a] === v ? this.hi[a] : a;
    const b0 = this.level[b] === v ? this.lo[b] : b, b1 = this.level[b] === v ? this.hi[b] : b;
    const r = this.mk(v, this.nand(a0, b0), this.nand(a1, b1));
    this.nandMemo.set(key, r);
    return r;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The netlist as the processor sees it: decoded from its own bytes.
// ---------------------------------------------------------------------------------------------------------------

interface Shape { nIn: number; nOut: number; els: Element[] }

function shapeOf(net: Netlist): Shape {
  const els = decode(net.bytes, net.nIn);
  for (const e of els) if (e.op !== OP_NAND && e.op !== OP_LATCH) throw new Error("only NAND and LATCH netlists can be optimized (no REF)");
  return { nIn: net.nIn, nOut: net.nOut, els };
}

/**
 * Variable order for BDDs: the inputs and latch outputs in the order the netlist first reads them. Builder netlists
 * work through arithmetic from the low bit up, so this interleaves operand bits, which keeps comparator and adder
 * BDDs linear in size. Returned by position (input i, latch k), so it carries over to a rebuilt netlist.
 */
interface Order { input: number[]; latch: number[] }
function variableOrder(s: Shape): Order {
  const first = new Map<number, number>();
  const latchSigs = s.els.filter((e) => e.op === OP_LATCH).map((e) => e.firstOut);
  const isVar = (sig: number) => sig >= 2 && (sig < 2 + s.nIn || latchSigs.includes(sig));
  s.els.forEach((e, k) => { for (const sig of e.ins) if (isVar(sig) && !first.has(sig)) first.set(sig, k); });
  const vars = [...Array.from({ length: s.nIn }, (_, i) => 2 + i), ...latchSigs];
  vars.sort((x, y) => (first.get(x) ?? 1e9) - (first.get(y) ?? 1e9) || x - y);
  const level = new Map(vars.map((sig, i) => [sig, i]));
  return { input: Array.from({ length: s.nIn }, (_, i) => level.get(2 + i)!), latch: latchSigs.map((sig) => level.get(sig)!) };
}

// ---------------------------------------------------------------------------------------------------------------
// Rebuilding: one pass through the gates in order, into a fresh hashing Builder.
// ---------------------------------------------------------------------------------------------------------------

function rebuild(s: Shape, name: string, functional: boolean, orderFrom?: Shape, force?: Map<number, Sig>): Netlist {
  const b = new Builder(s.nIn);
  const map = new Map<number, Sig>([[0, ZERO], [1, ONE]]);
  for (let i = 0; i < s.nIn; i++) map.set(2 + i, 2 + i);
  const latches: { q: Sig; d: number }[] = [];
  for (const e of s.els) if (e.op === OP_LATCH) { const q = b.latch(); map.set(e.firstOut, q); latches.push({ q, d: e.ins[0] }); }

  const bdd = functional ? new Bdd() : null;
  const fOf = new Map<Sig, number>(), byF = new Map<number, Sig>();
  const note = (sig: Sig, f: number) => { if (!fOf.has(sig)) fOf.set(sig, f); if (!byF.has(f)) byF.set(f, sig); };
  if (bdd) {
    const order = variableOrder(orderFrom ?? s);
    note(ZERO, bdd.F); note(ONE, bdd.T);
    for (let i = 0; i < s.nIn; i++) note(2 + i, bdd.variable(order.input[i]));
    latches.forEach(({ q }, k) => note(q, bdd.variable(order.latch[k])));
  }

  for (const e of s.els) {
    if (e.op !== OP_NAND) continue;
    const forced = force?.get(e.firstOut);
    if (forced !== undefined) { map.set(e.firstOut, forced); continue; }
    const a = map.get(e.ins[0]), c = map.get(e.ins[1]);
    if (a === undefined || c === undefined) throw new Error("netlist refers forward from a NAND");
    if (!bdd) { map.set(e.firstOut, b.nand(a, c)); continue; }
    const f = bdd.nand(fOf.get(a)!, fOf.get(c)!);
    const same = byF.get(f);
    if (same !== undefined) { map.set(e.firstOut, same); continue; }
    const inv = byF.get(bdd.not(f));
    const sig = inv !== undefined ? b.not(inv) : b.nand(a, c);
    note(sig, f);
    map.set(e.firstOut, sig);
  }
  for (const { q, d } of latches) b.setD(q, map.get(d)!);
  const total = 2 + s.nIn + s.els.length;
  const outs = Array.from({ length: s.nOut }, (_, k) => map.get(total - s.nOut + k)!);
  return b.build(name, outs);
}

// ---------------------------------------------------------------------------------------------------------------
// Equivalence: every input, and for sequential circuits every (state, input) pair.
// ---------------------------------------------------------------------------------------------------------------

export interface Equivalence {
  equal: boolean;
  method: "exhaustive" | "bdd";
  /** input (and state) assignments covered: all of them, 2^(nIn + nState) */
  assignments: number;
  /** the first differing assignment, when there is one (exhaustive method only) */
  example?: { inputs: number[]; state: number[] };
}

/** The circuit as one combinational block: (state, inputs) -> (outputs, next state), 32 vectors a word. */
function wordEvaluator(s: Shape) {
  const n = 2 + s.nIn + s.els.length;
  const latchIdx: number[] = [];
  s.els.forEach((e, k) => { if (e.op === OP_LATCH) latchIdx.push(k); });
  const sig = new Int32Array(n);
  return (inputs: Int32Array, state: Int32Array) => {
    sig[0] = 0; sig[1] = -1;
    for (let i = 0; i < s.nIn; i++) sig[2 + i] = inputs[i];
    let li = 0;
    for (let k = 0; k < s.els.length; k++) {
      const e = s.els[k];
      sig[2 + s.nIn + k] = e.op === OP_LATCH ? state[li++] : ~(sig[e.ins[0]] & sig[e.ins[1]]);
    }
    const out = new Int32Array(s.nOut + latchIdx.length);
    for (let j = 0; j < s.nOut; j++) out[j] = sig[n - s.nOut + j];
    latchIdx.forEach((k, j) => { out[s.nOut + j] = sig[s.els[k].ins[0]]; });
    return out;
  };
}

const LANE = [0xaaaaaaaa | 0, 0xcccccccc | 0, 0xf0f0f0f0 | 0, 0xff00ff00 | 0, 0xffff0000 | 0];
const latchCount = (s: Shape) => s.els.filter((e) => e.op === OP_LATCH).length;

/** Assignment variables for the exhaustive run: the inputs, then the state bits. */
function* exhaustiveBatches(nVars: number) {
  const words = new Int32Array(Math.max(nVars, 5));
  for (let i = 0; i < Math.min(5, nVars); i++) words[i] = LANE[i];
  const batches = 2 ** Math.max(0, nVars - 5);
  for (let bIdx = 0; bIdx < batches; bIdx++) {
    for (let i = 5; i < nVars; i++) words[i] = (bIdx >>> (i - 5)) & 1 ? -1 : 0;
    yield { bIdx, words, batches };
  }
}

function exhaustive(a: Shape, b: Shape, chunk?: () => boolean): Equivalence | Promise<Equivalence> {
  const nS = latchCount(a), nVars = a.nIn + nS;
  const ea = wordEvaluator(a), eb = wordEvaluator(b);
  const mask = nVars >= 5 ? -1 : (1 << (1 << nVars)) - 1; // fewer than 32 assignments: only the low lanes are real
  const check = (words: Int32Array, bIdx: number): Equivalence | null => {
    const ins = words.subarray(0, a.nIn), st = words.subarray(a.nIn, nVars);
    const oa = ea(ins, st), ob = eb(ins, st);
    for (let j = 0; j < oa.length; j++) {
      const diff = (oa[j] ^ ob[j]) & mask;
      if (diff) {
        const lane = 31 - Math.clz32(diff & -diff);
        const idx = bIdx * 32 + lane, bit = (i: number) => (i < 5 ? (lane >> i) & 1 : (idx >> i) & 1);
        return { equal: false, method: "exhaustive", assignments: 2 ** nVars, example: { inputs: Array.from({ length: a.nIn }, (_, i) => bit(i)), state: Array.from({ length: nS }, (_, i) => bit(a.nIn + i)) } };
      }
    }
    return null;
  };
  const done: Equivalence = { equal: true, method: "exhaustive", assignments: 2 ** nVars };
  if (!chunk) {
    for (const { bIdx, words } of exhaustiveBatches(nVars)) { const r = check(words, bIdx); if (r) return r; }
    return done;
  }
  return (async () => {
    for (const { bIdx, words } of exhaustiveBatches(nVars)) {
      const r = check(words, bIdx); if (r) return r;
      if ((bIdx & 4095) === 4095 && chunk()) await new Promise<void>((res) => setTimeout(res, 0));
    }
    return done;
  })();
}

function bddEquivalent(a: Shape, b: Shape): Equivalence {
  const bdd = new Bdd();
  const order = variableOrder(a);
  const fns = (s: Shape) => {
    const f = new Map<number, number>([[0, bdd.F], [1, bdd.T]]);
    for (let i = 0; i < s.nIn; i++) f.set(2 + i, bdd.variable(order.input[i]));
    // latches correspond by position (state bit k is the k-th LATCH in both)
    let li = 0;
    for (const e of s.els) if (e.op === OP_LATCH) f.set(e.firstOut, bdd.variable(order.latch[li++]));
    for (const e of s.els) if (e.op === OP_NAND) f.set(e.firstOut, bdd.nand(f.get(e.ins[0])!, f.get(e.ins[1])!));
    const total = 2 + s.nIn + s.els.length;
    return [...Array.from({ length: s.nOut }, (_, k) => f.get(total - s.nOut + k)!), ...s.els.filter((e) => e.op === OP_LATCH).map((e) => f.get(e.ins[0])!)];
  };
  const fa = fns(a), fb = fns(b);
  return { equal: fa.length === fb.length && fa.every((x, i) => x === fb[i]), method: "bdd", assignments: 2 ** (a.nIn + latchCount(a)) };
}

function sameInterface(a: Shape, b: Shape) {
  return a.nIn === b.nIn && a.nOut === b.nOut && latchCount(a) === latchCount(b);
}

/** Are two netlists the same circuit on every input (and every state)? Synchronous. */
export function equivalent(x: Netlist, y: Netlist): Equivalence {
  const a = shapeOf(x), b = shapeOf(y);
  if (!sameInterface(a, b)) return { equal: false, method: "exhaustive", assignments: 0 };
  return a.nIn + latchCount(a) <= 24 ? (exhaustive(a, b) as Equivalence) : bddEquivalent(a, b);
}

/** The same, yielding to the event loop now and then so a page stays responsive during a 2^24 run. */
export async function equivalentAsync(x: Netlist, y: Netlist): Promise<Equivalence> {
  const a = shapeOf(x), b = shapeOf(y);
  if (!sameInterface(a, b)) return { equal: false, method: "exhaustive", assignments: 0 };
  if (a.nIn + latchCount(a) > 24) return bddEquivalent(a, b);
  return exhaustive(a, b, () => true);
}

// ---------------------------------------------------------------------------------------------------------------
// The optimizer.
// ---------------------------------------------------------------------------------------------------------------

export interface Candidate {
  before: Netlist;
  /** the smaller netlist, or null when nothing could be cut */
  after: Netlist | null;
  passes: string[];
}
export interface Progress { done: number; total: number; stage: string }

/** Random vectors through the original: a fast filter before the exact BDD check of a redundancy candidate. */
function randomFilter(s0: Shape) {
  const nS = latchCount(s0), words = 64;
  let seed = 0x2545f491;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const vecs = Array.from({ length: words }, () => ({ ins: Int32Array.from({ length: s0.nIn }, rnd), st: Int32Array.from({ length: nS }, rnd) }));
  const want = vecs.map((v) => wordEvaluator(s0)(v.ins, v.st));
  return (s: Shape) => {
    const ev = wordEvaluator(s);
    return vecs.every((v, i) => { const got = ev(v.ins, v.st), w = want[i]; return got.length === w.length && got.every((x, j) => x === w[j]); });
  };
}

/** The rewrite, as steps: yields progress between candidates so a caller can keep a page responsive. */
function* shrinkSteps(net: Netlist): Generator<Progress, Candidate> {
  const s0 = shapeOf(net);
  const passes: string[] = [];
  let best = net;
  const consider = (cand: Netlist, label: string) => {
    if (cand.latch !== net.latch || cand.nIn !== net.nIn || cand.nOut !== net.nOut) return; // never change the interface or the state layout
    if (cand.gates < best.gates) { passes.push(`${label}: ${best.gates} → ${cand.gates} gates`); best = cand; }
  };
  consider(rebuild(s0, net.name, false), "structural");
  yield { done: 0, total: 1, stage: "structural" };
  try {
    // functional reduction until nothing changes (a merge can expose another)
    for (let round = 0; round < 4; round++) {
      const cand = rebuild(shapeOf(best), net.name, true, s0);
      if (cand.gates >= best.gates) break;
      consider(cand, "functional reduction");
    }
    yield { done: 0, total: 1, stage: "functional" };
    // redundancy removal: tie a gate to a constant; keep it if smaller and still the same circuit
    const same = randomFilter(s0);
    let changed = true, tried = 0;
    for (let guard = 0; guard < 64 && changed; guard++) {
      changed = false;
      const s = shapeOf(best);
      const total = s.els.length * 2;
      for (let k = s.els.length - 1; k >= 0 && !changed; k--) {
        const e = s.els[k];
        if (e.op !== OP_NAND) continue;
        for (const c of [ONE, ZERO]) {
          tried++;
          const cand = rebuild(s, net.name, true, s0, new Map([[e.firstOut, c]]));
          if (cand.gates < best.gates && cand.latch === net.latch) {
            const cs = shapeOf(cand);
            if (same(cs) && bddEquivalent(s0, cs).equal) { consider(cand, "redundancy removal"); changed = true; break; }
          }
          if (tried % 8 === 0) yield { done: (s.els.length - 1 - k) * 2, total, stage: "redundancy" };
        }
      }
    }
  } catch (e) {
    if (!(e instanceof BddTooBig)) throw e;
    passes.push("functional passes skipped: the BDDs grew too large");
  }
  return { before: net, after: best === net ? null : best, passes };
}

/** Rewrite only (no proof). Use `optimize` or prove the candidate with `equivalent` before using it. */
export function shrink(net: Netlist): Candidate {
  const it = shrinkSteps(net);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/** The same, yielding to the event loop every ~12 ms of work. */
export async function shrinkAsync(net: Netlist, onProgress?: (p: Progress) => void): Promise<Candidate> {
  const it = shrinkSteps(net);
  let t = Date.now();
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (Date.now() - t > 12) { onProgress?.(r.value); await new Promise<void>((res) => setTimeout(res, 0)); t = Date.now(); }
  }
}

export interface Optimized {
  before: Netlist;
  /** the netlist to use: the proven smaller one, or the original */
  net: Netlist;
  improved: boolean;
  saved: { nand: number; gates: number };
  proof: Equivalence | null;
  passes: string[];
  /** why the original was kept, when it was */
  kept?: string;
}

/** Shrink and prove, synchronously. Returns the original unless a smaller netlist is proved equivalent. */
export function optimize(net: Netlist): Optimized {
  const c = shrink(net);
  if (!c.after) return { before: net, net, improved: false, saved: { nand: 0, gates: 0 }, proof: null, passes: c.passes, kept: "no smaller equivalent found" };
  const proof = equivalent(net, c.after);
  if (!proof.equal) return { before: net, net, improved: false, saved: { nand: 0, gates: 0 }, proof, passes: c.passes, kept: "the candidate failed the equivalence check" };
  return { before: net, net: c.after, improved: true, saved: { nand: net.nand - c.after.nand, gates: net.gates - c.after.gates }, proof, passes: c.passes };
}

/** Shrink and prove without blocking a page: the rewrite yields as it goes, and a 2^24 proof runs in chunks. */
export async function optimizeAsync(net: Netlist, onProgress?: (p: Progress) => void): Promise<Optimized> {
  const c = await shrinkAsync(net, onProgress);
  if (!c.after) return { before: net, net, improved: false, saved: { nand: 0, gates: 0 }, proof: null, passes: c.passes, kept: "no smaller equivalent found" };
  onProgress?.({ done: 0, total: 1, stage: "proof" });
  const proof = await equivalentAsync(net, c.after);
  if (!proof.equal) return { before: net, net, improved: false, saved: { nand: 0, gates: 0 }, proof, passes: c.passes, kept: "the candidate failed the equivalence check" };
  return { before: net, net: c.after, improved: true, saved: { nand: net.nand - c.after.nand, gates: net.gates - c.after.gates }, proof, passes: c.passes };
}
