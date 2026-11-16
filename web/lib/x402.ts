import "server-only";
import type { Address, PublicClient } from "viem";
import { client, DEPLOYMENT } from "./chain";
import { putOnce, STORE_KIND } from "./store";
import { requirePayment, verifyFuseboxPayment, type PaymentPayload, type PaymentRequirements, type SettleResponse, type VerifyResponse, XLAYER_NETWORK } from "./x402core";

/** Signs the demo sellers' nonces. Required in production; local runs use a fixed one. */
function secret(): string {
  const s = process.env.X402_SECRET;
  if (s && s.length >= 32) return s;
  if (STORE_KIND === "file") return "fusebox-local-x402-secret-not-for-production-use";
  throw new Error("X402_SECRET isn't set");
}

/** One payment buys one response: the first time a transaction is seen it's recorded, after that it's refused. */
export const markUsed = (tx: string) => putOnce(`x402/used/${tx.toLowerCase()}`, { at: Math.floor(Date.now() / 1000) });

/**
 * Who the demo scam asks to be paid: Fusebox's own deployer, which Atlas has never saved as a payee, so Payee Guard and
 * the Breaker refuse it. It's ours on purpose: if a wallet without those fuses ever pays it, the money can go back.
 */
export const SCAM_PAYEE: Address = DEPLOYMENT.owner;

export interface DemoApi { path: string; name: string; seller: string; price: string; payTo: Address; blurb: string; honest: boolean }
export const DEMO_APIS: DemoApi[] = [
  { path: "/api/x402/prices", name: "Live cotton price sheet", seller: "Kano Cotton", price: "0.01", payTo: DEPLOYMENT.supplier, honest: true,
    blurb: "Atlas's real supplier sells today's prices per call. Saved payee, a cent a call: every fuse should hold." },
  { path: "/api/x402/scam", name: "\"Wholesale cotton, 70% off, today only\"", seller: "an address nobody saved", price: "3", payTo: SCAM_PAYEE, honest: false,
    blurb: "A too-good offer an agent might find while shopping around. Unknown payee, steep price: the fuses should refuse it before a cent moves." },
];

export function gate(req: Request, api: DemoApi) {
  return requirePayment(req, {
    payTo: api.payTo, price: api.price, secret: secret(), client: client as unknown as PublicClient, factory: DEPLOYMENT.factory,
    description: `${api.name} (${api.seller}), ${api.price} USDT0 per call, paid from a Fusebox wallet`, markUsed,
  });
}

/** Facilitator-style check for sellers using their own x402 stack: verify reads the chain; settle also marks it used. */
export async function facilitate(op: "verify" | "settle", paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse | SettleResponse> {
  const v = await verifyFuseboxPayment(client as unknown as PublicClient, paymentPayload, paymentRequirements, { factory: DEPLOYMENT.factory });
  if (op === "verify") return v;
  const tx = paymentPayload.payload.transaction;
  if (!v.isValid) return { success: false, transaction: tx ?? "", network: XLAYER_NETWORK, errorReason: v.invalidReason, errorMessage: v.invalidMessage };
  if (!(await markUsed(tx))) return { success: false, transaction: tx, network: XLAYER_NETWORK, payer: v.payer, errorReason: "already_settled", errorMessage: "That payment already bought a response." };
  return { success: true, transaction: tx, network: XLAYER_NETWORK, payer: v.payer };
}
