/**
 * Complete proofs for the 33-input Payee Guard socket: every one of the 2^33 inputs (8,589,934,592), through the
 * encoded TAP-02 bytes, by BDD equivalence with the rule written out from its definition.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Bdd } from "../src/optimize.ts";
import { circuitBdd, compare, orderFor, symGeK, symLe, symLeK, symOf, type Sym } from "../src/symbolic.ts";
import { PAYEE_GUARD, SOCKET_PAYEE_GUARD, bitsFromFields, fieldsFromBits } from "../src/fuses.ts";
import { STRICT_PAYEES } from "../src/rivals.ts";
import { beat, load } from "../src/tap02.ts";

const s = SOCKET_PAYEE_GUARD;
const order = () => orderFor(s.nIn, s.pins, [["age", "cooldown"], ["amount", "trial"]]);
const busOf = (bdd: Bdd, levelOf: number[]) => (name: string) => {
  const p = s.pins.find((q) => q.name === name)!;
  return Array.from({ length: p.width }, (_, k) => bdd.variable(levelOf[p.offset + k]));
};
/** listed AND (age >= cooldown OR amount <= trial) */
const payeeGuardRule = (z: Sym, p: (n: string) => number[]) => z.and(p("listed")[0], z.or(symLe(z, p("cooldown"), p("age")), symLe(z, p("amount"), p("trial"))));
/** listed AND age >= cooldown */
const strictRule = (z: Sym, p: (n: string) => number[]) => z.and(p("listed")[0], symLe(z, p("cooldown"), p("age")));

function proveAgainst(bytes: Uint8Array, rule: (z: Sym, p: (n: string) => number[]) => number) {
  const bdd = new Bdd(2_000_000), levelOf = order();
  const circuit = circuitBdd(bdd, bytes, s.nIn, levelOf);
  assert.notEqual(circuit, null);
  return compare(bdd, circuit!, rule(symOf(bdd), busOf(bdd, levelOf)), s.nIn, levelOf);
}

test("BDD comparators match plain unsigned comparison on every pair of 8-bit operands", () => {
  const bdd = new Bdd(1_000_000), z = symOf(bdd);
  // x and y interleaved from the top bit, as in the proofs
  const x = Array.from({ length: 8 }, (_, i) => bdd.variable(2 * (7 - i))), y = Array.from({ length: 8 }, (_, i) => bdd.variable(2 * (7 - i) + 1));
  const at = (a: number, b: number) => (lv: number) => { const bit = 7 - (lv >> 1); return lv & 1 ? (b >> bit) & 1 : (a >> bit) & 1; };
  const le = symLe(z, x, y);
  for (let a = 0; a < 256; a++) for (let b = 0; b < 256; b++) assert.equal(bdd.at(le, at(a, b)), +(a <= b), `${a} <= ${b}`);
  for (let k = 0; k < 256; k++) {
    const lk = symLeK(z, x, k), gk = symGeK(z, x, k);
    for (let a = 0; a < 256; a++) { assert.equal(bdd.at(lk, at(a, 0)), +(a <= k)); assert.equal(bdd.at(gk, at(a, 0)), +(a >= k)); }
  }
});

test("Payee Guard: proved on all 2^33 inputs through its bytes", () => {
  const r = proveAgainst(PAYEE_GUARD.build().bytes, payeeGuardRule);
  assert.equal(r.equal, true);
  assert.equal(r.mismatches, 0n);
});

test("Strict Payee Book (rival): proved on all 2^33 inputs through its bytes", () => {
  const r = proveAgainst(STRICT_PAYEES.build().bytes, strictRule);
  assert.equal(r.equal, true);
});

test("a wrong circuit is caught with a real counterexample and the exact number of wrong inputs", () => {
  // Payee Guard's circuit claimed for the strict rule: they differ exactly when listed, still cooling off
  // (age < cooldown) and within the trial (amount <= trial)
  const n = PAYEE_GUARD.build();
  const r = proveAgainst(n.bytes, strictRule);
  assert.equal(r.equal, false);
  assert.equal(r.mismatches, 32640n * 32896n); // C(256,2) cooling pairs × 256·257/2 trial pairs
  const f = fieldsFromBits(s, r.counterexample!);
  const got = beat(load(n.bytes, n.nIn, 1), [], bitsFromFields(s, f)).outputs[0];
  const want = STRICT_PAYEES.spec(f, []).out;
  assert.notEqual(got, want, JSON.stringify(f));
});
