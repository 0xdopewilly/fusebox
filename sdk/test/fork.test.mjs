// fusebox-sdk against a local X Layer fork (anvil on :8547 with --auto-impersonate, the app on :3120 for history()).
// Env: AGENT_KEY (the wallet's agent key), OWNER, SUPPLIER (a saved payee), APPROVER (seat 1 of the wallet).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Fusebox, ADDRESSES } from "../dist/index.js";

const RPC = "http://127.0.0.1:8547", { AGENT_KEY, OWNER, SUPPLIER, APPROVER } = process.env;
const STRANGER = "0x2222222222222222222222222222222222222222";
const cast = (...a) => execFileSync("cast", [...a, "--rpc-url", RPC], { encoding: "utf8" }).trim();
const reset = () => cast("send", ADDRESSES.atlas, "unfreeze()", "--from", OWNER, "--unlocked");
const reader = new Fusebox({ rpc: RPC, api: "http://localhost:3120" });
const agent = new Fusebox({ rpc: RPC, account: AGENT_KEY });

test("status: Atlas's line, balances and budgets", async () => {
  const s = await reader.status();
  assert.equal(s.wallet, ADDRESSES.atlas);
  assert.deepEqual(s.fuses.map((f) => f.name), ["Daily Cap", "Payee Guard", "Breaker", "Two of Three"]);
  assert.ok(Number(s.feeBalance) > 0 && s.limits.decisionsPerDay > 0 && s.decisions >= s.paid + s.stopped - 1);
});

test("check: a saved payee passes, a stranger is refused with the reasons", async () => {
  reset();
  const ok = await reader.check(SUPPLIER, "0.25");
  assert.equal(ok.allowed, true, ok.summary);
  const no = await reader.check(STRANGER, "1");
  assert.equal(no.allowed, false);
  assert.deepEqual(no.fuses.filter((f) => f.verdict === "blew").map((f) => f.name), ["Payee Guard", "Breaker"]);
  assert.match(no.summary, /not a saved payee/);
  await assert.rejects(reader.check("0x123", "1"), /valid 0x address/);
  await assert.rejects(reader.check(SUPPLIER, "-1"), /amount above 0/);
});

test("pay: refused payments aren't sent unless asked; a paid one returns its decision", async () => {
  await assert.rejects(reader.pay(SUPPLIER, "0.1", "x"), /Read-only/);
  const before = (await reader.status()).decisions;
  const skipped = await agent.pay(STRANGER, "1", "New supplier, urgent");
  assert.equal(skipped.sent, false); assert.equal(skipped.paid, false);
  assert.equal((await reader.status()).decisions, before, "nothing recorded when the check already said no");
  const paid = await agent.pay(SUPPLIER, "0.25", "Invoice SDK-1");
  assert.equal(paid.sent, true); assert.equal(paid.paid, true, paid.summary);
  assert.equal(paid.decisionId, before + 1);
  assert.ok(paid.fuses.every((f) => f.verdict === "pass"));
  const forced = await agent.pay(STRANGER, "1", "Recorded on purpose", { checkFirst: false });
  assert.equal(forced.sent, true); assert.equal(forced.paid, false);
  assert.ok((await reader.status()).fuses.find((f) => f.name === "Breaker").blown, "the stranger tripped the Breaker");
  reset();
});

test("approve: an approver signs off an exact payment; freeze: the agent stops everything", async () => {
  const approver = new Fusebox({ rpc: RPC, account: { address: APPROVER, type: "json-rpc" } });
  await approver.approve(SUPPLIER, "30");
  const mask = Number(cast("call", ADDRESSES.atlas, "approvalMaskOf(address,address,uint256)(uint256)", ADDRESSES.usdt0, SUPPLIER, "30000000").split(" ")[0]);
  assert.ok(mask & 1, "seat 1's approval is recorded");
  await agent.freeze();
  assert.equal((await reader.check(SUPPLIER, "0.1")).allowed, false, "frozen: even a saved payee is refused");
  reset();
});

test("watch: new decisions arrive as they land", async () => {
  const seen = [];
  const stop = reader.watch((d) => seen.push(d), { pollingInterval: 500 });
  await new Promise((r) => setTimeout(r, 1500));
  await agent.pay(SUPPLIER, "0.2", "Invoice SDK-2");
  for (let i = 0; i < 40 && !seen.length; i++) await new Promise((r) => setTimeout(r, 250));
  stop();
  assert.ok(seen.length >= 1, "a decision was seen");
  assert.equal(seen.at(-1).paid, true); assert.equal(seen.at(-1).amount, "0.2");
  assert.equal(seen.at(-1).fuses.length, 4);
});

test("history: every decision, oldest first", async () => {
  await new Promise((r) => setTimeout(r, 5000)); // the app's log reader catches up
  const h = await reader.history();
  const n = (await reader.status()).decisions;
  assert.equal(h.length, n);
  assert.ok(h.every((d, i) => i === 0 || d.id > h[i - 1].id));
  assert.equal(h.at(-1).memo === undefined, true);
});
