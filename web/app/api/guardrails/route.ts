import { ipKey } from "@/lib/clientIp";
import { propose } from "@/lib/guardrails";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const hits = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now(), w = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (w.length >= 8) return false;
  w.push(now); hits.set(ip, w); if (hits.size > 5000) hits.clear();
  return true;
}

/** Plain-English guardrails: describe the agent, get a proposed line of fuses with reasons and test payments. */
export async function POST(req: Request) {
  const ip = ipKey(req);
  if (!allow(ip)) return Response.json({ error: "A few proposals a minute is plenty. Try again shortly." }, { status: 429 });
  let description = "";
  try { description = String((await req.json()).description ?? "").trim(); } catch { /* empty */ }
  if (description.length < 12) return Response.json({ error: "Tell it a little more: what the agent pays for, roughly how much, and who should sign off big payments." }, { status: 400 });
  if (description.length > 1500) return Response.json({ error: "Keep it under 1,500 characters." }, { status: 400 });
  return Response.json(await propose(description), { headers: { "cache-control": "no-store" } });
}
