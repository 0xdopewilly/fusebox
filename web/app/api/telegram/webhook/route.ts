import { getAddress, isAddress, parseUnits, type Address } from "viem";
import { getWallet, isFuseboxWallet, STATUS } from "@/lib/atlas";
import { APP, follow, following, messageFor, say, TG_READY, TG_SECRET, unfollow, type Decision } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const HELP = [
  "<b>Fusebox Alerts</b>",
  "Get a message for every payment an AI agent tries from a Fusebox wallet on X Layer: paid or stopped, which fuse said no, and why.",
  "",
  "<b>Follow a wallet:</b> open it on fusebox-xlayer.vercel.app and tap <i>Alerts on Telegram</i>, or send its address here.",
  "/list: the wallets you follow",
  "/stop: stop all alerts (or <code>/stop 0x…</code> for one wallet)",
].join("\n");

/** Telegram calls this for every message to @FuseboxAlertsBot (the secret header proves it's Telegram). */
export async function POST(req: Request) {
  if (!TG_READY || !TG_SECRET || req.headers.get("x-telegram-bot-api-secret-token") !== TG_SECRET) return new Response("Not Telegram.", { status: 401 });
  const u = (await req.json().catch(() => null)) as { message?: { chat?: { id?: number }; text?: string } } | null;
  const chat = u?.message?.chat?.id, text = (u?.message?.text ?? "").trim();
  if (typeof chat !== "number" || !text) return Response.json({ ok: true });
  try { await handle(chat, text); }
  catch (e) { console.error("tg webhook", (e as Error).message); await say(chat, "I couldn't reach X Layer just now. Try again in a minute."); }
  return Response.json({ ok: true });
}

async function handle(chat: number, text: string) {
  const [rawCmd, ...rest] = text.split(/\s+/);
  const cmd = rawCmd.toLowerCase().replace(/@\w+$/, ""); // "/list@FuseboxAlertsBot" in groups
  const arg = rest.join(" ").trim();
  if (cmd === "/start") {
    const m = /^w_([0-9a-fA-F]{40})$/.exec(arg);
    return m ? followWallet(chat, `0x${m[1]}`) : say(chat, HELP);
  }
  if (cmd === "/follow") return arg ? followWallet(chat, arg) : say(chat, "Send <code>/follow 0x…</code> with the wallet's address.");
  if (cmd === "/list") {
    const ws = await following(chat);
    if (!ws.length) return say(chat, "You don't follow any wallet yet. Send a Fusebox wallet's address to start.");
    return say(chat, [`You follow ${ws.length} wallet${ws.length === 1 ? "" : "s"}:`, ...ws.map((w) => `• <a href="${APP}/app/w/${w}">${short(w)}</a>`), "", "/stop 0x… stops one."].join("\n"));
  }
  if (cmd === "/stop") {
    if (arg && isAddress(arg, { strict: false })) { await unfollow(chat, getAddress(arg.toLowerCase())); return say(chat, `Stopped alerts for ${short(arg)}.`); }
    const ws = await following(chat);
    for (const w of ws) await unfollow(chat, w);
    return say(chat, ws.length ? `Stopped alerts for ${ws.length} wallet${ws.length === 1 ? "" : "s"}. Send an address any time to start again.` : "You weren't following any wallet.");
  }
  if (isAddress(text, { strict: false })) return followWallet(chat, text);
  return say(chat, HELP);
}

async function followWallet(chat: number, raw: string) {
  if (!isAddress(raw, { strict: false })) return say(chat, "That isn't an address. A Fusebox wallet's address starts with 0x and has 40 characters after it.");
  const wallet = getAddress(raw.toLowerCase());
  if (!(await isFuseboxWallet(wallet))) return say(chat, `<code>${short(wallet)}</code> isn't a Fusebox wallet. Make one at ${APP}/app/new`);
  const r = await follow(chat, wallet);
  if (r === "full") return say(chat, "You already follow 20 wallets. /stop one first.");
  // a short state line and the latest decision, so the first alert isn't a surprise
  const a = await Promise.race([getWallet(wallet), new Promise<null>((res) => setTimeout(() => res(null), 12_000))]).catch(() => null);
  const state = !a ? "" : a.paused ? "Paused by its owner." : a.fuses.some((f) => f.latched) ? `${a.fuses.find((f) => f.latched)!.name} is blown: nothing pays until the owner resets it.` : `All ${a.fuses.length} fuses holding.`;
  const count = a ? ` ${a.counts.decisions} payment${a.counts.decisions === 1 ? "" : "s"} so far (${a.counts.allowed} paid, ${a.counts.blocked} stopped).` : "";
  await say(chat, [
    `🔌 ${r === "already" ? "Already following" : "Following"} ${a?.isAtlas ? "Atlas, the public demo wallet" : `wallet <code>${short(wallet)}</code>`}.`,
    `${state}${count}`.trim(),
    "",
    "You'll get a message here for every payment its agent tries: paid or stopped, which fuse said no, and why. /stop ends it.",
  ].filter((x, i) => x || i !== 1).join("\n"), [[{ text: "Open the wallet", url: `${APP}/app/w/${wallet}` }]]);
  const last = a?.decisions?.length ? a.decisions.reduce((m, d) => (d.id > m.id ? d : m)) : undefined;
  if (a && last && last.status.length === a.fuses.length) {
    const d: Decision = {
      wallet, id: last.id, to: last.to, token: a.usdt0 as Address, amount: parseUnits(last.amount, 6), allowed: last.allowed,
      fuseIds: a.fuses.map((f) => f.fuseId), status: last.status.map((s) => STATUS.indexOf(s)), memo: last.memo, tx: last.tx, block: last.block, logIndex: 0,
    };
    const m = messageFor(d);
    await say(chat, `The latest one, so you know what alerts look like:\n\n${m.text}`, m.buttons);
  }
}
