import { formatUnits, getAddress, isAddress, parseUnits, recoverMessageAddress, type Address, type Hex } from "viem";
import { client, DEPLOYMENT } from "@/lib/chain";
import { fuseboxWalletAbi } from "@/lib/abi";
import { isFuseboxWallet } from "@/lib/atlas";
import { alertFor, requestMessage, sendOnce } from "@/lib/push";
import { getJson, putJson } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const APPROVAL_SOCKET = 4, BLEW = 1;
/** Alert requests one wallet can make per hour, across every instance (a soft cap kept in the store). */
const PER_WALLET_HOURLY = 10;
async function takeWalletSlot(wallet: Address): Promise<boolean> {
  const key = `push/rate/${wallet.toLowerCase()}/${new Date().toISOString().slice(0, 13).replace(/[-T:]/g, "")}.json`;
  try {
    const n = (await getJson<{ n: number }>(key))?.n ?? 0;
    if (n >= PER_WALLET_HOURLY) return false;
    await putJson(key, { n: n + 1 });
  } catch { /* the store being down doesn't block a real request */ }
  return true;
}

/**
 * An agent asks its wallet's approvers for a payment: signed by the agent's key, checked on X Layer (the signer is an
 * agent of a Fusebox wallet, and the wallet's approval fuse really is what holds this payment), then pushed to every
 * seat's devices. The SDK calls this when pay() comes back needing approval.
 */
export async function POST(req: Request) {
  let b: { wallet?: string; to?: string; amount?: string; memo?: string; issued?: number; signature?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  if (!b.wallet || !isAddress(b.wallet, { strict: false }) || !b.to || !isAddress(b.to, { strict: false }) || !/^\d{1,9}(\.\d{1,6})?$/.test(b.amount ?? "") || !b.signature || !b.issued) return Response.json({ error: "Send { wallet, to, amount, memo, issued, signature }." }, { status: 400 });
  if (Math.abs(Date.now() / 1000 - b.issued) > 600) return Response.json({ error: "That request is too old; sign it again." }, { status: 400 });
  const wallet = getAddress(b.wallet.toLowerCase()), to = getAddress(b.to.toLowerCase()), amount = b.amount!, memo = (b.memo ?? "").slice(0, 200);
  const signer = await recoverMessageAddress({ message: requestMessage(wallet, to, amount, memo, b.issued), signature: b.signature as Hex }).catch(() => null);
  if (!signer) return Response.json({ error: "Bad signature." }, { status: 401 });
  // one spelling per amount ("5", "5.0" and "05" are the same request), so the once-per-hour dedupe holds
  const canonical = formatUnits(parseUnits(amount, 6), 6);
  const W = { address: wallet, abi: fuseboxWalletAbi } as const;
  try {
    const [genuine, agent] = await Promise.all([isFuseboxWallet(wallet), client.readContract({ ...W, functionName: "isAgent", args: [signer] })]);
    if (!genuine || !agent) return Response.json({ error: "The signer isn't an agent of a Fusebox wallet." }, { status: 403 });
    const [[, status], n, seats] = await Promise.all([
      client.readContract({ ...W, functionName: "check", args: [DEPLOYMENT.usdt0, to, parseUnits(amount, 6)] }),
      client.readContract({ ...W, functionName: "fuseCount" }),
      client.readContract({ ...W, functionName: "approvers" }),
    ]);
    const sockets = await Promise.all(Array.from({ length: Number(n) }, (_, i) => client.readContract({ ...W, functionName: "slotAt", args: [BigInt(i)] }).then((s) => Number(s.socket))));
    const held = sockets.some((s, i) => s === APPROVAL_SOCKET && status[i] === BLEW);
    if (!held) return Response.json({ error: "No approval fuse is holding that payment, so there's nothing to approve." }, { status: 409 });
    if (!(await takeWalletSlot(wallet))) return Response.json({ error: `That wallet already asked ${PER_WALLET_HOURLY} times this hour; its approvers have been told.` }, { status: 429 });
    const origin = new URL(req.url).origin;
    const alert = alertFor({ wallet, isAtlas: wallet.toLowerCase() === DEPLOYMENT.atlas.toLowerCase(), to, amount: canonical, memo }, origin);
    const live = (seats as readonly Address[]).filter((s) => !/^0x0{40}$/i.test(s));
    const out = await Promise.all(live.map((s) => sendOnce(s, `req|${wallet}|${to}|${canonical}|${Math.floor(b.issued! / 3600)}`, alert)));
    return Response.json({ seats: live.length, sent: out.reduce((t, r) => t + r.sent, 0), url: alert.url });
  } catch (e) {
    console.error("notify", (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now." }, { status: 503 });
  }
}
