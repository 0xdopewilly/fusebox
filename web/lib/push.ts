import "server-only";
import { createHash } from "node:crypto";
import { sendNotification, setVapidDetails } from "web-push";
import { getAddress, type Address } from "viem";
import { getJson, listKeys, putJson, putOnce, remove } from "./store";
import { subscribeMessage } from "./pushMessages";

/**
 * Phone alerts for approvers. A device subscribes for one approver address (the approver signs once to prove it's
 * theirs); when a payment waits on that address's signature, every subscribed device gets a web push.
 * Store layout: push/sub/<approver>/<device>.json (the browser's PushSubscription), push/sent/<approver>/<key> (dedupe).
 */
export interface Sub { endpoint: string; keys: { p256dh: string; auth: string }; at: number; label?: string }
export interface Alert { title: string; body: string; url: string; tag: string }

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
export const PUSH_READY = !!(PUBLIC && PRIVATE);
if (PUSH_READY) setVapidDetails(process.env.VAPID_SUBJECT || "https://fusebox-xlayer.vercel.app", PUBLIC, PRIVATE);

/** The browsers' own push services: a subscription can point only at one of them, never at an arbitrary URL. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
export function isPushEndpoint(endpoint: string): boolean {
  try { const u = new URL(endpoint); return u.protocol === "https:" && !u.port && endpoint.length < 1000 && PUSH_HOSTS.some((h) => h.test(u.hostname)); } catch { return false; }
}
/** Devices one approver can register. */
export const MAX_DEVICES = 5;

export const deviceId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
const lc = (a: string) => getAddress(a).toLowerCase();

export { requestMessage } from "./pushMessages";
/** What the approver signs to turn alerts on for this device. */
export const subscribeMessageFor = (approver: string, endpoint: string, issued: number) => subscribeMessage(approver, deviceId(endpoint), issued);

export async function saveSub(approver: Address, sub: Sub) { await putJson(`push/sub/${lc(approver)}/${deviceId(sub.endpoint)}.json`, sub); }
export async function dropSub(approver: Address, endpoint: string) { await remove(`push/sub/${lc(approver)}/${deviceId(endpoint)}.json`); }
export async function subsOf(approver: Address): Promise<Sub[]> {
  const keys = await listKeys(`push/sub/${lc(approver)}/`);
  return (await Promise.all(keys.map((k) => getJson<Sub>(k)))).filter((s): s is Sub => !!s?.endpoint);
}
export async function hasSub(approver: Address, endpoint: string) { return !!(await getJson<Sub>(`push/sub/${lc(approver)}/${deviceId(endpoint)}.json`)); }
/** Every approver with at least one device subscribed. */
export async function subscribedApprovers(): Promise<Address[]> {
  const keys = await listKeys("push/sub/");
  return [...new Set(keys.map((k) => k.split("/")[2]).filter((a) => /^0x[0-9a-f]{40}$/.test(a)))].map((a) => getAddress(a));
}

/** Push one alert to every device of an approver; a device the push service says is gone gets dropped. */
export async function sendTo(approver: Address, alert: Alert, only?: string): Promise<{ sent: number; dropped: number }> {
  if (!PUSH_READY) return { sent: 0, dropped: 0 };
  let sent = 0, dropped = 0;
  const subs = (await subsOf(approver)).filter((s) => (!only || s.endpoint === only) && isPushEndpoint(s.endpoint));
  await Promise.all(subs.map(async (s) => {
    try { await sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(alert), { TTL: 6 * 3600, timeout: 10_000, urgency: "high", topic: alert.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) }); sent++; }
    catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { await dropSub(approver, s.endpoint); dropped++; }
      else console.error("push", code, (e as Error).message);
    }
  }));
  return { sent, dropped };
}

/** Send an alert once per approver per key (a request already announced isn't announced again). */
export async function sendOnce(approver: Address, key: string, alert: Alert) {
  const k = createHash("sha256").update(key).digest("hex").slice(0, 24);
  if (!(await putOnce(`push/sent/${lc(approver)}/${k}`, { at: Math.floor(Date.now() / 1000) }))) return { sent: 0, dropped: 0, already: true };
  return { ...(await sendTo(approver, alert)), already: false };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export function alertFor(r: { wallet: Address; isAtlas?: boolean; to: Address; amount: string; memo: string; mask?: number; threshold?: number | null; saved?: boolean }, origin: string): Alert {
  const signed = [0, 1, 2].filter((i) => ((r.mask ?? 0) >> i) & 1).length;
  const who = r.isAtlas ? "Atlas" : `Wallet ${short(r.wallet)}`;
  return {
    title: `${who} wants to pay ${r.amount} USD₮0`,
    body: `To ${short(r.to)}${r.saved ? " (saved payee)" : ""}${r.memo ? ` · “${r.memo.slice(0, 80)}”` : ""} · ${signed} of 2 signatures`,
    url: `${origin}/app/approve?wallet=${r.wallet}&to=${r.to}&amount=${r.amount}`,
    tag: `${r.wallet.slice(2, 10)}${r.to.slice(2, 10)}${r.amount.replace(".", "_")}`,
  };
}
