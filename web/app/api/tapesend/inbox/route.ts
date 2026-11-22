import { getAddress, isAddress } from "viem";
import { HERALD, inboxOf } from "@/lib/tapesend";

export const dynamic = "force-dynamic";

/** GET ?wallet=0x… → the latest messages in that wallet's TapeSend inbox on X Layer, checked against the hub. */
export async function GET(req: Request) {
  const w = new URL(req.url).searchParams.get("wallet") ?? "";
  if (!isAddress(w)) return Response.json({ error: "Pass ?wallet=0x… (a Fusebox wallet address)." }, { status: 400 });
  try {
    const r = await inboxOf(getAddress(w), 10);
    return Response.json(
      { wallet: getAddress(w), herald: HERALD ? { address: HERALD.address, container: HERALD.container, circuitId: HERALD.circuitId, hub: HERALD.hub } : null, ...r },
      { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } },
    );
  } catch (e) {
    console.error("tapesend inbox", (e as Error).message);
    return Response.json({ error: "Couldn't read the inbox from X Layer just now." }, { status: 503 });
  }
}
