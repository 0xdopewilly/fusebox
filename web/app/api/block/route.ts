// Latest X Layer mainnet block, for the live header. Cached briefly so many visitors make few RPC calls.
const RPCS = ["https://rpc.xlayer.tech", "https://xlayer.drpc.org"];
let cache: { at: number; block: number } | null = null;

export const dynamic = "force-dynamic";

export async function GET() {
  if (cache && Date.now() - cache.at < 1500) return Response.json({ block: cache.block, chainId: 196 });
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      const j = await r.json();
      const block = parseInt(j.result, 16);
      if (Number.isFinite(block)) {
        cache = { at: Date.now(), block };
        return Response.json({ block, chainId: 196 });
      }
    } catch {}
  }
  return Response.json({ block: cache?.block ?? null, chainId: 196 }, { status: cache ? 200 : 502 });
}
