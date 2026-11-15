import "server-only";
import type { Address, Hex } from "viem";
import { DEPLOYMENT, IS_FORK, RPC } from "./chain";
import index from "./deployments/mainnet-index.json";

/**
 * Every Atlas and registry log since deployment, without scanning X Layer's whole history:
 * blocks recorded in mainnet-index.json (scripts/index-logs.mjs), then a forward scan from where the index stops.
 * X Layer caps eth_getLogs ranges: tapeout.net 1000 blocks, rpc.xlayer.tech 100.
 */
export interface RawLog { address: Address; topics: Hex[]; data: Hex; blockNumber: number; transactionHash: Hex; logIndex: number }
const SOURCES: [string, number][] = IS_FORK ? [[RPC, 5000]] : [[process.env.FUSEBOX_LOGS_RPC || "https://tapeout.net/rpc-xlayer", 1000], [RPC, 100]];
const IDX = IS_FORK ? { blocks: [] as number[], scannedTo: DEPLOYMENT.fromBlock - 1 } : (index as { blocks: number[]; scannedTo: number });

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store", signal: AbortSignal.timeout(12_000) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}
async function getLogs(a: number, b: number): Promise<RawLog[]> {
  let last: unknown;
  for (const [url, step] of SOURCES) {
    try {
      const out: RawLog[] = [];
      const windows: [number, number][] = [];
      for (let f = a; f <= b; f += step) windows.push([f, Math.min(b, f + step - 1)]);
      for (let i = 0; i < windows.length; i += 6) {
        const res = await Promise.all(windows.slice(i, i + 6).map(([f, t]) => rpc<Record<string, string | string[]>[]>(url, "eth_getLogs", [{ address: [DEPLOYMENT.atlas, DEPLOYMENT.registry], fromBlock: "0x" + f.toString(16), toBlock: "0x" + t.toString(16) }])));
        res.flat().forEach((l) => out.push({ address: l.address as Address, topics: l.topics as Hex[], data: l.data as Hex, blockNumber: parseInt(l.blockNumber as string, 16), transactionHash: l.transactionHash as Hex, logIndex: parseInt(l.logIndex as string, 16) }));
      }
      return out;
    } catch (e) { last = e; }
  }
  throw last;
}

const state = { ready: false, scannedTo: IDX.scannedTo, logs: [] as RawLog[] };
let inflight: Promise<RawLog[]> | null = null;

export function fuseboxLogs(head: number): Promise<RawLog[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    if (!state.ready) {
      // indexed blocks, grouped into as few range calls as possible
      const groups: [number, number][] = [];
      for (const blk of IDX.blocks) { const g = groups[groups.length - 1]; if (g && blk - g[0] < 1000) g[1] = blk; else groups.push([blk, blk]); }
      for (const [a, b] of groups) state.logs.push(...(await getLogs(a, b)));
      state.ready = true;
    }
    if (head > state.scannedTo) { state.logs.push(...(await getLogs(state.scannedTo + 1, head))); state.scannedTo = head; }
    return state.logs;
  })().finally(() => { inflight = null; });
  return inflight;
}
