import { isAddress, getAddress } from "viem";
import { getWallet, isFuseboxWallet } from "@/lib/atlas";

export const dynamic = "force-dynamic";
// a cold start may need to catch up on blocks since the last visit; finished windows are cached for everyone after
export const maxDuration = 60;

/** Snapshot of any wallet the Fusebox factory created, with its full history. (A legacy ?from= is ignored.) */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!isAddress(address, { strict: false })) return Response.json({ error: "Not an address." }, { status: 400 });
  const addr = getAddress(address);
  // asked together: the factory check and the snapshot share one round of RPC calls
  const [isW, data] = await Promise.allSettled([isFuseboxWallet(addr), getWallet(addr)]);
  if (isW.status === "fulfilled" && !isW.value) return Response.json({ error: "This address isn't a Fusebox wallet." }, { status: 404 });
  if (isW.status === "fulfilled" && data.status === "fulfilled") return Response.json(data.value, { headers: { "cache-control": "no-store" } });
  console.error("wallet", ((isW.status === "rejected" ? isW.reason : (data as PromiseRejectedResult).reason) as Error)?.message);
  return Response.json({ error: "Couldn't reach X Layer just now." }, { status: 503 });
}
