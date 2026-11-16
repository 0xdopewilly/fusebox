import { getAddress, isAddress } from "viem";
import { dropSub } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Turn alerts off for one device. Only that device knows its push endpoint, so the endpoint is the proof. */
export async function POST(req: Request) {
  let b: { approver?: string; endpoint?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  if (!b.approver || !isAddress(b.approver, { strict: false }) || !b.endpoint) return Response.json({ error: "Send { approver, endpoint }." }, { status: 400 });
  await dropSub(getAddress(b.approver.toLowerCase()), b.endpoint);
  return Response.json({ ok: true });
}
