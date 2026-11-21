import { holdsSeat, inboxFor, seatMap } from "@/lib/approvals";
import { cronAuthorized, cronDenied } from "@/lib/cron";
import { alertFor, sendOnce, subscribedApprovers, PUSH_READY } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * For every approver with alerts on: each open request in their inbox (an agent refused by an approval fuse, not paid
 * since) is announced once. Run hourly by the warm-up workflow, and safe to call any time.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return cronDenied();
  if (!PUSH_READY) return Response.json({ ready: false });
  const origin = new URL(req.url).origin;
  const stopAt = Date.now() + 45_000;
  try {
    // the seats are read once for the whole sweep; an address with no seat has nothing to be told
    const [subscribed, seats] = await Promise.all([subscribedApprovers(), seatMap()]);
    const approvers = subscribed.filter((a) => holdsSeat(seats, a));
    let sent = 0, announced = 0;
    for (const a of approvers) {
      if (Date.now() > stopAt) break;
      const inbox = await inboxFor(a, { fresh: true, seats });
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
