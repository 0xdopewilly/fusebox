import { ipKey } from "@/lib/clientIp";
import { getAddress, isAddress } from "viem";
import { assistantMode, runAssistant, type AssistantContext, type Turn } from "@/lib/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// a chat is a few messages a minute; this keeps a public endpoint from burning the model's credits
const hits = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now(), w = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (w.length >= 12) return false;
  w.push(now); hits.set(ip, w);
  if (hits.size > 5000) hits.clear();
  return true;
}

export function GET() {
  return Response.json(assistantMode());
}

/** One chat turn for the Fusebox assistant: a reply, or a proposed payment the browser checks and the owner confirms. */
export async function POST(req: Request) {
  const ip = ipKey(req);
  if (!allow(ip)) return Response.json({ error: "That's a lot of messages in a minute. Give it a moment." }, { status: 429 });
  let body: { message?: unknown; history?: unknown; context?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const message = String(body.message ?? "").trim();
  if (!message) return Response.json({ error: "Say who to pay and how much." }, { status: 400 });
  if (message.length > 1000) return Response.json({ error: "Keep it under 1,000 characters." }, { status: 400 });
  const c = body.context ?? {};
  if (!isAddress(String(c.wallet ?? ""), { strict: false })) return Response.json({ error: "Pick a wallet first." }, { status: 400 });
  const ctx: AssistantContext = {
    wallet: getAddress(String(c.wallet).toLowerCase()),
    balance: String(Number(c.balance) || 0),
    payees: (Array.isArray(c.payees) ? c.payees : []).slice(0, 50).flatMap((p: { address?: string; label?: string }) => (p && isAddress(String(p.address ?? ""), { strict: false }) ? [{ address: getAddress(String(p.address).toLowerCase()), label: p.label ? String(p.label).slice(0, 40) : undefined }] : [])),
    fuses: (Array.isArray(c.fuses) ? c.fuses : []).slice(0, 8).map((f: { name?: string; limit?: string }) => ({ name: String(f?.name ?? "").slice(0, 40), limit: f?.limit ? String(f.limit).slice(0, 80) : undefined })),
  };
  const history: Turn[] = (Array.isArray(body.history) ? body.history : []).slice(-6).flatMap((t: { role?: string; text?: string }) => (t && (t.role === "user" || t.role === "assistant") ? [{ role: t.role, text: String(t.text ?? "").slice(0, 1000) }] : []));
  const out = await runAssistant(message, history, ctx);
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
