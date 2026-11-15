import { isAddress, parseUnits, type Address } from "viem";
import { checkPayment } from "@/lib/atlas";

export const dynamic = "force-dynamic";

/** A free, read-only check() against the Atlas demo wallet: which fuses would let this payment through? */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const to = u.searchParams.get("to") ?? "";
  const amount = u.searchParams.get("amount") ?? "";
  if (!isAddress(to, { strict: false })) return Response.json({ error: "Enter a valid 0x address for the payee." }, { status: 400 });
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) return Response.json({ error: "Enter an amount above 0, up to 6 decimals." }, { status: 400 });
  try {
    return Response.json(await checkPayment(to.toLowerCase() as Address, parseUnits(amount, 6)), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("check", (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now. Try again." }, { status: 503 });
  }
}
