// Read-only against X Layer mainnet (Atlas, the default wallet), through the core and every adapter.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFuseboxToolset, ADDRESSES } from "../dist/index.js";
import { fuseboxTools } from "../dist/ai.js";
import { fuseboxLangchainTools } from "../dist/langchain.js";
import { startSeller, SUPPLIER } from "./_seller.mjs";

delete process.env.FUSEBOX_AGENT_KEY; delete process.env.FUSEBOX_WALLET; delete process.env.FUSEBOX_RPC;
const STRANGER = "0x2222222222222222222222222222222222222222";
const callOpts = { toolCallId: "t1", messages: [] };
let seller;
before(async () => { seller = await startSeller(); });
after(async () => { await seller?.close(); });

test("core: four tools, read-only, on Atlas", () => {
  const s = createFuseboxToolset();
  assert.deepEqual(s.tools.map((t) => t.name), ["fusebox_check", "fusebox_pay", "fusebox_status", "fusebox_fetch"]);
  assert.equal(s.readOnly, true);
  assert.equal(s.client.wallet, ADDRESSES.atlas);
  for (const t of s.tools) assert.ok(t.description.length > 80 && typeof t.schema.parse === "function", t.name);
  assert.match(s.tools[0].description, /before fusebox_pay/);
  assert.match(s.tools[0].description, /Breaker/);
  assert.match(s.tools[1].description, /human approver/);
});

test("core: the supplier passes, a stranger is stopped, pay refuses without a key", async () => {
  const { tools } = createFuseboxToolset();
  const [check, pay, status] = tools;
  const ok = await check.run({ to: SUPPLIER, amount: "0.05" });
  assert.equal(ok.data.allowed, true, ok.summary);
  assert.match(ok.summary, /Every fuse holds/);
  const no = await check.run({ to: STRANGER, amount: "2.5" });
  assert.equal(no.data.allowed, false);
  assert.deepEqual(no.data.fuses.filter((f) => f.verdict === "blew").map((f) => f.name), ["Payee Guard", "Breaker"]);
  const bad = await check.run({ to: "0x123", amount: "1" });
  assert.equal(bad.data.allowed, false); assert.match(bad.summary, /valid 0x address/);
  const p = await pay.run({ to: SUPPLIER, amount: "0.05", memo: "read-only" });
  assert.equal(p.data.paid, false); assert.equal(p.data.sent, false); assert.match(p.summary, /read-only/);
  const s = await status.run({});
  assert.match(s.summary, /USDT0 in the wallet/);
  assert.equal(s.data.fuses.length, 4);
});

test("core: fetch on a free URL, and an x402 price read-only (dry run: nothing paid)", async () => {
  const fetchTool = createFuseboxToolset().tools[3];
  const free = await fetchTool.run({ url: "https://fusebox-xlayer.vercel.app/api/block" });
  assert.equal(free.data.status, 200, free.summary); assert.match(free.summary, /no payment/);
  const paid = await fetchTool.run({ url: seller.url });
  assert.equal(paid.data.status, 402);
  assert.equal(paid.data.payment.paid, false);
  assert.equal(paid.data.payment.price, "0.01");
  assert.match(paid.summary, /Read-only client: .* costs 0\.01 USDT0; the fuses would pay 0\.01 USDT0/);
  const capped = await fetchTool.run({ url: seller.url, maxPrice: "0.001" });
  assert.match(capped.summary, /over the 0\.001 USDT0 you allowed/);
  const notUrl = await fetchTool.run({ url: "file:///etc/passwd" });
  assert.equal(notUrl.data.ok, false);
});

test("ai adapter: tools keyed by name; execute works read-only", async () => {
  const t = fuseboxTools();
  assert.deepEqual(Object.keys(t), ["fusebox_check", "fusebox_pay", "fusebox_status", "fusebox_fetch"]);
  const ok = await t.fusebox_check.execute({ to: SUPPLIER, amount: "0.05" }, callOpts);
  assert.equal(ok.data.allowed, true, ok.summary);
  const no = await t.fusebox_check.execute({ to: STRANGER, amount: "2.5" }, callOpts);
  assert.equal(no.data.allowed, false);
  const p = await t.fusebox_pay.execute({ to: SUPPLIER, amount: "0.05", memo: "x" }, callOpts);
  assert.equal(p.data.paid, false); assert.match(p.summary, /read-only/);
  const s = await t.fusebox_status.execute({}, callOpts);
  assert.match(s.summary, /prepaid fees/);
});

test("langchain adapter: check, status, pay (refused), fetch", async () => {
  const tools = fuseboxLangchainTools();
  const by = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.deepEqual(Object.keys(by), ["fusebox_check", "fusebox_pay", "fusebox_status", "fusebox_fetch"]);
  assert.match(await by.fusebox_check.invoke({ to: SUPPLIER, amount: "0.05" }), /^Every fuse holds/);
  assert.match(await by.fusebox_check.invoke({ to: STRANGER, amount: "2.5" }), /^Stopped: Payee Guard/);
  assert.match(await by.fusebox_status.invoke({}), /USDT0 in the wallet/);
  assert.match(await by.fusebox_pay.invoke({ to: SUPPLIER, amount: "0.05", memo: "x" }), /^Not paid: these tools are read-only/);
  assert.match(await by.fusebox_fetch.invoke({ url: seller.url }), /costs 0\.01 USDT0/);
  await assert.rejects(by.fusebox_check.invoke({ to: SUPPLIER }), /amount|Received tool input did not match/i);
});
