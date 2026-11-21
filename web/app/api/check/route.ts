import { isAddress, parseUnits, type Address } from "viem";
import { checkPayment } from "@/lib/atlas";
import { DEMO_WALLET, DEPLOYMENT } from "@/lib/chain";

export const dynamic = "force-dynamic";
// a cold start may need to catch up on blocks since the last visit; finished windows are cached for everyone after
export const maxDuration = 60;

/** A free, read-only check() against a demo wallet (Atlas, or its v2 twin with ?wallet=): which fuses would let this payment through? */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const to = u.searchParams.get("to") ?? "";
  const amount = u.searchParams.get("amount") ?? "";
  const w = (u.searchParams.get("wallet") ?? DEPLOYMENT.atlas).toLowerCase();
  const wallet = [DEPLOYMENT.atlas, DEMO_WALLET].find((x) => x.toLowerCase() === w);
  if (!wallet) return Response.json({ error: "Checks run against the demo wallets only." }, { status: 400 });
  if (!isAddress(to, { strict: false })) return Response.json({ error: "Enter a valid 0x address for the payee." }, { status: 400 });
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) return Response.json({ error: "Enter an amount above 0, up to 6 decimals." }, { status: 400 });
  try {
    return Response.json(await checkPayment(to.toLowerCase() as Address, parseUnits(amount, 6), wallet), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("check", (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now. Try again." }, { status: 503 });
  }
}
