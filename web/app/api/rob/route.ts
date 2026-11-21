import { ipKey } from "@/lib/clientIp";
import type { Address } from "viem";
import { parseUnits } from "viem";
import { checkPayment } from "@/lib/atlas";
import { DEPLOYMENT } from "@/lib/chain";
import { readRequest, runAgent, agentMode, AGENT_MODE } from "@/lib/robAgent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// a few tries a minute per visitor, fewer when each try costs a model call
const hits = new Map<string, number[]>();
const LIMIT = AGENT_MODE === "llm" ? 6 : 30;
function allow(ip: string) {
  const now = Date.now(), w = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (w.length >= LIMIT) return false;
  w.push(now); hits.set(ip, w);
  if (hits.size > 5000) hits.clear();
  return true;
}

export function GET() {
  return Response.json(agentMode());
}

/**
 * Rob the agent: a visitor's message goes to the payables agent; whatever payment it asks for (and, if the agent
 * refused, what the message asked for) goes through Atlas's real check() on X Layer. Read-only: nothing is paid.
 */
export async function POST(req: Request) {
  const ip = ipKey(req);
  if (!allow(ip)) return Response.json({ error: "That's a lot of heists in a minute. Give it a moment." }, { status: 429 });
  let message = "";
  try { message = String((await req.json()).message ?? ""); } catch { /* empty */ }
  message = message.trim();
  if (message.length < 8) return Response.json({ error: "Write the scam first: an invoice, a new bank address, an urgent ask." }, { status: 400 });
  if (message.length > 2000) return Response.json({ error: "Keep it under 2,000 characters." }, { status: 400 });
  try {
    const agent = await runAgent(message);
    const asked = readRequest(message);
    // what goes through the fuses: the agent's payment, or if it refused, the one the message asked for
    const to = (agent.decided === "pay" ? agent.to : asked.to) as Address | undefined;
    const amount = agent.decided === "pay" ? agent.amount : asked.amount;
    // a cold instance may first have to catch up on X Layer's logs; one retry rides that out
    const run = () => checkPayment(to!.toLowerCase() as Address, parseUnits(amount!, 6));
    const check = to && amount ? await run().catch(() => run()) : null;
    const supplier = DEPLOYMENT.supplier.toLowerCase();
    const robbed = agent.decided === "pay" && !!check?.allowed && to?.toLowerCase() !== supplier;
    const verdict = robbed ? "robbed" : agent.decided === "pay" ? (check?.allowed ? "paid-supplier" : "fuses") : check && !check.allowed ? "both" : check?.allowed ? "agent" : "nothing";
    return Response.json({ agent, asked, check, verdict }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("rob", (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now. Try again." }, { status: 503 });
  }
}
