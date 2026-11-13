import { test } from "node:test";
import assert from "node:assert/strict";
import { Builder, ONE, ZERO, add, lessOrEqual, majority3, type Sig } from "../src/builder.ts";
import { keccak256Hex } from "../src/keccak.ts";
import { beat, bitsOf, load } from "../src/tap02.ts";

const enc = new TextEncoder();

test("keccak256 known vectors", () => {
  assert.equal(keccak256Hex(new Uint8Array()), "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  assert.equal(keccak256Hex(enc.encode("abc")), "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  // 136 bytes: exactly one rate block, so padding goes into a second block
  assert.equal(keccak256Hex(new Uint8Array(136)), "0x3a5912a7c5faa06ee4fe906253e339467a9ce87d533c65be3c15cb231cdb25f9");
});

/** evaluate a built netlist through the TAP-02 decoder (not through the builder) */
function run(b: Builder, outs: Sig[], inputs: number[], state: number[] = []) {
  const n = b.build("t", outs);
  const c = load(n.bytes, n.nIn, n.nOut);
  return { ...beat(c, state.length ? state : new Array(c.nState).fill(0), inputs), n };
}

test("constant folding, hashing and double negation", () => {
  const b = new Builder(2);
  const x = b.input(0);
  const y = b.input(1);
  assert.equal(b.nand(x, ZERO), ONE);
  assert.equal(b.not(b.not(x)), x);
  assert.equal(b.nand(x, y), b.nand(y, x));
  assert.equal(b.nand(x, b.not(x)), ONE);
  assert.equal(b.and(x, ONE), x);
  const r = run(b, [b.nand(x, y)], [1, 1]);
  assert.equal(r.n.gates, 1, "dead gates are removed");
  assert.deepEqual(r.outputs, [0]);
});

test("outputs that cannot sit at the tail are buffered", () => {
  // output is an input: needs a 2-gate buffer
  const b1 = new Builder(1);
  const r1 = run(b1, [b1.input(0)], [1]);
  assert.equal(r1.n.gates, 2);
  assert.deepEqual(r1.outputs, [1]);
  // output used by another output that comes first: buffered copies
  const b2 = new Builder(2);
  const g = b2.nand(b2.input(0), b2.input(1));
  const h = b2.not(g);
  for (const [i0, i1] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const r = run(b2, [h, g], [i0, i1]);
    assert.deepEqual(r.outputs, [i0 & i1, 1 - (i0 & i1)]);
  }
  // constant outputs
  const b3 = new Builder(1);
  assert.deepEqual(run(b3, [ONE, ZERO], [0]).outputs, [1, 0]);
});

test("LATCH with forward d: toggle flip-flop", () => {
  const b = new Builder(1);
  const q = b.latch();
  const t = b.xor(q, b.input(0));
  b.setD(q, t);
  const n = b.build("toggle", [t]);
  const c = load(n.bytes, 1, 1);
  assert.equal(c.nState, 1);
  let state = [0];
  const seq = [1, 1, 0, 1, 0, 0, 1];
  let expect = 0;
  for (const en of seq) {
    const r = beat(c, state, [en]);
    expect ^= en;
    assert.deepEqual(r.outputs, [expect]);
    assert.deepEqual(r.newState, [expect]);
    state = r.newState;
  }
});

test("arithmetic blocks are exact for every 6-bit pair", () => {
  const w = 6;
  const b = new Builder(2 * w);
  const x = b.bus(0, w);
  const y = b.bus(w, w);
  const le = lessOrEqual(b, x, y);
  const s = add(b, x, y);
  const outs = [le, ...s.sum, s.carry];
  const n = b.build("arith", outs);
  const c = load(n.bytes, n.nIn, n.nOut);
  for (let i = 0; i < 1 << w; i++)
    for (let j = 0; j < 1 << w; j++) {
      const r = beat(c, [], [...bitsOf(i, w), ...bitsOf(j, w)]);
      assert.equal(r.outputs[0], i <= j ? 1 : 0, `${i}<=${j}`);
      assert.deepEqual(r.outputs.slice(1), bitsOf(i + j, w + 1), `${i}+${j}`);
    }
});

test("lessOrEqual costs 2 + 5(n-1) NANDs; majority3 costs 6", () => {
  for (const w of [1, 4, 8, 12]) {
    const b = new Builder(2 * w);
    const n = b.build("le", [lessOrEqual(b, b.bus(0, w), b.bus(w, w))]);
    assert.equal(n.gates, 2 + 5 * (w - 1), `width ${w}`);
  }
  const b = new Builder(3);
  const m = majority3(b, b.input(0), b.input(1), b.input(2));
  const n = b.build("maj", [m.maj]);
  assert.equal(n.gates, 6);
  const c = load(n.bytes, 3, 1);
  for (let i = 0; i < 8; i++) {
    const bits = bitsOf(i, 3);
    assert.equal(beat(c, [], bits).outputs[0], bits[0] + bits[1] + bits[2] >= 2 ? 1 : 0);
  }
});

test("random circuits: builder output equals direct evaluation", () => {
  let seed = 12345;
  const rnd = (k: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % k;
  };
  for (let trial = 0; trial < 200; trial++) {
    const nIn = 1 + rnd(6);
    const b = new Builder(nIn);
    // shadow model: function from inputs to value for each signal
    const sigs: Sig[] = [ZERO, ONE, ...b.bus(0, nIn)];
    const fns = new Map<Sig, (v: number[]) => number>([
      [ZERO, () => 0],
      [ONE, () => 1],
    ]);
    for (let i = 0; i < nIn; i++) fns.set(2 + i, (v) => v[i]);
    for (let g = 0; g < 4 + rnd(30); g++) {
      const a = sigs[rnd(sigs.length)];
      const c = sigs[rnd(sigs.length)];
      const s = b.nand(a, c);
      const fa = fns.get(a)!;
      const fc = fns.get(c)!;
      if (!fns.has(s)) fns.set(s, (v) => 1 - (fa(v) & fc(v)));
      sigs.push(s);
    }
    const outs = [sigs[rnd(sigs.length)], sigs[rnd(sigs.length)]];
    const n = b.build("rand", outs);
    const circ = load(n.bytes, nIn, 2);
    for (let i = 0; i < 1 << nIn; i++) {
      const v = bitsOf(i, nIn);
      assert.deepEqual(beat(circ, [], v).outputs, outs.map((o) => fns.get(o)!(v)), `trial ${trial} input ${i}`);
    }
  }
});
