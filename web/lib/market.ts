import "server-only";
import { decodeEventLog, formatUnits, type Address, type Hex } from "viem";
import { fuseboxLogs } from "./logs";
import { client, CURRENT, DEPLOYMENT, IS_FORK, isBuiltIn, V1 } from "./chain";
import { fuseRegistryAbi } from "./abi";
import { decodeDataUri, sanitize, type FuseMeta } from "./fuseMeta";

const SOCKET: Record<number, [string, string]> = { 1: ["daily-cap", "Daily Cap"], 2: ["payee-guard", "Payee Guard"], 3: ["breaker", "Breaker"], 4: ["approval-2of3", "Two of Three"], 5: ["repeat-guard", "Repeat Guard"] };
const usd = (v: bigint) => formatUnits(v, 6);

export interface MarketFuse {
  fuseId: number; key: string; name: string; processor: Address; circuitId: number; designer: Address; socket: number;
  gates: number; nState: number; fee: string; listed: boolean; decisions: number; earned: string; lifetimeEarned: string; metadataURI: string; onAtlas: boolean; netlistHash: Hex; nIn: number;
  listedAt: number; meta: FuseMeta | null; original: boolean;
  /** claimable fees per registry: a v2 fuse that is also listed on v1 (the same circuit) earned on both */
  claims: { registry: Address; fuseId: number; earned: string }[];
  /** the same circuit's id on v1, which is what a v1 wallet installs (v1 has no Repeat Guard or later fuses) */
  v1FuseId?: number;
}
export interface Market { source: "fork" | "mainnet"; fuses: MarketFuse[]; protocolBps: number; protocolEarned: string; totalDecisions: number; totalEarned: string }

// ---- listing metadata: on-chain data URIs decode here; an https link is fetched once in a while, small and bounded
const metaCache = new Map<string, { at: number; meta: FuseMeta | null }>();
const META_MAX = 16_384;
/** A listing's link must name a public host: no localhost, no private or link-local address. */
function publicHttps(uri: string): boolean {
  let h: string;
  try { const u = new URL(uri); if (u.protocol !== "https:") return false; h = u.hostname.toLowerCase().replace(/^\[|\]$/g, ""); } catch { return false; }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  if (v4) return !(v4[0] === 10 || v4[0] === 127 || v4[0] === 0 || (v4[0] === 169 && v4[1] === 254) || (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) || (v4[0] === 192 && v4[1] === 168) || (v4[0] === 100 && v4[1] >= 64 && v4[1] <= 127));
  if (h.includes(":")) return false; // IPv6 literals: no listing needs one
  return h.includes(".") && !/(^|\.)(localhost|local|internal|lan)$/.test(h);
}
/** The body, read only up to `max` bytes however the server sends it; null past that. */
async function readCapped(r: Response, max: number): Promise<string | null> {
  if (!r.body) return null;
  const reader = r.body.getReader(), chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
async function resolveMeta(uri: string): Promise<FuseMeta | null> {
  if (!uri) return null;
  if (uri.startsWith("data:")) return decodeDataUri(uri);
  if (!publicHttps(uri)) return null;
  const hit = metaCache.get(uri);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.meta;
  let meta: FuseMeta | null = null;
  try {
    const r = await fetch(uri, { signal: AbortSignal.timeout(3000), redirect: "error", headers: { accept: "application/json" }, cache: "no-store" });
    const t = r.ok ? await readCapped(r, META_MAX) : null;
    if (t) meta = sanitize(JSON.parse(t));
  } catch { /* unreachable or not JSON: the listing shows without it */ }
  metaCache.set(uri, { at: Date.now(), meta });
  return meta;
}

/**
 * The market is v2's registry (where new fuses list and new wallets install). Fuses 1-4 are also listed on v1, the
 * same circuits Atlas runs, so their decisions and earnings add up across both registries.
 */
let cached: { at: number; data: Market } | null = null;
export async function getMarket(): Promise<Market> {
  if (cached && Date.now() - cached.at < 10_000) return cached.data;
  const R = { address: CURRENT.registry, abi: fuseRegistryAbi } as const;
  const R1 = { address: V1.registry, abi: fuseRegistryAbi } as const;
  const head = await client.getBlockNumber();
  const listed: { fuseId: bigint; metadataURI: string }[] = [];
  const v1Twin = new Map<string, bigint>(); // "processor:circuit" -> v1 fuse id
  for (const l of await fuseboxLogs(Number(head))) {
    const onV2 = l.address.toLowerCase() === CURRENT.registry.toLowerCase(), onV1 = l.address.toLowerCase() === V1.registry.toLowerCase();
    if (!onV2 && !onV1) continue;
    try {
      const ev = decodeEventLog({ abi: fuseRegistryAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      if (ev.eventName !== "FuseListed") continue;
      if (onV2) listed.push({ fuseId: ev.args.fuseId, metadataURI: ev.args.metadataURI });
      else v1Twin.set(`${ev.args.processor.toLowerCase()}:${ev.args.circuitId}`, ev.args.fuseId);
    } catch {}
  }
  const [bps, protocolEarned, protocolEarnedV1] = await Promise.all([
    client.readContract({ ...R, functionName: "protocolFeeBps" }),
    client.readContract({ ...R, functionName: "protocolEarned" }),
    client.readContract({ ...R1, functionName: "protocolEarned" }),
  ]);
  const fuses = await Promise.all(listed.map(async (l) => {
    const id = l.fuseId;
    const [f, designer, dec, earned, life, uri] = await Promise.all([
      client.readContract({ ...R, functionName: "fuse", args: [id] }),
      client.readContract({ ...R, functionName: "designerOf", args: [id] }),
      client.readContract({ ...R, functionName: "decisions", args: [id] }),
      client.readContract({ ...R, functionName: "earned", args: [id] }),
      client.readContract({ ...R, functionName: "lifetimeEarned", args: [id] }),
      client.readContract({ ...R, functionName: "metadataURI", args: [id] }), // live: designers can change it
    ]);
    // the same circuit listed on v1 by the same designer: Atlas's decisions and the fees they earned count here too
    const twin = v1Twin.get(`${f.processor.toLowerCase()}:${f.circuitId}`);
    const [d1, e1, l1] = twin !== undefined && (await client.readContract({ ...R1, functionName: "designerOf", args: [twin] })).toLowerCase() === designer.toLowerCase()
      ? await Promise.all([
        client.readContract({ ...R1, functionName: "decisions", args: [twin] }),
        client.readContract({ ...R1, functionName: "earned", args: [twin] }),
        client.readContract({ ...R1, functionName: "lifetimeEarned", args: [twin] }),
      ])
      : [0n, 0n, 0n];
    const [key, name] = SOCKET[Number(f.socket)] ?? [`socket-${f.socket}`, `Fuse #${id}`];
    const claims = [{ registry: CURRENT.registry, fuseId: Number(id), earned: usd(earned) }, ...(twin !== undefined && e1 > 0n ? [{ registry: V1.registry, fuseId: Number(twin), earned: usd(e1) }] : [])];
    return {
      fuseId: Number(id), key, name, processor: f.processor, circuitId: Number(f.circuitId), designer, socket: Number(f.socket),
      gates: Number(f.gateCount), nState: Number(f.nState), fee: usd(f.fee), listed: f.listed, decisions: Number(dec + d1),
      earned: usd(earned + e1), lifetimeEarned: usd(life + l1), metadataURI: uri || l.metadataURI || "", onAtlas: DEPLOYMENT.fuseIds.includes(Number(id)), netlistHash: f.netlistHash, nIn: Number(f.nIn),
      listedAt: Number(f.listedAt), meta: await resolveMeta(uri || l.metadataURI || ""), original: isBuiltIn(CURRENT.registry, Number(id)), claims,
      ...(twin !== undefined ? { v1FuseId: Number(twin) } : {}),
    } satisfies MarketFuse;
  }));
  const data: Market = {
    source: IS_FORK ? "fork" : "mainnet", fuses, protocolBps: Number(bps), protocolEarned: usd(protocolEarned + protocolEarnedV1),
    totalDecisions: fuses.reduce((t, f) => t + f.decisions, 0), totalEarned: fuses.reduce((t, f) => t + Number(f.lifetimeEarned), 0).toFixed(6),
  };
  cached = { at: Date.now(), data };
  return data;
}
