import { getAddress, isAddress } from "viem";
import { hasSub, PUSH_READY } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Whether this device gets alerts for an approver (POST so the endpoint stays out of URLs and logs). */
export async function POST(req: Request) {
  let b: { approver?: string; endpoint?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  if (!b.approver || !isAddress(b.approver, { strict: false })) return Response.json({ error: "Send { approver, endpoint }." }, { status: 400 });
  return Response.json({ ready: PUSH_READY, subscribed: b.endpoint ? await hasSub(getAddress(b.approver.toLowerCase()), b.endpoint) : false });
}
