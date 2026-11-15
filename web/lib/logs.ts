import "server-only";
import { unstable_cache } from "next/cache";
import { toEventSelector, type Address, type Hex } from "viem";
import { DEPLOYMENT, IS_FORK, RPC } from "./chain";
import { fuseboxFactoryAbi, fuseboxWalletAbi, fuseRegistryAbi } from "./abi";
import index from "./deployments/mainnet-index.json";

/**
 * Every Fusebox event the app reads, for Atlas, the registry, the factory and every wallet the factory made,
 * without scanning X Layer's whole history on each request:
 *  - one shared scan filtered by event signature (no address filter), so a single pass serves every wallet;
 *  - blocks before `scannedTo` come from mainnet-index.json (scripts/index-logs.mjs, refreshed on every build);
 *  - after that, aligned 1,000-block windows. Finished windows never change, so each is fetched once and kept in
 *    Next's data cache, shared by every server instance. An hourly warm-up keeps the uncached tail short.
 * X Layer caps eth_getLogs ranges: tapeout.net 1,000 blocks, rpc.xlayer.tech 100.
 */
export interface RawLog { address: Address; topics: Hex[]; data: Hex; blockNumber: number; transactionHash: Hex; logIndex: number }

const sel = (abi: readonly unknown[], name: string) => {
  const ev = (abi as { type: string; name: string }[]).find((e) => e.type === "event" && e.name === name);
  if (!ev) throw new Error(`event ${name} missing from ABI`);
  return toEventSelector(ev as Parameters<typeof toEventSelector>[0]);
};
export const TOPIC = {
  decision: sel(fuseboxWalletAbi, "Decision"), payeeAdded: sel(fuseboxWalletAbi, "PayeeAdded"), payeeRemoved: sel(fuseboxWalletAbi, "PayeeRemoved"),
  agentSet: sel(fuseboxWalletAbi, "AgentSet"), fuseListed: sel(fuseRegistryAbi, "FuseListed"), walletCreated: sel(fuseboxFactoryAbi, "WalletCreated"),
};
const TOPICS = Object.values(TOPIC);

const LOGS_RPC = process.env.FUSEBOX_LOGS_RPC;
const SOURCES: [string, number][] = IS_FORK ? [[RPC, 5000]] : LOGS_RPC ? [[LOGS_RPC, 1000]] : [["https://tapeout.net/rpc-xlayer", 1000], [RPC, 100]];
const IDX = IS_FORK ? { blocks: [] as number[], scannedTo: DEPLOYMENT.fromBlock - 1 } : (index as { blocks: number[]; scannedTo: number });
const WINDOW = 1000;
const FINAL = 64; // a window is cached once its last block is this far behind the head
const LAG = 6; // blocks this close to the head are re-read on every call, in case the log source is a little behind

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store", signal: AbortSignal.timeout(12_000) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}

/** All logs carrying one of our event signatures in [a, b], from any contract (filtered later). */
async function scan(a: number, b: number): Promise<RawLog[]> {
  let last: unknown;
  for (const [url, step] of SOURCES) {
    try {
      const out: RawLog[] = [];
      const parts: [number, number][] = [];
      for (let f = a; f <= b; f += step) parts.push([f, Math.min(b, f + step - 1)]);
      for (let i = 0; i < parts.length; i += 6) {
        const res = await Promise.all(parts.slice(i, i + 6).map(([f, t]) => rpc<Record<string, string | string[]>[]>(url, "eth_getLogs", [{ topics: [TOPICS], fromBlock: "0x" + f.toString(16), toBlock: "0x" + t.toString(16) }])));
        res.flat().forEach((l) => out.push({ address: (l.address as string).toLowerCase() as Address, topics: l.topics as Hex[], data: l.data as Hex, blockNumber: parseInt(l.blockNumber as string, 16), transactionHash: l.transactionHash as Hex, logIndex: parseInt(l.logIndex as string, 16) }));
      }
      return out;
    } catch (e) { last = e; }
  }
  throw last;
}

// Finished ranges are immutable: keep them in the shared data cache. The key includes the log source, so a fork
// rehearsal never reuses mainnet results.
const cachedScan = unstable_cache(async (a: number, b: number) => scan(a, b), ["fusebox-logs-v2", SOURCES[0][0]], { revalidate: false });

const state = { ready: false, scannedTo: IDX.scannedTo, logs: [] as RawLog[], seen: new Set<string>() };
const keep = (l: RawLog) => { const k = `${l.transactionHash}:${l.logIndex}`; if (state.seen.has(k)) return; state.seen.add(k); state.logs.push(l); };
let inflight: Promise<RawLog[]> | null = null;

async function extend(head: number) {
  if (!state.ready) {
    // blocks recorded by the index, grouped into as few range calls as possible (all-or-nothing, so a retry can't duplicate)
    const groups: [number, number][] = [];
    for (const blk of IDX.blocks) { const g = groups[groups.length - 1]; if (g && blk - g[0] < WINDOW) g[1] = blk; else groups.push([blk, blk]); }
    const got: RawLog[] = [];
    for (let i = 0; i < groups.length; i += 4) (await Promise.all(groups.slice(i, i + 4).map(([a, b]) => cachedScan(a, b)))).forEach((l) => got.push(...l));
    got.forEach(keep);
    state.ready = true;
  }
  // A head behind what we've scanned means the source changed under us (a fork, a lagging node): rewind; `keep` dedupes.
  if (head < state.scannedTo) state.scannedTo = Math.max(DEPLOYMENT.fromBlock - 1, head - 2 * WINDOW);
  const stable = head - LAG;
  const ranges: [number, number][] = [];
  for (let from = state.scannedTo + 1; from <= stable;) {
    const end = Math.min(stable, (Math.floor(from / WINDOW) + 1) * WINDOW - 1); // aligned windows, so cache keys repeat
    ranges.push([from, end]);
    from = end + 1;
  }
  // in order, a batch at a time: progress is kept if a later batch fails, and nothing is fetched twice
  for (let i = 0; i < ranges.length; i += 8) {
    const batch = ranges.slice(i, i + 8);
    const res = await Promise.all(batch.map(([a, b]) => (b < head - FINAL && b - a === WINDOW - 1 ? cachedScan(a, b) : scan(a, b))));
    res.forEach((l) => l.forEach(keep));
    state.scannedTo = batch[batch.length - 1][1];
  }
  // the newest few blocks: read every time, never marked as scanned
  if (head > state.scannedTo) (await scan(state.scannedTo + 1, head)).forEach(keep);
}

/** Every Fusebox log up to `head`: registry, factory, and every wallet the factory created (Atlas included). */
export function fuseboxLogs(head: number): Promise<RawLog[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    await extend(head);
    const known = new Set([DEPLOYMENT.registry.toLowerCase(), DEPLOYMENT.factory.toLowerCase(), DEPLOYMENT.atlas.toLowerCase()]);
    for (const l of state.logs) if (l.topics[0] === TOPIC.walletCreated && l.address === DEPLOYMENT.factory.toLowerCase() && l.topics[1]) known.add(("0x" + l.topics[1].slice(26)).toLowerCase());
    return state.logs.filter((l) => known.has(l.address));
  })().finally(() => { inflight = null; });
  return inflight;
}
