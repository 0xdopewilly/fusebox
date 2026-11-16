import { inboxFor } from "@/lib/approvals";
import { alertFor, sendOnce, subscribedApprovers, PUSH_READY } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * For every approver with alerts on: each open request in their inbox (an agent refused by an approval fuse, not paid
 * since) is announced once. Run hourly by the warm-up workflow, and safe to call any time.
 */
export async function GET(req: Request) {
  if (!PUSH_READY) return Response.json({ ready: false });
  const origin = new URL(req.url).origin;
  try {
    const approvers = await subscribedApprovers();
    let sent = 0, announced = 0;
    for (const a of approvers) {
      const inbox = await inboxFor(a, { fresh: true });
      for (const r of inbox.open) {
        const res = await sendOnce(a, `open|${r.wallet}|${r.to}|${r.amount}|${r.last}`, alertFor(r, origin));
        sent += res.sent; if (!res.already) announced++;
      }
    }
    return Response.json({ approvers: approvers.length, announced, sent }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("sweep", (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now." }, { status: 503 });
  }
}
