/**
 * The gate-golf optimizer. Every optimized netlist is re-checked here *through its encoded bytes* with the evaluator in
 * src/tap02.ts, independently of the optimizer's own proof, and the checker itself is shown to catch a broken circuit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Builder, lessOrEqual, majority3, ONE, ZERO, type Netlist, type Sig } from "../src/builder.ts";
import { FUSES } from "../src/fuses.ts";
import { RIVALS } from "../src/rivals.ts";
import { equivalent, optimize, optimizeAsync, shrink } from "../src/optimize.ts";
import { beat, compileBitsliced, load } from "../src/tap02.ts";

const LANE = [0xaaaaaaaa | 0, 0xcccccccc | 0, 0xf0f0f0f0 | 0, 0xff00ff00 | 0, 0xffff0000 | 0];
const konst = (k: number): Sig[] => Array.from({ length: 8 }, (_, i) => ((k >> i) & 1 ? ONE : ZERO));

/** independent exhaustive comparison of two combinational netlists (nIn <= 24) through their bytes */
function sameOnEveryInput(a: Netlist, b: Netlist): boolean {
  const ea = compileBitsliced(load(a.bytes, a.nIn, a.nOut)), eb = compileBitsliced(load(b.bytes, b.nIn, b.nOut));
  const w = new Int32Array(a.nIn);
  for (let i = 0; i < 5; i++) w[i] = LANE[i];
  for (let bIdx = 0; bIdx < 2 ** (a.nIn - 5); bIdx++) {
    for (let i = 5; i < a.nIn; i++) w[i] = (bIdx >>> (i - 5)) & 1 ? -1 : 0;
    const x = ea(w), y = eb(w);
    for (let j = 0; j < x.length; j++) if (x[j] !== y[j]) return false;
  }
  return true;
}

/** socket 1 (spent[8] amount[8] cap[8]) rules built the way Fuse Studio builds them */
function socket1(build: (b: Builder, p: { amount: Sig[]; cap: Sig[] }) => Sig): Netlist {
  const b = new Builder(24);
  return b.build("rule", [build(b, { amount: b.bus(8, 8), cap: b.bus(16, 8) })]);
}

test("shipped fuses and rivals: already minimal under these rewrites, and never changed", () => {
  for (const f of [...FUSES, ...RIVALS]) {
    const n = f.build();
    const r = optimize(n);
    assert.equal(r.net.gates <= n.gates, true, f.title);
    if (!r.improved) assert.equal(r.net.hex, n.hex, `${f.title}: the original bytes are returned untouched`);
  }
});

test("an implied condition is removed: amount <= cap/2 AND amount <= cap is the first comparator", () => {
  const n = socket1((b, p) => b.and(lessOrEqual(b, p.amount, p.cap), lessOrEqual(b, p.amount, [...p.cap.slice(1), ZERO])));
  const r = optimize(n);
  assert.ok(r.improved, r.passes.join("; "));
  assert.ok(r.net.gates < n.gates * 0.6, `${n.gates} -> ${r.net.gates}`);
  assert.equal(r.proof?.method, "exhaustive");
  assert.equal(r.proof?.assignments, 2 ** 24);
  assert.ok(sameOnEveryInput(n, r.net), "independent check: same output on all 2^24 inputs");
  assert.equal(r.net.nIn, n.nIn); assert.equal(r.net.nOut, n.nOut); assert.equal(r.net.latch, n.latch);
});

test("two fixed limits keep only the tighter one", () => {
  const n = socket1((b, p) => b.and(lessOrEqual(b, p.amount, konst(100)), lessOrEqual(b, p.amount, konst(50))));
  const r = optimize(n);
  assert.ok(r.improved && r.net.gates <= n.gates / 2, `${n.gates} -> ${r.net.gates}`);
  assert.ok(sameOnEveryInput(n, r.net));
});

test("a 33-input Payee Guard rule shrinks with a BDD proof over all 2^33 inputs", () => {
  const b = new Builder(33);
  const listed = b.input(0), age = b.bus(1, 8), cool = b.bus(9, 8);
  const out = b.and(listed, b.and(lessOrEqual(b, konst(72), age), b.and(lessOrEqual(b, konst(48), age), lessOrEqual(b, cool, age))));
  const n = b.build("pg", [out]);
  const r = optimize(n);
  assert.ok(r.improved, r.passes.join("; "));
  assert.equal(r.proof?.method, "bdd");
  assert.equal(r.proof?.assignments, 2 ** 33);
  // independent spot check through the bytes: 4M random vectors
  const ea = compileBitsliced(load(n.bytes, 33, 1)), eb = compileBitsliced(load(r.net.bytes, 33, 1));
  let seed = 99; const w = new Int32Array(33);
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  for (let k = 0; k < 131072; k++) { for (let i = 0; i < 33; i++) w[i] = rnd(); assert.equal(ea(w)[0], eb(w)[0]); }
});

test("socket 4: seat 1 AND at least 1 of 3 is just seat 1", () => {
  const b = new Builder(19);
  const [a0, a1, a2] = b.bus(16, 3);
  const n = b.build("s4", [b.and(a0, b.or(a0, b.or(a1, a2)))]);
  const r = optimize(n);
  assert.ok(r.improved && r.net.gates <= 2, `${n.gates} -> ${r.net.gates}`);
  assert.ok(sameOnEveryInput(n, r.net));
  // and the default Studio rule for the socket loses its redundancy too
  const b2 = new Builder(19);
  const amount = b2.bus(0, 8), threshold = b2.bus(8, 8), [x0, x1, x2] = b2.bus(16, 3);
  const n2 = b2.build("s4d", [b2.or(lessOrEqual(b2, amount, threshold), b2.and(x0, majority3(b2, x0, x1, x2).maj))]);
  const r2 = optimize(n2);
  assert.ok(r2.improved, `${n2.gates} -> ${r2.net.gates}`);
  assert.ok(sameOnEveryInput(n2, r2.net));
});

test("sequential: latches are kept in place and every (state, input) pair agrees", () => {
  // a breaker with a redundant re-derivation of its trip signal
  const b = new Builder(4);
  const [set, clear, attempt, suspect] = b.bus(0, 4);
  const trip = b.and(attempt, suspect), trip2 = b.and(b.and(attempt, suspect), b.or(attempt, suspect));
  const q = b.latch();
  b.setD(q, b.or(set, b.or(trip2, b.and(q, b.not(clear)))));
  const n = b.build("brk", [b.and(b.not(q), b.not(trip))]);
  const r = optimize(n);
  assert.equal(r.net.latch, n.latch);
  assert.equal(r.net.nState, n.nState);
  const ca = load(n.bytes, 4, 1), cb = load(r.net.bytes, 4, 1);
  for (let st = 0; st < 2 ** n.nState; st++) for (let i = 0; i < 16; i++) {
    const state = Array.from({ length: n.nState }, (_, k) => (st >> k) & 1), ins = [0, 1, 2, 3].map((k) => (i >> k) & 1);
    const x = beat(ca, state, ins), y = beat(cb, state, ins);
    assert.deepEqual(y.outputs, x.outputs); assert.deepEqual(y.newState, x.newState);
  }
  assert.ok(r.improved && r.net.gates < n.gates, `${n.gates} -> ${r.net.gates}`);
});

test("the checker catches a circuit that differs on a single input", () => {
  const good = socket1((b, p) => lessOrEqual(b, p.amount, p.cap));
  // amount < cap instead of amount <= cap: differs only where amount == cap
  const b = new Builder(24);
  const bad = b.build("bad", [b.not(lessOrEqual(b, b.bus(16, 8), b.bus(8, 8)))]);
  const e = equivalent(good, bad);
  assert.equal(e.equal, false);
  assert.ok(e.example, "a counterexample is reported");
  const amount = e.example!.inputs.slice(8, 16).reduce((v, bit, i) => v | (bit << i), 0), cap = e.example!.inputs.slice(16, 24).reduce((v, bit, i) => v | (bit << i), 0);
  assert.equal(amount, cap, "the counterexample is a case where the two really differ");
  assert.equal(equivalent(good, good).equal, true);
});

test("a different interface is never equivalent", () => {
  const a = socket1((b, p) => lessOrEqual(b, p.amount, p.cap));
  const b = new Builder(19);
  const n = b.build("x", [lessOrEqual(b, b.bus(0, 8), b.bus(8, 8))]);
  assert.equal(equivalent(a, n).equal, false);
});

test("the async path gives the same answer as the sync one", async () => {
  const n = socket1((b, p) => b.and(lessOrEqual(b, p.amount, konst(100)), lessOrEqual(b, p.amount, konst(50))));
  const [x, y] = [optimize(n), await optimizeAsync(n)];
  assert.equal(y.net.hex, x.net.hex);
  assert.equal(y.proof?.equal, true);
  assert.equal(shrink(n).after?.hex, x.net.hex);
});
