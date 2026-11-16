// Paying through every adapter on a local X Layer fork, plus a full x402 round trip verified on the fork.
// Needs: anvil --fork-url https://rpc.xlayer.tech --port 8549 --chain-id 196 --auto-impersonate, and AGENT_KEY (Atlas's agent).
import { test as nodeTest, before, after } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, keccak256, pad, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createFuseboxToolset, ADDRESSES } from "../dist/index.js";
import { fuseboxTools } from "../dist/ai.js";
import { fuseboxLangchainTools } from "../dist/langchain.js";
import { fuseboxPlugin } from "../dist/eliza.js";
import { startSeller, SUPPLIER } from "./_seller.mjs";

const RPC = process.env.FORK_RPC || "http://127.0.0.1:8549";
const KEY = process.env.AGENT_KEY;
// without the agent key (and a fork on :8549) these are skipped, so `npm test` still runs the read-only suites
const test = KEY ? nodeTest : (name) => nodeTest(name, { skip: "set AGENT_KEY and run anvil --fork-url … --port 8549 --chain-id 196 --auto-impersonate" }, () => {});
const opts = { rpc: RPC, agentKey: KEY };

const rpc = async (method, params = []) => { const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(`${method}: ${j.error.message}`); return j.result; };
const callOpts = { toolCallId: "t", messages: [] };
let seller, scamSeller;

before(async () => {
  if (!KEY) return;
  assert.equal(await rpc("eth_chainId"), "0xc4", "the fork should report chain 196");
  // a new day: daily counters reset and the supplier is long past any cooling-off
  await rpc("evm_increaseTime", [100000]); await rpc("evm_mine");
  await rpc("anvil_setBalance", [privateKeyToAccount(KEY.startsWith("0x") ? KEY : `0x${KEY}`).address, toHex(10n ** 18n)]);
  // Atlas holds 0.1 USDT0 on mainnet; give it 10 on the fork (USDT0 balances live in storage slot 51)
  const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [ADDRESSES.atlas, 51n]));
  await rpc("anvil_setStorageAt", [ADDRESSES.usdt0, slot, pad(toHex(10_000_000n), { size: 32 })]);
  await rpc("evm_mine");
  // a fresh fork fetches every slot from upstream on first touch, which can outlast a client timeout: read until warm
  const warm = createFuseboxToolset({ rpc: RPC });
  for (let i = 0; i < 6; i++) {
    try { await warm.tools[2].run({}); await warm.tools[0].run({ to: SUPPLIER, amount: "0.05" }); break; } catch (e) { if (i === 5) throw e; }
  }
  seller = await startSeller({ rpc: RPC });
  scamSeller = await startSeller({ rpc: RPC, price: "3", payTo: "0x2222222222222222222222222222222222222222" });
});
after(async () => { await seller?.close(); await scamSeller?.close(); });

test("the fork is ready: Atlas funded, every fuse closed, supplier passes", async () => {
  const { tools } = createFuseboxToolset(opts);
  const s = await tools[2].run({});
  assert.equal(Number(s.data.balance), 10, s.summary);
  assert.match(s.summary, /Every fuse is closed/);
  const c = await tools[0].run({ to: SUPPLIER, amount: "0.05" });
  assert.equal(c.data.allowed, true, c.summary);
});

test("core: pays 0.05 USDT0 to the supplier", async () => {
  const r = await createFuseboxToolset(opts).tools[1].run({ to: SUPPLIER, amount: "0.05", memo: "Invoice TOOLS-CORE" });
  assert.equal(r.data.paid, true, r.summary); assert.equal(r.data.sent, true);
  assert.match(r.summary, /^Paid 0\.05 USDT0/); assert.ok(r.data.tx && typeof r.data.decisionId === "number");
});

test("ai adapter: fusebox_pay pays", async () => {
  const r = await fuseboxTools(opts).fusebox_pay.execute({ to: SUPPLIER, amount: "0.05", memo: "Invoice TOOLS-AI" }, callOpts);
  assert.equal(r.data.paid, true, r.summary);
});

test("langchain adapter: fusebox_pay pays", async () => {
  const pay = fuseboxLangchainTools(opts).find((t) => t.name === "fusebox_pay");
  const out = await pay.invoke({ to: SUPPLIER, amount: "0.05", memo: "Invoice TOOLS-LC" });
  assert.match(out, /^Paid 0\.05 USDT0 to 0x69dB89385E8a69278a49335C432d0c70ec86A6C4 \(decision #\d+\)/);
  assert.match(out, /"paid": true/);
});

test("eliza plugin: FUSEBOX_PAY pays (text fallback, key from settings)", async () => {
  const settings = { FUSEBOX_AGENT_KEY: KEY, FUSEBOX_RPC: RPC };
  const rt = { getSetting: (k) => settings[k] ?? null };
  const a = fuseboxPlugin.actions.find((x) => x.name === "FUSEBOX_PAY");
  const m = { entityId: "e", roomId: "r", content: { text: `Pay invoice TOOLS-ELIZA: 0.05 USDT0 to Kano Cotton, ${SUPPLIER}` } };
  assert.equal(await a.validate(rt, m), true);
  const said = [];
  const res = await a.handler(rt, m, undefined, {}, async (c) => { said.push(c); return []; });
  assert.equal(res.success, true, res.text); assert.equal(res.data.paid, true);
  assert.match(said[0].text, /^Paid 0\.05 USDT0/);
});

test("x402: fusebox_fetch pays the price through the fuses, the seller verifies it on the fork and serves; the proof can't be reused", async () => {
  // record the header the SDK sends on the retry, to replay it afterwards
  const real = globalThis.fetch; let proof = null;
  globalThis.fetch = async (u, init) => { const h = new Headers(init?.headers); if (h.get("PAYMENT-SIGNATURE")) proof = h.get("PAYMENT-SIGNATURE"); return real(u, init); };
  let r;
  try { r = await createFuseboxToolset(opts).tools[3].run({ url: seller.url }); } finally { globalThis.fetch = real; }
  assert.equal(r.data.status, 200, r.summary);
  assert.equal(r.data.payment.paid, true);
  assert.equal(r.data.payment.price, "0.01");
  assert.equal(r.data.payment.settlement.success, true);
  assert.match(r.data.body, /Kano Cotton/);
  assert.match(r.summary, /^Paid 0\.01 USDT0 to 0x69dB89385E8a69278a49335C432d0c70ec86A6C4 for http/);
  assert.ok(proof, "a PAYMENT-SIGNATURE header was sent");
  const again = await fetch(seller.url, { headers: { "PAYMENT-SIGNATURE": proof } });
  assert.equal(again.status, 402);
  assert.match((await again.json()).error, /already bought a response/);
});

test("x402: a price to a stranger is refused by the fuses and nothing is sent", async () => {
  const set = createFuseboxToolset(opts);
  const before = (await set.tools[2].run({})).data.decisions;
  const r = await set.tools[3].run({ url: scamSeller.url });
  assert.equal(r.data.status, 402);
  assert.equal(r.data.payment.paid, false);
  assert.match(r.summary, /^Not paid for .*: Not sent\. Stopped: Payee Guard/);
  assert.equal((await set.tools[2].run({})).data.decisions, before, "nothing recorded on-chain");
});
