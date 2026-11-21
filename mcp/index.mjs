#!/usr/bin/env node
// fusebox-mcp: MCP tools for an AI agent that pays through a Fusebox wallet on X Layer.
//   fusebox_check   dry-run a payment against every fuse (free, read-only)
//   fusebox_pay     pay through the fuses with the agent key (needs FUSEBOX_AGENT_KEY)
//   fusebox_status  the wallet's balance, fee balance, fuses and today's spend
//   fusebox_fetch   fetch a URL; if it asks for payment (x402), pay its price through the fuses, then retry
//   fusebox_preflight  check a payment against any line of TapeOut circuits, for any wallet (free, read-only)
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
const APP = process.env.FUSEBOX_APP || "https://fusebox-xlayer.vercel.app";
/** where the wallet's approvers sign this exact payment (Two of Three) */
const approvalUrl = (to, amount) => `${APP}/app/approve?wallet=${WALLET}&to=${to}&amount=${amount}`;
const chain = defineChain({ id: 196, name: "X Layer", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } });
const pub = createPublicClient({ chain, transport: http(RPC), batch: { multicall: true } });
const agent = KEY ? privateKeyToAccount(KEY.startsWith("0x") ? KEY : `0x${KEY}`) : null;
const signer = agent ? createWalletClient({ chain, transport: http(RPC), account: agent }) : null;
const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }];
const SOCKET = { 1: ["daily-cap", "Daily Cap"], 2: ["payee-guard", "Payee Guard"], 3: ["breaker", "Breaker"], 4: ["approval-2of3", "Two of Three"], 5: ["repeat-guard", "Repeat Guard"] };
const STATUS = ["pass", "blew", "failed", "untrusted"];
const W = { address: WALLET, abi: ABI.wallet };
const usd = (v) => formatUnits(v, 6);

async function fuses() {
  const n = Number(await pub.readContract({ ...W, functionName: "fuseCount" }));
  return Promise.all(Array.from({ length: n }, async (_, i) => {
    const s = await pub.readContract({ ...W, functionName: "slotAt", args: [BigInt(i)] });
    const registry = await pub.readContract({ ...W, functionName: "registry" });
    const [spent, fee] = await Promise.all([
      pub.readContract({ ...W, functionName: "spentToday", args: [BigInt(i)] }),
      pub.readContract({ address: registry, abi: ABI.registry, functionName: "feeOf", args: [s.fuseId] }).catch(() => s.maxFee),
    ]);
    const [key, name] = SOCKET[Number(s.socket)] ?? [`socket-${s.socket}`, `Fuse ${i + 1}`];
    // what a check of this fuse costs: the lower of the designer's fee and the one the owner accepted
    const feeCap = Number(usd(fee < s.maxFee ? fee : s.maxFee));
    return { slot: i, key, name, circuitId: Number(s.circuitId), processor: s.processor, a: Number(s.params.a), b: Number(s.params.b), latched: s.nState > 0 && s.state !== "0x" && BigInt(s.state) !== 0n, spentToday: Number(usd(spent)), feeCap };
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
    else if (f.key === "repeat-guard") why = ok ? `not a repeat of a payment in the last ${f.a} h (or the owner cleared one)` : `the same amount to this payee already went out in the last ${f.a} h; the owner can clear one repeat`;
    return { fuse: f.name, circuit: `#${f.circuitId}`, verdict: ok ? "holds" : "blew", why };
  });
}

const parseTo = (to) => { if (!isAddress(to, { strict: false })) throw new Error(`"${to}" isn't a valid 0x address.`); return getAddress(to.toLowerCase()); };
const parseAmount = (a) => { if (!/^\d{1,9}(\.\d{1,6})?$/.test(String(a)) || Number(a) <= 0) throw new Error(`"${a}" isn't an amount above 0 with up to 6 decimals.`); return parseUnits(String(a), 6); };
const text = (obj, summary) => ({ content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(obj, null, 2)}` }], structuredContent: obj });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: e.message || String(e) }] });

/** Dry-run a payment against every fuse, with the reasons. */
async function checkPayment(to, amount) {
  const payee = parseTo(to), amt = parseAmount(amount);
  const [[allowed, status], fs, block] = await Promise.all([pub.readContract({ ...W, functionName: "check", args: [USDT0, payee, amt] }), fuses(), pub.getBlockNumber()]);
  const verdicts = await explain(fs, status, payee, amt);
  const no = verdicts.filter((v) => v.verdict === "blew");
  const needs = !allowed && fs.some((f, i) => f.key === "approval-2of3" && verdicts[i].verdict === "blew");
  const summary = allowed ? `Every fuse holds: the wallet would pay ${amount} USDT0 to ${payee}.` : `Stopped: ${no.map((v) => `${v.fuse} (${v.why})`).join("; ")}. Nothing would move.${needs && no.length === 1 ? ` Two of the wallet's approvers can sign this exact payment at ${approvalUrl(payee, amount)}; retry once they have.` : ""}`;
  return { allowed, summary, out: { allowed, wallet: WALLET, to: payee, amount, block: Number(block), fuses: verdicts, ...(needs ? { approval_url: approvalUrl(payee, amount) } : {}) } };
}

/** Pay through the fuses with the agent key: every fuse decides in the transaction. */
async function payThrough(to, amount, memo) {
  if (!signer) throw new Error("This server is read-only: set FUSEBOX_AGENT_KEY to the agent's private key to pay.");
  const payee = parseTo(to), amt = parseAmount(amount);
  if (!(await pub.readContract({ ...W, functionName: "isAgent", args: [agent.address] }))) throw new Error(`${agent.address} isn't an agent of ${WALLET}.`);
  // decisions are charged from the prepaid fee balance: explain an empty one instead of sending a doomed tx
  const registry = await pub.readContract({ ...W, functionName: "registry" });
  const [fee, slots] = await Promise.all([pub.readContract({ address: registry, abi: ABI.registry, functionName: "feeBalance", args: [WALLET] }), fuses()]);
  const per = slots.reduce((t, f) => t + Number(f.feeCap ?? 0), 0);
  if (per > 0 && Number(usd(fee)) + 1e-9 < per) throw new Error(`The wallet's prepaid fee balance (${usd(fee)} USDT0) can't cover one decision (${per.toFixed(6)} USDT0): ask the owner to top it up.`);
  const hash = await signer.writeContract({ ...W, functionName: "pay", args: [USDT0, payee, amt, memo], gas: 3_000_000n });
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (r.status !== "success") throw new Error(`The transaction reverted: ${EXPLORER}/tx/${hash}`);
  // Telegram alerts (@FuseboxAlertsBot) for anyone following this wallet
  fetch(`${APP}/api/telegram/notify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tx: hash }), signal: AbortSignal.timeout(8_000) }).catch(() => {});
  let d;
  for (const l of r.logs) { try { const ev = decodeEventLog({ abi: ABI.wallet, data: l.data, topics: l.topics }); if (ev.eventName === "Decision") d = ev.args; } catch {} }
  const fs = await fuses();
  const verdicts = fs.map((f, i) => ({ fuse: f.name, verdict: STATUS[d.status[i]] === "pass" ? "holds" : "blew" }));
  const blew = verdicts.filter((v) => v.verdict === "blew").map((v) => v.fuse);
  const needs = !d.allowed && fs.some((f, i) => f.key === "approval-2of3" && verdicts[i].verdict === "blew");
  // only signatures stand in the way: alert the approvers' devices (signed with the agent key, checked by Fusebox)
  const notified = needs && blew.length === 1 ? await requestApproval(payee, amount, memo).catch(() => null) : undefined;
  const out = { paid: d.allowed, decision: Number(d.decisionId), to: payee, amount, memo, fuses: verdicts, feePaid: usd(d.feePaid), tx: `${EXPLORER}/tx/${hash}`, hash, ...(needs ? { approval_url: approvalUrl(payee, amount), approvers_alerted: notified ?? null } : {}) };
  const summary = d.allowed ? `Paid ${amount} USDT0 to ${payee} (decision #${out.decision}). Fees ${out.feePaid} USDT0. ${out.tx}`
    : `Stopped by ${blew.join(", ")}: nothing moved (decision #${out.decision}). ${needs && blew.length === 1 ? `It needs two of the wallet's approvers: they can sign at ${out.approval_url}, then retry.` : "Ask the wallet's owner before trying again."} ${out.tx}`;
  return { paid: d.allowed, hash, decision: Number(d.decisionId), out, summary };
}

/** Ask the wallet's approvers to sign off a held payment: Fusebox verifies the agent's signature and pushes alerts. */
async function requestApproval(to, amount, memo) {
  const issued = Math.floor(Date.now() / 1000), m = String(memo ?? "").slice(0, 200);
  const message = `Fusebox approval request\nWallet: ${WALLET}\nTo: ${getAddress(to)}\nAmount: ${amount} USDT0\nMemo: ${m}\nIssued: ${issued}`;
  const signature = await signer.signMessage({ message });
  const r = await fetch(`${APP}/api/push/notify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: WALLET, to: getAddress(to), amount, memo: m, issued, signature }), signal: AbortSignal.timeout(20_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `notify ${r.status}`);
  return j.sent ?? 0;
}

// x402: a seller answers 402 with a PAYMENT-REQUIRED header (base64 JSON) listing a "fusebox" option on eip155:196;
// the wallet pays it through the fuses with the seller's nonce in the memo, and the retry carries the transaction.
const b64json = (v) => Buffer.from(JSON.stringify(v), "utf8").toString("base64");
const unb64json = (v) => JSON.parse(Buffer.from(v, "base64").toString("utf8"));
async function offerOf(res) {
  const h = res.headers.get("payment-required");
  if (h) { try { return unb64json(h); } catch {} }
  try { const j = await res.clone().json(); if (Array.isArray(j.accepts)) return { ...j, accepts: j.accepts.map((a) => ({ ...a, amount: a.amount ?? a.maxAmountRequired, extra: a.extra ?? {} })) }; } catch {}
  return null;
}
const excerpt = async (res) => { const t = await res.text().catch(() => ""); return t.length > 4000 ? t.slice(0, 4000) + "…" : t; };

const server = new McpServer({ name: "fusebox", version: "0.5.0" });

server.registerTool("fusebox_check", {
  title: "Check a payment against the fuses",
  description: `Dry-run a USDT0 payment from the Fusebox wallet ${WALLET} on X Layer. Every fuse (TapeOut circuits) answers yes or no, with the reason. Free and read-only; nothing moves. Call this before fusebox_pay: a blocked payment still costs fees and can blow the Breaker.`,
  inputSchema: { to: z.string().describe("Payee address (0x…)"), amount: z.string().describe("Amount in USDT0, e.g. \"2.5\"") },
}, async ({ to, amount }) => {
  try {
    const c = await checkPayment(to, amount);
    return text(c.out, c.summary);
  } catch (e) { return fail(e); }
});

server.registerTool("fusebox_pay", {
  title: "Pay through the fuses",
  description: `Ask the Fusebox wallet ${WALLET} to pay in USDT0 on X Layer. Every fuse decides in the same transaction; the money moves only if all of them say yes. The memo is recorded on-chain but no fuse reads it. Requires FUSEBOX_AGENT_KEY.`,
  inputSchema: { to: z.string().describe("Payee address (0x…)"), amount: z.string().describe("Amount in USDT0, e.g. \"0.05\""), memo: z.string().max(200).describe("One line: what this payment is for") },
}, async ({ to, amount, memo }) => {
  try {
    const p = await payThrough(to, amount, memo);
    return text(p.out, p.summary);
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

/** What a paid fetch may cost when the caller sets no max_price (USDT0); FUSEBOX_MAX_PRICE changes it. */
const DEFAULT_MAX_PRICE = process.env.FUSEBOX_MAX_PRICE || "0.10";

/** Paid fetches go to public hosts only: a prompt can't point the agent at localhost or the LAN (set FUSEBOX_ALLOW_PRIVATE_URLS=1 for local tests). */
function assertPublicUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${raw}: only http(s) URLs can be fetched.`);
  if (process.env.FUSEBOX_ALLOW_PRIVATE_URLS === "1") return;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  const privateV4 = v4 && (v4[0] === 10 || v4[0] === 127 || v4[0] === 0 || (v4[0] === 169 && v4[1] === 254) || (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) || (v4[0] === 192 && v4[1] === 168) || (v4[0] === 100 && v4[1] >= 64 && v4[1] <= 127));
  const privateV6 = h.includes(":") && (h === "::1" || h === "::" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("::ffff:"));
  const localName = h === "localhost" || /\.(localhost|local|internal|lan|home\.arpa)$/.test(h) || !h.includes(".") && !h.includes(":");
  if (privateV4 || privateV6 || localName) throw new Error(`${raw} is a private or local address; paid fetches go to public hosts only.`);
}

server.registerTool("fusebox_fetch", {
  title: "Fetch a URL, paying for it through the fuses if it asks (x402)",
  description: `Fetch a URL. If it answers 402 with an x402 offer that takes Fusebox payments (scheme "fusebox" on X Layer, in USDT0), the price is paid from the Fusebox wallet ${WALLET} only if every fuse allows it, then the request is retried with the proof and the response comes back. A refused price moves nothing. It pays at most max_price (default ${DEFAULT_MAX_PRICE} USDT0 when you don't set one), only to public hosts. Use dry_run to see the price and the fuses' answer without paying. Without FUSEBOX_AGENT_KEY it behaves as a dry run.`,
  inputSchema: {
    url: z.string().url().describe("The URL to fetch"),
    method: z.enum(["GET", "POST"]).optional().describe("Default GET"),
    body: z.string().max(20000).optional().describe("Request body for POST (sent as-is)"),
    content_type: z.string().optional().describe("Content-Type for the body, default application/json"),
    max_price: z.string().optional().describe(`Most you'll pay for this call, in USDT0, e.g. "0.05". Default ${DEFAULT_MAX_PRICE}`),
    dry_run: z.boolean().optional().describe("Only report the price and what the fuses would say"),
  },
}, async ({ url, method = "GET", body, content_type, max_price, dry_run }) => {
  try {
    assertPublicUrl(url);
    const cap = max_price ?? DEFAULT_MAX_PRICE;
    const init = { method, redirect: "error", ...(body !== undefined ? { body, headers: { "content-type": content_type || "application/json" } } : {}) };
    const first = await fetch(url, init);
    if (first.status !== 402) return text({ url, status: first.status, paid: false, body: await excerpt(first) }, `${url} answered ${first.status} without asking for payment.`);
    const offer = await offerOf(first);
    if (!offer) throw new Error(`${url} answered 402 without an x402 offer.`);
    const req = offer.accepts.find((a) => a.scheme === "fusebox" && a.network === "eip155:196" && String(a.asset).toLowerCase() === USDT0.toLowerCase());
    if (!req) throw new Error(`${url} doesn't take Fusebox payments; it offers ${offer.accepts.map((a) => `${a.scheme} on ${a.network}`).join(", ") || "nothing"}.`);
    const price = usd(BigInt(req.amount)), payTo = parseTo(req.payTo);
    const base = { url, price, pay_to: payTo, resource: offer.resource?.url ?? url };
    if (dry_run || !signer) {
      const c = await checkPayment(payTo, price);
      return text({ ...base, paid: false, dry_run: true, check: c.out }, `${dry_run ? "Dry run" : "Read-only"}: ${url} costs ${price} USDT0 to ${payTo}. ${c.allowed ? "Every fuse would allow it." : c.summary}`);
    }
    const c = await checkPayment(payTo, price);
    if (!c.allowed) return text({ ...base, paid: false, check: c.out }, `Not paid for ${url}: ${c.summary}`);
    // the fuses would allow it; the caller's own price limit still applies
    if (Number(price) > Number(cap)) return text({ ...base, paid: false, max_price: cap }, `Not paid: ${url} costs ${price} USDT0, over your ${cap} USDT0 limit${max_price === undefined ? " (the default; pass max_price to pay more)" : ""}.`);
    let where = base.resource; try { const u = new URL(base.resource); where = u.host + u.pathname; } catch {}
    const p = await payThrough(payTo, price, `x402 ${String(req.extra?.nonce ?? "")} ${where}`.slice(0, 200));
    if (!p.paid) return text({ ...base, paid: false, payment: p.out }, `Not paid for ${url}: ${p.summary}`);
    // signed by the agent that paid, so nobody watching the chain can redeem the payment first
    const signature = await signer.signMessage({ message: `Fusebox x402 payment\nnonce: ${String(req.extra?.nonce ?? "")}\ntransaction: ${String(p.hash).toLowerCase()}` });
    const proof = b64json({ x402Version: 2, resource: offer.resource, accepted: req, payload: { wallet: WALLET, transaction: p.hash, decisionId: p.decision, signature } });
    const second = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), "PAYMENT-SIGNATURE": proof, ...(offer.x402Version < 2 ? { "X-PAYMENT": proof } : {}) } });
    let settlement; try { const h = second.headers.get("payment-response") ?? second.headers.get("x-payment-response"); settlement = h ? unb64json(h) : undefined; } catch {}
    const out = { ...base, paid: second.ok, status: second.status, decision: p.decision, tx: p.out.tx, fuses: p.out.fuses, settlement, body: await excerpt(second) };
    return text(out, second.ok ? `Paid ${price} USDT0 to ${payTo} for ${url} (decision #${p.decision}); it answered ${second.status}. ${p.out.tx}` : `Paid ${price} USDT0 (decision #${p.decision}) but ${url} answered ${second.status}. ${p.out.tx}`);
  } catch (e) { return fail(e); }
});

server.registerTool("fusebox_preflight", {
  title: "Pre-flight a payment against TapeOut circuits (any wallet)",
  description: "Before signing a payment from ANY wallet, run it through a line of TapeOut circuits on X Layer: each circuit's own eval/step answers yes or no, free and read-only. You supply the context a Fusebox wallet would keep on-chain. Pass the returned state back next time so latches (the Breaker) remember. Shipped fuses: 1 Daily Cap (a = cap per UTC day, USD₮0), 2 Payee Guard (a = cooling-off hours, b = trial USD₮0), 3 Breaker, 4 Two of Three (a = approvals above, USD₮0). If it says no, don't sign.",
  inputSchema: {
    line: z.array(z.object({ fuse_id: z.number().int().positive(), a: z.number().int().min(0).max(255).optional(), b: z.number().int().min(0).max(255).optional() })).min(1).max(8).describe("Fuses by registry id with their settings"),
    amount: z.string().describe("Payment amount in USD₮0, e.g. \"2.5\""),
    spent_today: z.string().optional().describe("USD₮0 already paid today through this line"),
    payee_saved: z.boolean().optional().describe("Is the payee in your payee book?"),
    hours_since_saved: z.number().int().min(0).optional().describe("Hours since the payee was saved"),
    approvals: z.number().int().min(0).max(3).optional().describe("How many of three approvers signed this exact payment"),
    state: z.record(z.string(), z.string()).optional().describe("Latch state from the previous pre-flight's state"),
  },
}, async ({ line, amount, spent_today, payee_saved, hours_since_saved, approvals, state }) => {
  try {
    const body = { line: line.map((f) => ({ fuseId: f.fuse_id, a: f.a, b: f.b })), payment: { amount }, context: { spentToday: spent_today, payee: { saved: !!payee_saved, hoursSinceSaved: hours_since_saved }, approvals: approvals ?? 0, state } };
    const r = await fetch(`${APP}/api/preflight`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `pre-flight ${r.status}`);
    return text(j, j.summary);
  } catch (e) { return fail(e); }
});

await server.connect(new StdioServerTransport());
