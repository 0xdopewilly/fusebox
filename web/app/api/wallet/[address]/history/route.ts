import { isAddress, getAddress } from "viem";
import { getHistory, isFuseboxWallet } from "@/lib/atlas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A wallet's whole decision history in a compact form, for the spending view (newest 5,000). */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!isAddress(address, { strict: false })) return Response.json({ error: "Not an address." }, { status: 400 });
  const addr = getAddress(address.toLowerCase());
  try {
    const [ok, h] = await Promise.all([isFuseboxWallet(addr), getHistory(addr).catch(() => null)]);
    if (!ok) return Response.json({ error: "This address isn't a Fusebox wallet." }, { status: 404 });
    if (!h) throw new Error("history unavailable");
    const S = { pass: 0, blew: 1, failed: 2, untrusted: 3 } as const;
    return Response.json({
      names: h.names,
      saved: [...h.payees.keys()],
      // t: unix seconds · a: USDT0 · ok: paid · s: per-fuse status (0 pass, 1 blew, 2 failed, 3 untrusted) · f: fees
      rows: h.rows.slice(-5000).map((r) => ({ id: r.id, t: r.time, to: r.to, a: Number(r.amount), ok: r.allowed, s: r.status.map((x) => S[x] ?? 2), f: Number(r.fee) })),
    }, { headers: { "cache-control": "public, max-age=20, s-maxage=20" } });
  } catch (e) {
    console.error("history", (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now." }, { status: 503 });
  }
}
