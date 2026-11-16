import { facilitate } from "@/lib/x402";
import { FUSEBOX_SCHEME, XLAYER_NETWORK, type PaymentPayload, type PaymentRequirements } from "@/lib/x402core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A facilitator for the fusebox scheme, in x402's shape: GET supported, POST verify (reads X Layer), POST settle
 * (verify, then mark the transaction used so it can't buy twice). The payment itself already settled on-chain.
 */
export async function GET(_: Request, ctx: { params: Promise<{ op: string }> }) {
  const { op } = await ctx.params;
  if (op !== "supported") return Response.json({ error: "GET /supported; POST /verify or /settle" }, { status: 404 });
  return Response.json({ kinds: [{ x402Version: 2, scheme: FUSEBOX_SCHEME, network: XLAYER_NETWORK }], extensions: [], signers: {} }, { headers: { "access-control-allow-origin": "*" } });
}

export async function POST(req: Request, ctx: { params: Promise<{ op: string }> }) {
  const { op } = await ctx.params;
  if (op !== "verify" && op !== "settle") return Response.json({ error: "POST /verify or /settle" }, { status: 404 });
  let b: { paymentPayload?: PaymentPayload; paymentRequirements?: PaymentRequirements };
  try { b = await req.json(); } catch { return Response.json({ error: "Send JSON: { paymentPayload, paymentRequirements }" }, { status: 400 }); }
  if (!b.paymentPayload?.accepted || !b.paymentPayload.payload || !b.paymentRequirements?.payTo) return Response.json({ error: "Send JSON: { paymentPayload, paymentRequirements }" }, { status: 400 });
  try {
    return Response.json(await facilitate(op, b.paymentPayload, b.paymentRequirements), { headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } });
  } catch (e) {
    console.error("facilitator", op, (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now." }, { status: 503 });
  }
}
