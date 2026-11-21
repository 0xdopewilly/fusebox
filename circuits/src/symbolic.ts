/**
 * Complete proofs for circuits too wide to run on every input (Payee Guard: 33 inputs, 8.6 billion vectors).
 *
 * The circuit, gate by gate from its own encoded TAP-02 bytes, and the rule, built from each condition's
 * definition (never from the circuit's gates), become BDDs over one variable order. Reduced ordered BDDs are
 * canonical, so equal BDDs mean the circuit and the rule give the same answer on every input. When they differ,
 * one real disagreeing input is picked and the number of disagreeing inputs is counted exactly.
 */
import { decode, OP_NAND } from "./tap02.ts";
import { Bdd } from "./optimize.ts";

/** Boolean functions as BDD nodes; buses are LSB first. */
export interface Sym { T: number; F: number; and(a: number, b: number): number; or(a: number, b: number): number; not(a: number): number }

export function symOf(bdd: Bdd): Sym {
  return { T: bdd.T, F: bdd.F, and: (a, b) => bdd.and(a, b), or: (a, b) => bdd.or(a, b), not: (a) => bdd.not(a) };
}

const eqBit = (z: Sym, a: number, b: number) => z.or(z.and(a, b), z.and(z.not(a), z.not(b)));

/** unsigned x <= y: the highest bit where they differ decides, so walk up from the lowest */
export function symLe(z: Sym, x: number[], y: number[]): number {
  let r = z.T;
  for (let i = 0; i < x.length; i++) r = z.or(z.and(z.not(x[i]), y[i]), z.and(eqBit(z, x[i], y[i]), r));
  return r;
}
/** unsigned x <= k */
export function symLeK(z: Sym, x: number[], k: number): number {
  let r = z.T;
  for (let i = 0; i < x.length; i++) r = (k >> i) & 1 ? z.or(z.not(x[i]), r) : z.and(z.not(x[i]), r);
  return r;
}
/** unsigned x >= k */
export function symGeK(z: Sym, x: number[], k: number): number {
  let r = z.T;
  for (let i = 0; i < x.length; i++) r = (k >> i) & 1 ? z.and(x[i], r) : z.or(x[i], r);
  return r;
}

export interface PinLike { name: string; offset: number; width: number }

/**
 * A variable order that keeps comparators small: 1-bit pins first, then each listed pair of equal-width buses
 * interleaved from the top bit, then anything left. Returns level-of-input-bit.
 */
export function orderFor(nIn: number, pins: PinLike[], pairs: [string, string][]): number[] {
  const levelOf = new Array<number>(nIn).fill(-1);
  let n = 0;
  for (const q of pins) if (q.width === 1) levelOf[q.offset] = n++;
  for (const [x, y] of pairs) {
    const px = pins.find((q) => q.name === x), py = pins.find((q) => q.name === y);
    if (!px || !py || px.width !== py.width) continue;
    for (let b = px.width - 1; b >= 0; b--) for (const q of [px, py]) if (levelOf[q.offset + b] < 0) levelOf[q.offset + b] = n++;
  }
  for (let i = 0; i < nIn; i++) if (levelOf[i] < 0) levelOf[i] = n++;
  return levelOf;
}

/** The circuit's single output as a BDD, decoded from its bytes; null if it holds anything but NANDs. */
export function circuitBdd(bdd: Bdd, bytes: Uint8Array, nIn: number, levelOf: number[]): number | null {
  const els = decode(bytes, nIn);
  if (!els.length) return null;
  const f: number[] = [bdd.F, bdd.T];
  for (let i = 0; i < nIn; i++) f.push(bdd.variable(levelOf[i]));
  for (const e of els) {
    if (e.op !== OP_NAND) return null;
    f[e.firstOut] = bdd.nand(f[e.ins[0]], f[e.ins[1]]);
  }
  return f[f.length - 1];
}

export interface Equivalence {
  equal: boolean;
  /** how many of the 2^nIn inputs disagree (0 when equal) */
  mismatches: bigint;
  /** one disagreeing input, as bits (input order), when they differ */
  counterexample?: number[];
}

/** Compare the circuit's BDD with the rule's. */
export function compare(bdd: Bdd, circuit: number, rule: number, nIn: number, levelOf: number[]): Equivalence {
  const diff = bdd.xor(circuit, rule);
  if (diff === bdd.F) return { equal: true, mismatches: 0n };
  const pick = bdd.pick(diff)!;
  return { equal: false, mismatches: bdd.count(diff, nIn), counterexample: Array.from({ length: nIn }, (_, i) => pick.get(levelOf[i]) ?? 0) };
}
