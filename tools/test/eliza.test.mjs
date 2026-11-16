// ElizaOS plugin: each action's validate + handler and the provider, with a minimal mock runtime, read-only on mainnet.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fuseboxPluginDefault, { fuseboxPlugin, extractFromText } from "../dist/eliza.js";
import { startSeller, SUPPLIER } from "./_seller.mjs";

delete process.env.FUSEBOX_AGENT_KEY;
const STRANGER = "0x2222222222222222222222222222222222222222";
const action = (n) => fuseboxPlugin.actions.find((a) => a.name === n);
const msg = (text) => ({ entityId: "00000000-0000-0000-0000-000000000001", roomId: "00000000-0000-0000-0000-000000000002", content: { text } });
function runtime(settings = {}, useModel) {
  const rt = { getSetting: (k) => settings[k] ?? null, modelCalls: [] };
  if (useModel) rt.useModel = async (type, params) => { rt.modelCalls.push({ type, params }); return useModel(params); };
  return rt;
}
async function run(a, rt, text) {
  const said = [];
  const result = await a.handler(rt, msg(text), undefined, {}, async (c) => { said.push(c); return []; });
  return { result, said };
}
let seller;
before(async () => { seller = await startSeller(); });
after(async () => { await seller?.close(); });

test("plugin shape: four actions, one provider, default export", () => {
  assert.equal(fuseboxPluginDefault, fuseboxPlugin);
  assert.equal(fuseboxPlugin.name, "fusebox");
  assert.deepEqual(fuseboxPlugin.actions.map((a) => a.name), ["FUSEBOX_CHECK", "FUSEBOX_PAY", "FUSEBOX_STATUS", "FUSEBOX_FETCH"]);
  assert.deepEqual(fuseboxPlugin.providers.map((p) => p.name), ["FUSEBOX_WALLET"]);
  for (const a of fuseboxPlugin.actions) assert.ok(a.examples?.length && a.similes?.length && typeof a.validate === "function", a.name);
});

test("text fallback: address, amount next to a currency, URL", () => {
  const f = extractFromText(`Invoice INV-7801: pay 2.5 USDT0 to 0x69dB89385E8a69278a49335C432d0c70ec86A6C4, details at https://example.com/inv/7801.`);
  assert.equal(f.to, SUPPLIER); assert.equal(f.amount, "2.5"); assert.equal(f.url, "https://example.com/inv/7801");
  assert.equal(extractFromText("send $12 to 0x2222222222222222222222222222222222222222").amount, "12");
});

test("FUSEBOX_CHECK: validate wants an address; with the object model and without it", async () => {
  const a = action("FUSEBOX_CHECK");
  assert.equal(await a.validate(runtime(), msg("how are the fuses?")), false);
  const text = `Would the fuses let you pay 0.05 USDT0 to ${SUPPLIER}?`;
  assert.equal(await a.validate(runtime(), msg(text)), true);
  // the object model pulls the fields
  const rtModel = runtime({}, () => ({ to: SUPPLIER, amount: "0.05" }));
  const m = await run(a, rtModel, text);
  assert.equal(rtModel.modelCalls[0].type, "OBJECT_SMALL");
  assert.equal(m.result.success, true); assert.equal(m.result.data.allowed, true);
  assert.match(m.said[0].text, /^Every fuse holds/); assert.deepEqual(m.said[0].actions, ["FUSEBOX_CHECK"]);
  // a made-up address from the model is ignored in favour of the one in the message
  const liar = runtime({}, () => ({ to: STRANGER, amount: "0.05" }));
  const l = await run(a, liar, text);
  assert.equal(l.result.data.to, SUPPLIER);
  // no model: the regex fallback
  const s = await run(a, runtime(), `Check 2.5 USDT0 to ${STRANGER}`);
  assert.equal(s.result.data.allowed, false); assert.match(s.said[0].text, /^Stopped: Payee Guard/);
  // nothing to go on
  const n = await run(a, runtime(), "check 0x0000000000000000000000000000000000000001 please");
  assert.equal(n.result.success, false); assert.match(n.said[0].text, /an amount/);
});

test("FUSEBOX_PAY without a key: not offered, and refuses if called anyway", async () => {
  const a = action("FUSEBOX_PAY");
  const text = `Pay invoice INV-7801: 0.05 USDT0 to ${SUPPLIER}`;
  assert.equal(await a.validate(runtime(), msg(text)), false);
  assert.equal(await a.validate(runtime({ FUSEBOX_AGENT_KEY: "0x" + "11".repeat(32) }), msg(text)), true);
  const r = await run(a, runtime(), text);
  assert.equal(r.result.success, false); assert.match(r.said[0].text, /read-only/);
});

test("FUSEBOX_STATUS and the provider", async () => {
  const rt = runtime();
  assert.equal(await action("FUSEBOX_STATUS").validate(rt, msg("status?")), true);
  const r = await run(action("FUSEBOX_STATUS"), rt, "How is the wallet?");
  assert.equal(r.result.success, true); assert.match(r.said[0].text, /USDT0 in the wallet/);
  const p = await fuseboxPlugin.providers[0].get(rt, msg("hi"), { values: {}, data: {}, text: "" });
  assert.match(p.text, /^# Fusebox wallet 0x0Db0457715a6445D8a65F820d717a6B39Be66800/);
  assert.match(p.text, /Daily Cap, Payee Guard, Breaker, Two of Three/);
  assert.ok(Number(p.values.fuseboxBalance) >= 0);
});

test("FUSEBOX_FETCH: validate wants a URL; read-only reports the x402 price", async () => {
  const a = action("FUSEBOX_FETCH");
  assert.equal(await a.validate(runtime(), msg("get the prices")), false);
  const text = `Get Kano Cotton's price sheet from ${seller.url}`;
  assert.equal(await a.validate(runtime(), msg(text)), true);
  const r = await run(a, runtime(), text);
  assert.equal(r.result.success, false); // 402, nothing paid
  assert.match(r.said[0].text, /costs 0\.01 USDT0; the fuses would pay/);
});
