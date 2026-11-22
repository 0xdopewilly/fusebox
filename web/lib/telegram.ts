import "server-only";
import { decodeEventLog, formatUnits, getAddress, type Address, type Hash, type Log } from "viem";
import { fuseboxWalletAbi } from "./abi";
import { client, DEPLOYMENT } from "./chain";
import { getJson, listKeys, putJson, putOnce, remove } from "./store";

/**
 * Telegram alerts for Fusebox wallets, through @FuseboxAlertsBot. Anyone can follow a wallet (a decision is public on
 * X Layer anyway); every payment its agent attempts arrives as a message: paid or stopped, which fuse said no, why,
 * and what the owner can do. Triggered at once by the app, SDK and MCP after a payment (POST /api/telegram/notify with
 * the transaction), and by a sweep every few minutes for agents that pay some other way.
 */
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
export const TG_READY = !!TOKEN;
export const TG_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
export const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "FuseboxAlertsBot";
export const APP = "https://fusebox-xlayer.vercel.app";
const OKLINK = "https://www.oklink.com/xlayer";
const MAX_FOLLOWS = 20; // wallets per chat

const lc = (a: string) => a.toLowerCase();
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- Bot API ---------------------------------------------------------------------------------------

type Button = { text: string; url: string };
export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!TG_READY) return null;
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!r) return null;
  const j = (await r.json().catch(() => null)) as { ok?: boolean; result?: T; error_code?: number } | null;
  if (j?.ok) return j.result ?? null;
  // the person blocked the bot or the chat is gone: stop sending there
  if (j?.error_code === 403 && typeof body.chat_id === "number") await forgetChat(body.chat_id);
  return null;
}
export const say = (chat: number, text: string, buttons: Button[][] = []) =>
  tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}) });

// ---- who follows what --------------------------------------------------------------------------------
// tg/w/<wallet>/<chat>.json and tg/c/<chat>/<wallet>.json, so both "who gets this wallet" and "what does this chat follow" are one list

export async function follow(chat: number, wallet: Address): Promise<"added" | "already" | "full"> {
  const mine = await following(chat);
  if (mine.some((w) => lc(w) === lc(wallet))) return "already";
  if (mine.length >= MAX_FOLLOWS) return "full";
  const at = Date.now();
  await Promise.all([putJson(`tg/w/${lc(wallet)}/${chat}.json`, { chat, at }), putJson(`tg/c/${chat}/${lc(wallet)}.json`, { wallet, at })]);
  return "added";
}
export async function unfollow(chat: number, wallet: Address) {
  await Promise.all([remove(`tg/w/${lc(wallet)}/${chat}.json`), remove(`tg/c/${chat}/${lc(wallet)}.json`)]);
}
export async function following(chat: number): Promise<Address[]> {
  return (await listKeys(`tg/c/${chat}/`)).map((k) => getAddress(k.split("/").pop()!.replace(/\.json$/, "")));
}
async function forgetChat(chat: number) { for (const w of await following(chat)) await unfollow(chat, w); }
export async function chatsFor(wallet: Address): Promise<number[]> {
  return (await listKeys(`tg/w/${lc(wallet)}/`)).map((k) => Number(k.split("/").pop()!.replace(/\.json$/, ""))).filter(Number.isFinite);
}
export async function followedWallets(): Promise<Address[]> {
  const keys = await listKeys("tg/w/");
  return [...new Set(keys.map((k) => k.split("/")[2]).filter((w) => /^0x[0-9a-f]{40}$/.test(w)))].map((w) => getAddress(w));
}

// ---- decisions -> messages ---------------------------------------------------------------------------

/** The fuses Fusebox ships: the same ids on v1 and v2. Other designs are named by number. */
const FUSES: Record<number, { name: string; no: string; fix: string }> = {
  1: { name: "Daily Cap", no: "it would pass today's spending cap", fix: "Wait for tomorrow (UTC), or the owner raises the cap." },
  2: { name: "Payee Guard", no: "the payee isn't saved, or is still cooling off and this is over the trial amount", fix: "Only the owner can save a payee." },
  3: { name: "Breaker", no: "it's blown. A payment to a stranger trips it, and nothing pays until the owner resets it", fix: "The owner resets the Breaker once they've checked." },
  4: { name: "Two of Three", no: "it's over the approval threshold and needs two of three approvers", fix: "Two approvers sign this exact payment, then the agent tries again." },
  5: { name: "Repeat Guard", no: "the same amount to the same payee already went out inside the window", fix: "If it really is a second order, the owner lets it pay once more." },
  6: { name: "Per-Payment Cap", no: "this one payment is bigger than the owner's per-payment limit", fix: "Split it into smaller payments, or the owner raises the limit." },
  7: { name: "Strict Payee Book", no: "the payee isn't saved, or its cooling-off isn't over (this fuse allows no trial payment)", fix: "Only the owner can save a payee; then wait out the cooling-off." },
  8: { name: "Two-Strike Breaker", no: "a payment to a stranger is a strike, and a second stranger blows the breaker", fix: "The owner resets the breaker once they've checked." },
  9: { name: "Lead Approver", no: "it's over the approval threshold and needs two approvals, one of them seat 1", fix: "Seat 1 and one more approver sign this exact payment, then the agent tries again." },
};
export const nameOf = (id: number) => FUSES[id]?.name ?? `Fuse #${id}`;
const STATUS = ["pass", "blew", "failed", "untrusted"] as const;

/** A decision in plain words (no markup): what was tried, which fuses said no and why, and what the owner can do. */
export function plainStop(d: Decision): { subject: string; body: string } {
  const usd = lc(d.token) === lc(DEPLOYMENT.usdt0);
  const amount = `${formatUnits(d.amount, usd ? 6 : 18)} ${usd ? "USD₮0" : lc(d.token) === "0x0000000000000000000000000000000000000000" ? "OKB" : `of ${short(d.token)}`}`;
  const who = lc(d.wallet) === lc(DEPLOYMENT.atlas) ? "Atlas (the public demo wallet)" : `wallet ${short(d.wallet)}`;
  const said = d.fuseIds.map((id, i) => ({ id, s: STATUS[d.status[i]] ?? "failed" }));
  const no = said.filter((x) => x.s !== "pass");
  const yes = said.filter((x) => x.s === "pass").map((x) => nameOf(x.id));
  const lines = [`${amount} to ${d.to} from ${who}. Nothing moved.`, ``];
  for (const x of no) lines.push(`${nameOf(x.id)} said no${x.s === "blew" ? `: ${FUSES[x.id]?.no ?? "its rule failed"}` : x.s === "untrusted" ? ": its processor isn't trusted" : ": the circuit failed to run"}.`);
  if (yes.length) lines.push(`${yes.join(", ")} said yes.`);
  const fix = no.map((x) => FUSES[x.id]?.fix).filter(Boolean);
  if (fix.length) lines.push(``, fix[0]!);
  if (d.memo.trim()) lines.push(``, `What the agent said: "${d.memo.trim().slice(0, 140)}"`);
  lines.push(``, `Wallet: ${APP}/app/w/${d.wallet}`, `Transaction: ${OKLINK}/tx/${d.tx}`);
  return { subject: `Fusebox stopped payment #${d.id} (${no.map((x) => nameOf(x.id)).join(", ") || "a fuse"})`.slice(0, 200), body: lines.join("\n") };
}

export interface Decision {
  wallet: Address; id: number; to: Address; token: Address; amount: bigint; allowed: boolean; fuseIds: number[]; status: number[];
  memo: string; tx: Hash; block: number; logIndex: number;
}

export function decisionOf(l: Log): Decision | null {
  try {
    const ev = decodeEventLog({ abi: fuseboxWalletAbi, data: l.data, topics: l.topics });
    if (ev.eventName !== "Decision") return null;
    const a = ev.args;
    return {
      wallet: getAddress(l.address), id: Number(a.decisionId), to: a.to, token: a.token, amount: a.amount, allowed: a.allowed,
      fuseIds: a.fuseIds.map(Number), status: a.status.map(Number), memo: a.memo, tx: l.transactionHash!, block: Number(l.blockNumber), logIndex: Number(l.logIndex),
    };
  } catch { return null; }
}

export function messageFor(d: Decision): { text: string; buttons: Button[][] } {
  const usd = lc(d.token) === lc(DEPLOYMENT.usdt0);
  const amount = `${formatUnits(d.amount, usd ? 6 : 18)} ${usd ? "USD₮0" : lc(d.token) === "0x0000000000000000000000000000000000000000" ? "OKB" : `of ${short(d.token)}`}`;
  const who = lc(d.wallet) === lc(DEPLOYMENT.atlas) ? "Atlas (the public demo wallet)" : `wallet <code>${short(d.wallet)}</code>`;
  const said = d.fuseIds.map((id, i) => ({ id, s: STATUS[d.status[i]] ?? "failed" }));
  const no = said.filter((x) => x.s !== "pass");
  const yes = said.filter((x) => x.s === "pass").map((x) => nameOf(x.id));
  const lines: string[] = [];
  if (d.allowed) {
    lines.push(`✅ <b>Paid</b> · payment #${d.id}`, `${amount} to <code>${short(d.to)}</code> from ${who}`, ``, `All ${said.length} fuse${said.length === 1 ? "" : "s"} said yes.`);
  } else {
    lines.push(`🛑 <b>Stopped</b> · payment #${d.id}`, `${amount} to <code>${short(d.to)}</code> from ${who}`, `Nothing moved.`, ``);
    for (const x of no) lines.push(`<b>${esc(nameOf(x.id))}</b> said no${x.s === "blew" ? `: ${FUSES[x.id]?.no ?? "its rule failed"}` : x.s === "untrusted" ? ": its processor isn't trusted" : ": the circuit failed to run"}.`);
    if (yes.length) lines.push(`${yes.map(esc).join(", ")} said yes.`);
    const fix = no.map((x) => FUSES[x.id]?.fix).filter(Boolean);
    if (fix.length) lines.push(``, `<i>${esc(fix[0]!)}</i>`);
  }
  if (d.memo.trim()) lines.push(``, `Memo: “${esc(d.memo.trim().slice(0, 140))}”`);
  const buttons: Button[][] = [[{ text: "Open the wallet", url: `${APP}/app/w/${d.wallet}` }, { text: "Transaction", url: `${OKLINK}/tx/${d.tx}` }]];
  if (!d.allowed && no.some((x) => x.id === 4)) buttons.unshift([{ text: "Approve it", url: `${APP}/app/approve?wallet=${d.wallet}&to=${d.to}&amount=${formatUnits(d.amount, 6)}` }]);
  return { text: lines.join("\n"), buttons };
}

/** Send a decision to every chat following its wallet, once (a decision is announced by notify or sweep, whichever is first). */
export async function announce(d: Decision): Promise<number> {
  const chats = await chatsFor(d.wallet);
  if (!chats.length) return 0;
  if (!(await putOnce(`tg/sent/${lc(d.wallet)}/${d.id}.json`, { tx: d.tx, at: Date.now() }))) return 0;
  const m = messageFor(d);
  const out = await Promise.all(chats.map((c) => say(c, m.text, m.buttons)));
  return out.filter(Boolean).length;
}

/** Every Fusebox decision in a transaction (the app, SDK and MCP call notify with it right after a payment). */
export async function decisionsInTx(hash: Hash): Promise<Decision[]> {
  const r = await client.getTransactionReceipt({ hash });
  return r.logs.map((l) => decisionOf(l as Log)).filter((d): d is Decision => !!d);
}

/** Decisions of the followed wallets between two blocks, read in windows the public RPCs accept. */
export async function decisionsBetween(wallets: Address[], from: number, to: number): Promise<Decision[]> {
  const STEP = 100, out: Decision[] = [];
  for (let a = from; a <= to; a += STEP) {
    const b = Math.min(to, a + STEP - 1);
    const logs = await client.getLogs({ address: wallets, event: DECISION_EVENT, fromBlock: BigInt(a), toBlock: BigInt(b) });
    for (const l of logs) { const d = decisionOf(l as unknown as Log); if (d) out.push(d); }
  }
  return out;
}
const DECISION_EVENT = fuseboxWalletAbi.find((x) => x.type === "event" && x.name === "Decision")! as Extract<(typeof fuseboxWalletAbi)[number], { type: "event"; name: "Decision" }>;

export const sweepState = {
  get: () => getJson<{ block: number }>("tg/sweep.json"),
  set: (block: number) => putJson("tg/sweep.json", { block, at: Date.now() }),
};
