import { getAddress, isAddress, type Hex } from "viem";
import { client } from "@/lib/chain";
import { PUSH_READY, saveSub, subscribeMessageFor } from "@/lib/push";

export const dynamic = "force-dynamic";
const okEndpoint = (e: string) => /^https:\/\/[^\s]+$/.test(e) && e.length < 1000;

/** Turn on alerts for an approver on one device. The approver's signature proves the address is theirs. */
export async function POST(req: Request) {
  if (!PUSH_READY) return Response.json({ error: "Alerts aren't set up on this server." }, { status: 503 });
  let b: { approver?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; issued?: number; signature?: string; label?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const s = b.subscription;
  if (!b.approver || !isAddress(b.approver, { strict: false }) || !s?.endpoint || !okEndpoint(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth || !b.signature || !b.issued) return Response.json({ error: "Send { approver, subscription, issued, signature }." }, { status: 400 });
  if (Math.abs(Date.now() / 1000 - b.issued) > 900) return Response.json({ error: "That signature is too old; sign again." }, { status: 400 });
  const approver = getAddress(b.approver.toLowerCase());
  const ok = await client.verifyMessage({ address: approver, message: subscribeMessageFor(approver, s.endpoint, b.issued), signature: b.signature as Hex }).catch(() => false);
  if (!ok) return Response.json({ error: "The signature isn't from that address." }, { status: 401 });
  await saveSub(approver, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, at: Math.floor(Date.now() / 1000), label: b.label?.slice(0, 60) });
  return Response.json({ ok: true });
}
