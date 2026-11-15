import "server-only";
import { decodeEventLog, formatUnits, type Address, type Hex } from "viem";
import { fuseboxLogs } from "./logs";
import { client, DEPLOYMENT, IS_FORK } from "./chain";
import { fuseRegistryAbi } from "./abi";

const SOCKET: Record<number, [string, string]> = { 1: ["daily-cap", "Daily Cap"], 2: ["payee-guard", "Payee Guard"], 3: ["breaker", "Breaker"], 4: ["approval-2of3", "Two of Three"] };
const usd = (v: bigint) => formatUnits(v, 6);

export interface MarketFuse {
  fuseId: number; key: string; name: string; processor: Address; circuitId: number; designer: Address; socket: number;
  gates: number; nState: number; fee: string; listed: boolean; decisions: number; earned: string; lifetimeEarned: string; metadataURI: string; onAtlas: boolean;
}
export interface Market { source: "fork" | "mainnet"; fuses: MarketFuse[]; protocolBps: number; protocolEarned: string; totalDecisions: number; totalEarned: string }

let cached: { at: number; data: Market } | null = null;
export async function getMarket(): Promise<Market> {
  if (cached && Date.now() - cached.at < 10_000) return cached.data;
  const R = { address: DEPLOYMENT.registry, abi: fuseRegistryAbi } as const;
  const head = await client.getBlockNumber();
  const listed: { fuseId: bigint; metadataURI: string }[] = [];
  for (const l of await fuseboxLogs(Number(head))) {
    if (l.address.toLowerCase() !== DEPLOYMENT.registry.toLowerCase()) continue;
    try { const ev = decodeEventLog({ abi: fuseRegistryAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }); if (ev.eventName === "FuseListed") listed.push({ fuseId: ev.args.fuseId, metadataURI: ev.args.metadataURI }); } catch {}
  }
  const [bps, protocolEarned] = await Promise.all([
    client.readContract({ ...R, functionName: "protocolFeeBps" }),
    client.readContract({ ...R, functionName: "protocolEarned" }),
  ]);
  const fuses = await Promise.all(listed.map(async (l) => {
    const id = l.fuseId;
    const [f, designer, dec, earned, life] = await Promise.all([
      client.readContract({ ...R, functionName: "fuse", args: [id] }),
      client.readContract({ ...R, functionName: "designerOf", args: [id] }),
      client.readContract({ ...R, functionName: "decisions", args: [id] }),
      client.readContract({ ...R, functionName: "earned", args: [id] }),
      client.readContract({ ...R, functionName: "lifetimeEarned", args: [id] }),
    ]);
    const [key, name] = SOCKET[Number(f.socket)] ?? [`socket-${f.socket}`, `Fuse #${id}`];
    return {
      fuseId: Number(id), key, name, processor: f.processor, circuitId: Number(f.circuitId), designer, socket: Number(f.socket),
      gates: Number(f.gateCount), nState: Number(f.nState), fee: usd(f.fee), listed: f.listed, decisions: Number(dec),
      earned: usd(earned), lifetimeEarned: usd(life), metadataURI: l.metadataURI ?? "", onAtlas: DEPLOYMENT.fuseIds.includes(Number(id)),
    } satisfies MarketFuse;
  }));
  const data: Market = {
    source: IS_FORK ? "fork" : "mainnet", fuses, protocolBps: Number(bps), protocolEarned: usd(protocolEarned),
    totalDecisions: fuses.reduce((t, f) => t + f.decisions, 0), totalEarned: fuses.reduce((t, f) => t + Number(f.lifetimeEarned), 0).toFixed(6),
  };
  cached = { at: Date.now(), data };
  return data;
}
