/**
 * The rival fuses, checked through their encoded TAP-02 bytes like the shipped ones:
 * - Per-Payment Cap (24 inputs) and Lead Approver (19): all 2^nIn vectors, bitsliced.
 * - Strict Payee Book (33): every (listed, age, cooldown) triple, each with random amount/trial, plus 2M random vectors.
 * - Two-Strike Breaker (2 LATCHes): every (state, input) pair, plus the stories.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bitsFromFields, fieldsFromBits, type FuseDesign } from "../src/fuses.ts";
import { LEAD_APPROVER, PER_PAYMENT_CAP, RIVALS, STRICT_PAYEES, TWO_STRIKE_BREAKER } from "../src/rivals.ts";
import { beat, compileBitsliced, load } from "../src/tap02.ts";

const LANE = [0xaaaaaaaa | 0, 0xcccccccc | 0, 0xf0f0f0f0 | 0, 0xff00ff00 | 0, 0xffff0000 | 0];
const loaded = (f: FuseDesign) => { const n = f.build(); return { n, c: load(n.bytes, n.nIn, n.nOut) }; };

function exhaustive(f: FuseDesign): number {
  const { c } = loaded(f);
  const ev = compileBitsliced(c);
  const words = new Int32Array(c.nIn);
  for (let i = 0; i < 5; i++) words[i] = LANE[i];
  const batches = 2 ** (c.nIn - 5);
  let bad = 0;
  for (let bIdx = 0; bIdx < batches; bIdx++) {
    for (let i = 5; i < c.nIn; i++) words[i] = (bIdx >>> (i - 5)) & 1 ? -1 : 0;
    const out = ev(words)[0];
    for (let lane = 0; lane < 32; lane++) {
      const idx = bIdx * 32 + lane;
      const fields: Record<string, number> = {};
      for (const p of f.socket.pins) fields[p.name] = (idx >>> p.offset) & ((1 << p.width) - 1);
      if (((out >>> lane) & 1) !== f.spec(fields, []).out && bad++ < 5) console.error(f.key, fields);
    }
  }
  assert.equal(bad, 0, `${f.key}: ${bad} mismatches`);
  return batches * 32;
}

test("rivals fit their sockets: one output, the socket's input count, state only on the breaker", () => {
  for (const f of RIVALS) {
    const { n, c } = loaded(f);
    assert.equal(n.nIn, f.socket.nIn, f.key); assert.equal(n.nOut, 1, f.key);
    assert.equal(c.nState, f.nState, f.key);
    assert.ok(n.gates <= 512, `${f.key} within the registry's gate budget`);
  }
});

test("Per-Payment Cap: all 2^24 vectors match amount <= cap (today's spend ignored)", () => {
  assert.equal(exhaustive(PER_PAYMENT_CAP), 2 ** 24);
});

test("Lead Approver: all 2^19 vectors match amount <= threshold OR (seat 1 AND another)", () => {
  assert.equal(exhaustive(LEAD_APPROVER), 2 ** 19);
});

test("Strict Payee Book: every (listed, age, cooldown) with random amount/trial, and 2M random vectors", () => {
  const { c } = loaded(STRICT_PAYEES);
  let seed = 0x5eed1234;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) & 0xff;
  let n = 0;
  for (let listed = 0; listed < 2; listed++)
    for (let age = 0; age < 256; age++)
      for (let cooldown = 0; cooldown < 256; cooldown++) {
        const f = { listed, age, cooldown, amount: rnd(), trial: rnd() };
        const bits = bitsFromFields(STRICT_PAYEES.socket, f);
        assert.equal(beat(c, [], bits).outputs[0], STRICT_PAYEES.spec(f, []).out, JSON.stringify(f));
        n++;
      }
  for (let i = 0; i < 2_000_000; i++) {
    const bits = Array.from({ length: c.nIn }, () => rnd() & 1);
    const f = fieldsFromBits(STRICT_PAYEES.socket, bits);
    if (beat(c, [], bits).outputs[0] !== STRICT_PAYEES.spec(f, []).out) assert.fail(JSON.stringify(f));
  }
  assert.equal(n, 2 * 256 * 256);
});

test("Two-Strike Breaker: every (state, input) pair, then the stories", () => {
  const { c, n } = loaded(TWO_STRIKE_BREAKER);
  assert.equal(c.nState, 2); assert.equal(n.latch, 2);
  for (let st = 0; st < 4; st++)
    for (let i = 0; i < 16; i++) {
      const state = [st & 1, (st >> 1) & 1];
      const bits = [i & 1, (i >> 1) & 1, (i >> 2) & 1, (i >> 3) & 1];
      const r = beat(c, state, bits);
      const want = TWO_STRIKE_BREAKER.spec(fieldsFromBits(TWO_STRIKE_BREAKER.socket, bits), state);
      assert.deepEqual(r.outputs, [want.out], `state=${st} in=${i}`);
      assert.deepEqual(r.newState, want.newState, `state=${st} in=${i} next`);
    }
  const pay = (s: number[], stranger: boolean) => beat(c, s, bitsFromFields(TWO_STRIKE_BREAKER.socket, { set: 0, clear: 0, attempt: 1, suspect: stranger ? 1 : 0 }));
  const ctl = (s: number[], set: number, clear: number) => beat(c, s, bitsFromFields(TWO_STRIKE_BREAKER.socket, { set, clear, attempt: 0, suspect: 0 }));
  // a typo, then good payments keep flowing; a second stranger blows it; even the good payee is refused; reset
  let s = [0, 0];
  let r = pay(s, true); assert.equal(r.outputs[0], 0); s = r.newState; assert.deepEqual(s, [1, 0]);
  r = pay(s, false); assert.equal(r.outputs[0], 1, "one strike doesn't stop good payments"); s = r.newState;
  r = pay(s, true); assert.equal(r.outputs[0], 0); s = r.newState; assert.equal(s[1], 1, "second strike blows it");
  r = pay(s, false); assert.equal(r.outputs[0], 0, "blown: the good payee is refused too"); s = r.newState;
  r = ctl(s, 0, 1); s = r.newState; assert.deepEqual(s, [0, 0], "the owner's reset clears both");
  r = pay(s, false); assert.equal(r.outputs[0], 1);
  // freeze blows it at once, and wins over a reset in the same beat
  r = ctl([0, 0], 1, 1); assert.deepEqual(r.newState[1], 1);
});
