import { getAddress, isAddress } from "viem";
import { hasSub, sendTo } from "@/lib/push";

export const dynamic = "force-dynamic";
const last = new Map<string, number>();

/** Send one test alert to this device, if it's subscribed. */
export async function POST(req: Request) {
  let b: { approver?: string; endpoint?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  if (!b.approver || !isAddress(b.approver, { strict: false }) || !b.endpoint) return Response.json({ error: "Send { approver, endpoint }." }, { status: 400 });
  const approver = getAddress(b.approver.toLowerCase());
  if (!(await hasSub(approver, b.endpoint))) return Response.json({ error: "This device isn't getting alerts yet." }, { status: 404 });
  if (Date.now() - (last.get(b.endpoint) ?? 0) < 15_000) return Response.json({ error: "One test every 15 seconds." }, { status: 429 });
  last.set(b.endpoint, Date.now());
  const origin = new URL(req.url).origin;
  const r = await sendTo(approver, { title: "Fusebox alerts are on", body: "When a payment waits on your signature, it shows up here. Tap to open your approvals.", url: `${origin}/app/approve`, tag: "fusebox-test" }, b.endpoint);
  return Response.json(r);
}
