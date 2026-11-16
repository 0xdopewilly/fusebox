// fusebox_fetch over a real MCP client, on a fork: pays the honest demo seller, refuses the scam, honours max_price and dry_run.
//   FUSEBOX_RPC=http://127.0.0.1:8547 FUSEBOX_AGENT_KEY=0x… APP=http://localhost:3120 node test/x402.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
const APP = process.env.APP || "http://localhost:3120";
let fails = 0; const check = (n, ok, d = "") => { if (!ok) fails++; console.log((ok ? "PASS" : "FAIL") + "  " + n + (d ? "  · " + d : "")); };
const start = async (env) => { const c = new Client({ name: "x402-test", version: "0.0.0" }); await c.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../index.mjs", import.meta.url))], env })); return c; };
const call = async (c, args) => { const r = await c.callTool({ name: "fusebox_fetch", arguments: args }); return { err: !!r.isError, text: r.content[0].text, s: r.structuredContent ?? {} }; };

const payer = await start({ ...process.env });
const { tools } = await payer.listTools();
check("fusebox_fetch is listed", tools.some((t) => t.name === "fusebox_fetch"));
const paid = await call(payer, { url: APP + "/api/x402/prices" });
check("pays the honest seller and returns its body", !paid.err && paid.s.paid === true && paid.s.status === 200 && /Kano Cotton/.test(paid.s.body) && paid.s.settlement?.success === true, paid.text.split("\n")[0]);
const scam = await call(payer, { url: APP + "/api/x402/scam" });
check("refuses the scam before sending anything", !scam.err && scam.s.paid === false && !scam.s.tx && /Payee Guard/.test(scam.text), scam.text.split("\n")[0].slice(0, 140));
const capped = await call(payer, { url: APP + "/api/x402/prices", max_price: "0.001" });
check("max_price caps it", capped.s.paid === false && /over your 0.001/.test(capped.text));
const dry = await call(payer, { url: APP + "/api/x402/prices", dry_run: true });
check("dry_run reports price and verdict", dry.s.dry_run === true && dry.s.check?.allowed === true && dry.s.price === "0.01", dry.text.split("\n")[0]);
const free = await call(payer, { url: APP + "/api/block" });
check("a free URL comes straight back", free.s.status === 200 && free.s.paid === false);
await payer.close();

const { FUSEBOX_AGENT_KEY: _k, ...noKey } = process.env;
const reader = await start(noKey);
const ro = await call(reader, { url: APP + "/api/x402/prices" });
check("without a key it's a dry run", ro.s.dry_run === true && /Read-only/.test(ro.text));
await reader.close();
console.log("\n" + (fails ? fails + " FAILED" : "ALL PASSED"));
process.exit(fails ? 1 : 0);
