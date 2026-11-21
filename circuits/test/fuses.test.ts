/**
 * Every shipped fuse is checked through its *encoded TAP-02 bytes* (decoded by src/tap02.ts),
 * never through the builder's internal graph.
 *
 * - Daily Cap (24 inputs) and Two of Three (19 inputs): exhaustive, all 2^nIn vectors, bitsliced.
 * - Payee Guard (33 inputs): proved on all 2^33 by BDD equivalence in symbolic.test.ts; here, as a cross-check
 *   by simulation, exhaustive over each comparator's 2^16 operand pairs for both values of `listed` with the
 *   other block held at every boundary case, plus 4M random vectors.
 * - Breaker (1 LATCH): every (state, input) pair, plus scripted sequences.
 * - Repeat Guard (2 inputs): all 4 vectors, plus every gate stuck at 0 and at 1.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { APPROVAL_2OF3, BREAKER, DAILY_CAP, FUSES, PAYEE_GUARD, REPEAT_GUARD, bitsFromFields, fieldsFromBits, type FuseDesign } from "../src/fuses.ts";
import { beat, compileBitsliced, load, pack, unpack } from "../src/tap02.ts";

const LANE = [0xaaaaaaaa | 0, 0xcccccccc | 0, 0xf0f0f0f0 | 0, 0xff00ff00 | 0, 0xffff0000 | 0];

function loaded(f: FuseDesign) {
  const n = f.build();
  const c = load(n.bytes, n.nIn, n.nOut);
  return { n, c };
}

/** exhaustive check of a combinational fuse with nIn <= 30 */
function exhaustive(f: FuseDesign): number {
  const { c } = loaded(f);
  const nIn = c.nIn;
  assert.ok(nIn >= 5 && nIn <= 30);
  const ev = compileBitsliced(c);
  const words = new Int32Array(nIn);
  for (let i = 0; i < 5; i++) words[i] = LANE[i];
  const batches = 2 ** (nIn - 5);
  const pins = f.socket.pins;
  let mismatches = 0;
  for (let bIdx = 0; bIdx < batches; bIdx++) {
    for (let i = 5; i < nIn; i++) words[i] = (bIdx >>> (i - 5)) & 1 ? -1 : 0;
    const out = ev(words)[0];
    for (let lane = 0; lane < 32; lane++) {
      const idx = bIdx * 32 + lane;
      const fields: Record<string, number> = {};
      for (const p of pins) fields[p.name] = (idx >>> p.offset) & ((1 << p.width) - 1);
      const want = f.spec(fields, []).out;
      if (((out >>> lane) & 1) !== want) {
        if (mismatches++ < 5) console.error(f.key, "mismatch", fields, "want", want);
      }
    }
  }
  assert.equal(mismatches, 0, `${f.key}: ${mismatches} mismatches`);
  return batches * 32;
}

test("Daily Cap: all 2^24 vectors match spent + amount <= cap", () => {
  assert.equal(exhaustive(DAILY_CAP), 2 ** 24);
});

test("Two of Three: all 2^19 vectors match amount <= threshold OR 2 approvals", () => {
  assert.equal(exhaustive(APPROVAL_2OF3), 2 ** 19);
});

test("Payee Guard: block-exhaustive and 4M random vectors", () => {
  const { c } = loaded(PAYEE_GUARD);
  const ev = compileBitsliced(c);
  const s = PAYEE_GUARD.socket;
  const runBatch = (vecs: Record<string, number>[]) => {
    // pack up to 32 vectors into lanes
    const words = new Int32Array(s.nIn);
    vecs.forEach((v, lane) => {
      const bits = bitsFromFields(s, v);
      bits.forEach((bit, i) => {
        if (bit) words[i] |= 1 << lane;
      });
    });
    const out = ev(words)[0];
    vecs.forEach((v, lane) => {
      const want = PAYEE_GUARD.spec(v, []).out;
      if (((out >>> lane) & 1) !== want) assert.fail(`mismatch ${JSON.stringify(v)} want ${want}`);
    });
  };
  const edges = [0, 1, 127, 128, 254, 255];
  let count = 0;
  let batch: Record<string, number>[] = [];
  const pushV = (v: Record<string, number>) => {
    batch.push(v);
    count++;
    if (batch.length === 32) {
      runBatch(batch);
      batch = [];
    }
  };
  for (const listed of [0, 1])
    for (let age = 0; age < 256; age++)
      for (let cooldown = 0; cooldown < 256; cooldown++)
        for (const [amount, trial] of [
          [255, 0],
          [0, 254],
          [edges[(age + cooldown) % 6], edges[(age * 7 + cooldown) % 6]],
        ])
          pushV({ listed, age, cooldown, amount, trial });
  for (const listed of [0, 1])
    for (let amount = 0; amount < 256; amount++)
      for (let trial = 0; trial < 256; trial++)
        for (const [age, cooldown] of [
          [0, 255],
          [255, 0],
          [edges[(amount + trial) % 6], edges[(amount * 5 + trial) % 6]],
        ])
          pushV({ listed, age, cooldown, amount, trial });
  let seed = 0x9e3779b9;
  const r8 = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed & 0xff;
  };
  for (let i = 0; i < 4_000_000; i++) pushV({ listed: r8() & 1, age: r8(), cooldown: r8(), amount: r8(), trial: r8() });
  if (batch.length) runBatch(batch);
  assert.ok(count > 4_700_000, `${count} vectors`);
});

test("Breaker: every (state, input) pair and the scam story", () => {
  const { c, n } = loaded(BREAKER);
  assert.equal(c.nState, 1);
  assert.equal(n.latch, 1);
  for (let q = 0; q < 2; q++)
    for (let i = 0; i < 16; i++) {
      const bits = [i & 1, (i >> 1) & 1, (i >> 2) & 1, (i >> 3) & 1];
      const r = beat(c, [q], bits);
      const want = BREAKER.spec(fieldsFromBits(BREAKER.socket, bits), [q]);
      assert.deepEqual(r.outputs, [want.out], `q=${q} in=${i}`);
      assert.deepEqual(r.newState, want.newState, `q=${q} in=${i} state`);
    }
  // story: pay a known payee (ok), pay a stranger (blows), pay known again (still blown),
  // owner resets, pay known (ok); owner freezes, pay (blocked); set+clear together stays frozen
  const P = (suspect: number) => bitsFromFields(BREAKER.socket, { attempt: 1, suspect });
  const SET = bitsFromFields(BREAKER.socket, { set: 1 });
  const CLEAR = bitsFromFields(BREAKER.socket, { clear: 1 });
  const BOTH = bitsFromFields(BREAKER.socket, { set: 1, clear: 1 });
  let st = [0];
  const step = (inp: number[]) => {
    const r = beat(c, st, inp);
    st = r.newState;
    return r.outputs[0];
  };
  assert.equal(step(P(0)), 1);
  assert.equal(step(P(1)), 0, "stranger: fuse blows");
  assert.equal(step(P(0)), 0, "stays blown for known payees too");
  step(CLEAR);
  assert.equal(step(P(0)), 1, "owner reset");
  step(SET);
  assert.equal(step(P(0)), 0, "owner freeze");
  step(BOTH);
  assert.equal(step(P(0)), 0, "set wins over clear");
  step(CLEAR);
  assert.equal(step(P(0)), 1);
  // packed state is one byte, LSB = the latch
  assert.deepEqual(unpack(pack([1]), 1), [1]);
});

test("gate budget: every fuse stays small", () => {
  const budget: Record<string, number> = { "daily-cap": 108, "payee-guard": 79, breaker: 11, "approval-2of3": 46, "repeat-guard": 2 };
  for (const f of FUSES) {
    const n = f.build();
    assert.equal(n.gates, budget[f.key], `${f.key} gate count changed: ${n.gates}`);
    assert.equal(n.nIn, f.socket.nIn);
    assert.equal(n.nOut, f.socket.nOut);
    assert.equal(n.nState, f.nState);
    assert.ok(n.gates < 150);
  }
});

/**
 * Stuck-at fault coverage: force each gate's output to 0 and to 1 in turn; some test vector must then
 * disagree with the spec. Every gate is observable, so none is redundant (and the tests above would
 * catch a single wrong gate). Vectors sit on the decision boundaries, where faults show.
 */
test("stuck-at faults: every gate of every combinational fuse is observable", () => {
  const near = (x: number, d: number) => Math.min(255, Math.max(0, x + d));
  const vectors: Record<string, Record<string, number>[]> = { "daily-cap": [], "payee-guard": [], "approval-2of3": [] };
  for (let x = 0; x < 256; x++)
    for (let y = 0; y < 256; y++)
      for (const d of [-1, 0, 1]) {
        vectors["daily-cap"].push({ spent: x, amount: y, cap: near(x + y, d) });
        vectors["payee-guard"].push({ listed: 1, age: x, cooldown: near(x, d * y > 0 ? 1 : -1), amount: 255, trial: y % 255 });
        vectors["payee-guard"].push({ listed: (x ^ y) & 1, age: 0, cooldown: 255, amount: x, trial: near(x, d) % 255 });
        vectors["approval-2of3"].push({ approvals: y & 7, amount: x, threshold: near(x, d) % 255 });
      }
  for (const f of [DAILY_CAP, PAYEE_GUARD, APPROVAL_2OF3]) {
    const { c } = loaded(f);
    const base = 2 + c.nIn;
    const A = c.elements.map((e) => e.ins[0]);
    const B = c.elements.map((e) => e.ins[1]);
    const vs = vectors[f.key];
    const batches: Int32Array[] = [];
    const wants: number[] = [];
    for (let i = 0; i < vs.length; i += 32) {
      const w = new Int32Array(c.nIn);
      let want = 0;
      vs.slice(i, i + 32).forEach((v, lane) => {
        bitsFromFields(f.socket, v).forEach((bit, k) => {
          if (bit) w[k] |= 1 << lane;
        });
        want |= f.spec(v, []).out << lane;
      });
      batches.push(w);
      wants.push(want);
    }
    const lanesUsed = (i: number) => (i < batches.length - 1 || vs.length % 32 === 0 ? -1 : (1 << vs.length % 32) - 1);
    const s = new Int32Array(c.nSignals);
    const evalFault = (w: Int32Array, gate: number, stuck: number) => {
      s[0] = 0;
      s[1] = -1;
      for (let i = 0; i < c.nIn; i++) s[2 + i] = w[i];
      for (let k = 0; k < A.length; k++) s[base + k] = k === gate ? stuck : ~(s[A[k]] & s[B[k]]);
      return s[c.nSignals - 1];
    };
    // sanity: no fault means no mismatch
    batches.forEach((w, i) => assert.equal((evalFault(w, -1, 0) ^ wants[i]) & lanesUsed(i), 0));
    for (let g = 0; g < A.length; g++)
      for (const stuck of [0, -1]) {
        const seen = batches.some((w, i) => ((evalFault(w, g, stuck) ^ wants[i]) & lanesUsed(i)) !== 0);
        assert.ok(seen, `${f.key}: gate ${g} stuck-at-${stuck & 1} is not observable`);
      }
  }
});

test("Repeat Guard: all 4 vectors match NOT repeat OR cleared, and every gate is observable", () => {
  const { c } = loaded(REPEAT_GUARD);
  assert.equal(c.nIn, 2);
  const cases = [0, 1, 2, 3].map((i) => ({ repeat: i & 1, cleared: (i >> 1) & 1 }));
  for (const f of cases) {
    const r = beat(c, [], bitsFromFields(REPEAT_GUARD.socket, f));
    assert.equal(r.outputs[0], REPEAT_GUARD.spec(f, []).out, JSON.stringify(f));
  }
  assert.deepEqual(cases.map((f) => REPEAT_GUARD.spec(f, []).out), [1, 0, 1, 1], "only an uncleared repeat is stopped");
  // stuck-at faults over all 4 vectors, bitsliced in one word (lanes 0..3)
  const w = new Int32Array([0b1010, 0b1100]);
  const want = 0b1101;
  const base = 2 + c.nIn;
  const s = new Int32Array(c.nSignals);
  const run = (gate: number, stuck: number) => {
    s[0] = 0;
    s[1] = -1;
    s[2] = w[0];
    s[3] = w[1];
    c.elements.forEach((e, k) => { s[base + k] = k === gate ? stuck : ~(s[e.ins[0]] & s[e.ins[1]]); });
    return s[c.nSignals - 1] & 0b1111;
  };
  assert.equal(run(-1, 0), want);
  for (let g = 0; g < c.elements.length; g++) for (const stuck of [0, -1]) assert.notEqual(run(g, stuck), want, `gate ${g} stuck-at-${stuck & 1}`);
});
