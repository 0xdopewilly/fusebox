import { getAtlas } from "@/lib/atlas";
import snapshot from "@/lib/deployments/fork-snapshot.json";
import { IS_FORK } from "@/lib/chain";

export const dynamic = "force-dynamic";
// a cold start may need to catch up on blocks since the last visit; finished windows are cached for everyone after
export const maxDuration = 60;

export async function GET() {
  try {
    return Response.json(await getAtlas(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("atlas", (e as Error).message);
    // Before the mainnet launch the deployed preview can't reach the local fork: serve the rehearsal snapshot, labelled.
    if (IS_FORK) return Response.json({ ...snapshot, source: "snapshot" }, { headers: { "cache-control": "no-store" } });
    return Response.json({ error: "chain unreachable" }, { status: 503 });
  }
}
