import { isAddress, getAddress } from "viem";
import { getWallet, isFuseboxWallet } from "@/lib/atlas";

export const dynamic = "force-dynamic";

/** Snapshot of any wallet the Fusebox factory created. ?from=<block> starts its history at its creation block. */
export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!isAddress(address, { strict: false })) return Response.json({ error: "Not an address." }, { status: 400 });
  const addr = getAddress(address);
  const fromQ = Number(new URL(req.url).searchParams.get("from"));
  try {
    if (!(await isFuseboxWallet(addr))) return Response.json({ error: "This address isn't a Fusebox wallet." }, { status: 404 });
    return Response.json(await getWallet(addr, Number.isFinite(fromQ) && fromQ > 0 ? fromQ : undefined), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("wallet", (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now." }, { status: 503 });
  }
}
