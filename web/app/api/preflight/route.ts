import { ipKey } from "@/lib/clientIp";
import { preflight, PreflightError, type PreflightRequest } from "@/lib/preflight";
import { CURRENT } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };

const hits = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now(), w = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (w.length >= 60) return false;
  w.push(now); hits.set(ip, w); if (hits.size > 5000) hits.clear();
  return true;
}

/** How to call it, with the five circuits Fusebox ships as a starting line. */
export function GET() {
  return Response.json({
    about: "Pre-flight: run a payment through a line of TapeOut circuits before your agent signs it from any wallet. Every verdict is TapeOut's own eval/step on X Layer mainnet, read-only and free.",
    post: {
      line: [{ fuseId: 1, a: 50 }, { fuseId: 2, a: 24, b: 2 }, { fuseId: 3 }, { fuseId: 4, a: 20 }, { fuseId: 5, a: 24 }],
      payment: { amount: "2.5" },
      context: { spentToday: "10", payee: { saved: true, hoursSinceSaved: 72 }, approvals: 0, state: {}, samePaymentHoursAgo: 3, repeatCleared: false },
    },
    shippedFuses: { 1: "Daily Cap (a = cap per UTC day, USD₮0)", 2: "Payee Guard (a = cooling-off hours, b = trial USD₮0)", 3: "Breaker (latch: send back `state`)", 4: "Two of Three (a = approvals above, USD₮0)", 5: "Repeat Guard (a = window in hours; context.samePaymentHoursAgo, context.repeatCleared)" },
    registry: CURRENT.registry,
  }, { headers: CORS });
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

export async function POST(req: Request) {
  const ip = ipKey(req);
  if (!allow(ip)) return Response.json({ error: "Sixty pre-flights a minute is the limit. Try again shortly." }, { status: 429, headers: CORS });
  let body: PreflightRequest;
  try { body = await req.json(); } catch { return Response.json({ error: "Send JSON: { line, payment, context }. GET this URL for an example." }, { status: 400, headers: CORS }); }
  try {
    return Response.json(await preflight(body), { headers: { ...CORS, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof PreflightError) return Response.json({ error: e.message }, { status: 400, headers: CORS });
    console.error("preflight", (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now. Try again." }, { status: 503, headers: CORS });
  }
}
