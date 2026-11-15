import { getMarket } from "@/lib/market";
import { IS_FORK } from "@/lib/chain";
import snapshot from "@/lib/deployments/market-snapshot.json";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getMarket(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("market", (e as Error).message);
    if (IS_FORK) return Response.json({ ...snapshot, source: "snapshot" });
    return Response.json({ error: "chain unreachable" }, { status: 503 });
  }
}
