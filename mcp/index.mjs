#!/usr/bin/env node
// fusebox-mcp: MCP tools for an AI agent that pays through a Fusebox wallet on X Layer.
//   fusebox_check   dry-run a payment against every fuse (free, read-only)
//   fusebox_pay     pay through the fuses with the agent key (needs FUSEBOX_AGENT_KEY)
//   fusebox_status  the wallet's balance, fee balance, fuses and today's spend
// Env: FUSEBOX_WALLET (default: Atlas, the public demo wallet), FUSEBOX_AGENT_KEY (optional; without it the
// server is read-only), FUSEBOX_RPC (default https://rpc.xlayer.tech).
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPublicClient, createWalletClient, decodeEventLog, defineChain, formatUnits, getAddress, http, isAddress, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ABI = JSON.parse(readFileSync(new URL("./abi.json", import.meta.url), "utf8"));
const ATLAS = "0x0Db0457715a6445D8a65F820d717a6B39Be66800";
const USDT0 = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const RPC = process.env.FUSEBOX_RPC || "https://rpc.xlayer.tech";
const WALLET = getAddress(process.env.FUSEBOX_WALLET || ATLAS);
const KEY = process.env.FUSEBOX_AGENT_KEY;
const EXPLORER = "https://www.oklink.com/xlayer";
const chain = defineChain({ id: 196, name: "X Layer", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } });
const pub = createPublicClient({ chain, transport: http(RPC), batch: { multicall: true } });
const agent = KEY ? privateKeyToAccount(KEY.startsWith("0x") ? KEY : `0x${KEY}`) : null;
const signer = agent ? createWalletClient({ chain, transport: http(RPC), account: agent }) : null;
const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }];
const SOCKET = { 1: ["daily-cap", "Daily Cap"], 2: ["payee-guard", "Payee Guard"], 3: ["breaker", "Breaker"], 4: ["approval-2of3", "Two of Three"] };
const STATUS = ["pass", "blew", "failed", "untrusted"];
const W = { address: WALLET, abi: ABI.wallet };
const usd = (v) => formatUnits(v, 6);

async function fuses() {
  const n = Number(await pub.readContract({ ...W, functionName: "fuseCount" }));
  return Promise.all(Array.from({ length: n }, async (_, i) => {
    const s = await pub.readContract({ ...W, functionName: "slotAt", args: [BigInt(i)] });
    const spent = await pub.readContract({ ...W, functionName: "spentToday", args: [BigInt(i)] });
    const [key, name] = SOCKET[Number(s.socket)] ?? [`socket-${s.socket}`, `Fuse ${i + 1}`];
    return { slot: i, key, name, circuitId: Number(s.circuitId), processor: s.processor, a: Number(s.params.a), b: Number(s.params.b), latched: s.nState > 0 && s.state !== "0x" && BigInt(s.state) !== 0n, spentToday: Number(usd(spent)) };
  }));
}

/** Why each fuse answered the way it did, in plain words. */
async function explain(fs, status, to, amount) {
  const [since, mask] = await Promise.all([
    pub.readContract({ ...W, functionName: "payeeAddedAt", args: [to] }),
    pub.readContract({ ...W, functionName: "approvalMaskOf", args: [USDT0, to, amount] }),
  ]);
  const amt = Number(usd(amount)), hours = since ? (Date.now() / 1000 - Number(since)) / 3600 : 0;
  const approvals = [0, 1, 2].filter((b) => (Number(mask) >> b) & 1).length;
  return fs.map((f, i) => {
    const st = STATUS[status[i]] ?? "failed", ok = st === "pass";
    let why;
    if (st === "failed") why = "the circuit call failed, so the fuse fails closed";
    else if (st === "untrusted") why = "TapeOut's processor code changed and isn't attested, so the fuse fails closed";
    else if (f.key === "daily-cap") why = ok ? `within today's cap (${Math.max(0, f.a - f.spentToday)} of ${f.a} USDT0 left)` : `${amt} USDT0 would pass today's ${f.a} USDT0 cap (${f.spentToday} spent)`;
    else if (f.key === "payee-guard") why = ok ? (since && hours >= f.a ? "a saved payee, past its cooling-off" : `saved ${hours.toFixed(1)} h ago, still cooling off, but ${amt} USDT0 is within the ${f.b} USDT0 trial`) : !since ? "not a saved payee" : `saved ${hours.toFixed(1)} h ago and still cooling off (${f.a} h); ${amt} USDT0 is over the ${f.b} USDT0 trial`;
    else if (f.key === "breaker") why = f.latched ? "already blown; nothing pays until the owner resets it" : ok ? "not tripped" : "a payment to a stranger trips it, and it stays blown until the owner resets it";
    else if (f.key === "approval-2of3") why = ok ? (amt > f.a ? `over ${f.a} USDT0 and approved by ${approvals} of 3` : `under the ${f.a} USDT0 approval threshold`) : `over ${f.a} USDT0: needs two of three approvers, has ${approvals}`;
    return { fuse: f.name, circuit: `#${f.circuitId}`, verdict: ok ? "holds" : "blew", why };
  });
}

const parseTo = (to) => { if (!isAddress(to, { strict: false })) throw new Error(`"${to}" isn't a valid 0x address.`); return getAddress(to.toLowerCase()); };
const parseAmount = (a) => { if (!/^\d{1,9}(\.\d{1,6})?$/.test(String(a)) || Number(a) <= 0) throw new Error(`"${a}" isn't an amount above 0 with up to 6 decimals.`); return parseUnits(String(a), 6); };
const text = (obj, summary) => ({ content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(obj, null, 2)}` }], structuredContent: obj });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: e.message || String(e) }] });

const server = new McpServer({ name: "fusebox", version: "0.1.0" });

server.registerTool("fusebox_check", {
  title: "Check a payment against the fuses",
  description: `Dry-run a USDT0 payment from the Fusebox wallet ${WALLET} on X Layer. Every fuse (TapeOut circuits) answers yes or no, with the reason. Free and read-only; nothing moves. Call this before fusebox_pay: a blocked payment still costs fees and can blow the Breaker.`,
  inputSchema: { to: z.string().describe("Payee address (0x…)"), amount: z.string().describe("Amount in USDT0, e.g. \"2.5\"") },
}, async ({ to, amount }) => {
  try {
    const payee = parseTo(to), amt = parseAmount(amount);
    const [[allowed, status], fs, block] = await Promise.all([pub.readContract({ ...W, functionName: "check", args: [USDT0, payee, amt] }), fuses(), pub.getBlockNumber()]);
    const verdicts = await explain(fs, status, payee, amt);
    const no = verdicts.filter((v) => v.verdict === "blew");
    const summary = allowed ? `Every fuse holds: the wallet would pay ${amount} USDT0 to ${payee}.` : `Stopped: ${no.map((v) => `${v.fuse} (${v.why})`).join("; ")}. Nothing would move.`;
    return text({ allowed, wallet: WALLET, to: payee, amount, block: Number(block), fuses: verdicts }, summary);
  } catch (e) { return fail(e); }
});

server.registerTool("fusebox_pay", {
  title: "Pay through the fuses",
  description: `Ask the Fusebox wallet ${WALLET} to pay in USDT0 on X Layer. Every fuse decides in the same transaction; the money moves only if all of them say yes. The memo is recorded on-chain but no fuse reads it. Requires FUSEBOX_AGENT_KEY.`,
  inputSchema: { to: z.string().describe("Payee address (0x…)"), amount: z.string().describe("Amount in USDT0, e.g. \"0.05\""), memo: z.string().max(200).describe("One line: what this payment is for") },
}, async ({ to, amount, memo }) => {
  try {
    if (!signer) throw new Error("This server is read-only: set FUSEBOX_AGENT_KEY to the agent's private key to pay.");
    const payee = parseTo(to), amt = parseAmount(amount);
    if (!(await pub.readContract({ ...W, functionName: "isAgent", args: [agent.address] }))) throw new Error(`${agent.address} isn't an agent of ${WALLET}.`);
    const hash = await signer.writeContract({ ...W, functionName: "pay", args: [USDT0, payee, amt, memo], gas: 3_000_000n });
    const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (r.status !== "success") throw new Error(`The transaction reverted: ${EXPLORER}/tx/${hash}`);
    let d;
    for (const l of r.logs) { try { const ev = decodeEventLog({ abi: ABI.wallet, data: l.data, topics: l.topics }); if (ev.eventName === "Decision") d = ev.args; } catch {} }
    const fs = await fuses();
    const verdicts = fs.map((f, i) => ({ fuse: f.name, verdict: STATUS[d.status[i]] === "pass" ? "holds" : "blew" }));
    const blew = verdicts.filter((v) => v.verdict === "blew").map((v) => v.fuse);
    const out = { paid: d.allowed, decision: Number(d.decisionId), to: payee, amount, memo, fuses: verdicts, feePaid: usd(d.feePaid), tx: `${EXPLORER}/tx/${hash}` };
    const summary = d.allowed ? `Paid ${amount} USDT0 to ${payee} (decision #${out.decision}). Fees ${out.feePaid} USDT0. ${out.tx}`
      : `Stopped by ${blew.join(", ")}: nothing moved (decision #${out.decision}). Ask the wallet's owner before trying again. ${out.tx}`;
    return text(out, summary);
  } catch (e) { return fail(e); }
});

server.registerTool("fusebox_status", {
  title: "Wallet status",
  description: `The Fusebox wallet ${WALLET}: USDT0 balance, prepaid fee balance, each fuse and whether it's blown, today's spend, and decision counts.`,
  inputSchema: {},
}, async () => {
  try {
    const registry = await pub.readContract({ ...W, functionName: "registry" });
    const [bal, fee, paused, n, ok, no, fs] = await Promise.all([
      pub.readContract({ address: USDT0, abi: erc20, functionName: "balanceOf", args: [WALLET] }),
      pub.readContract({ address: registry, abi: ABI.registry, functionName: "feeBalance", args: [WALLET] }),
      pub.readContract({ ...W, functionName: "paused" }),
      pub.readContract({ ...W, functionName: "decisionCount" }), pub.readContract({ ...W, functionName: "allowedCount" }), pub.readContract({ ...W, functionName: "blockedCount" }),
      fuses(),
    ]);
    const out = { wallet: WALLET, agent: agent?.address ?? null, balance: usd(bal), feeBalance: usd(fee), paused, decisions: Number(n), paid: Number(ok), stopped: Number(no),
      fuses: fs.map((f) => ({ fuse: f.name, circuit: `#${f.circuitId} on ${f.processor}`, blown: f.latched, ...(f.key === "daily-cap" ? { spentToday: f.spentToday, cap: f.a } : {}) })) };
    const blown = fs.filter((f) => f.latched).map((f) => f.name);
    return text(out, `${out.balance} USDT0 in the wallet, ${out.feeBalance} USDT0 of prepaid fees. ${paused ? "Paused by the owner." : blown.length ? `${blown.join(", ")} blown: nothing pays until the owner resets it.` : "Every fuse is closed."}`);
  } catch (e) { return fail(e); }
});

await server.connect(new StdioServerTransport());
