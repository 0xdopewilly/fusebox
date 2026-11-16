import "server-only";
import { client, DEPLOYMENT, RPCS } from "./chain";
import { fuseRegistryAbi } from "./abi";
import { getAtlas } from "./atlas";
import { agentMode } from "./robAgent";
import { DEMO_APIS, gate } from "./x402";
import { PUSH_READY, subscribedApprovers } from "./push";
import { STORE_KIND } from "./store";
import index from "./deployments/mainnet-index.json";

/**
 * The status page's checks: every moving part Fusebox depends on, each with its own timeout, run in parallel and
 * cached for 30 s so a busy page can't hammer X Layer, TapeOut, NEAR AI or the store.
 */
export type Level = "ok" | "warn" | "down";
export interface Check { key: string; group: string; name: string; level: Level; value: string; detail: string; ms?: number }
export interface Status { at: number; level: Level; checks: Check[] }

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`no answer in ${ms / 1000} s`)), ms))]);
async function timed<T>(fn: () => Promise<T>, ms = 8000): Promise<{ v?: T; e?: string; ms: number }> {
  const t = Date.now();
  try { return { v: await within(fn(), ms), ms: Date.now() - t }; } catch (e) { return { e: (e as Error).message.slice(0, 120), ms: Date.now() - t }; }
}
const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };

async function rpcHead(url: string): Promise<number> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }), cache: "no-store" });
  const j = (await r.json()) as { result?: string };
  if (!j.result) throw new Error(`HTTP ${r.status}`);
  return parseInt(j.result, 16);
}

let cached: Status | null = null;
export async function getStatus(origin: string): Promise<Status> {
  if (cached && Date.now() - cached.at < 30_000) return cached;
  const R = { address: DEPLOYMENT.registry, abi: fuseRegistryAbi } as const;
  const [rpcs, atlas, trusted, offer, subs, near] = await Promise.all([
    Promise.all(RPCS.map((u) => timed(() => rpcHead(u), 6000).then((r) => ({ u, ...r })))),
    timed(() => getAtlas(), 20_000),
    timed(() => client.readContract({ ...R, functionName: "isTrustedProcessor", args: [DEPLOYMENT.processor] })),
    timed(async () => { const g = await gate(new Request(origin + DEMO_APIS[0].path), DEMO_APIS[0]); if (g.paid) throw new Error("unexpected"); return g.response.headers.get("PAYMENT-REQUIRED") ? g.response.status : 0; }),
    timed(() => (PUSH_READY ? subscribedApprovers().then((a) => a.length) : Promise.resolve(-1))),
    timed(async () => {
      if (!process.env.NEARAI_API_KEY) return null;
      const r = await fetch(`${process.env.NEARAI_BASE_URL || "https://cloud-api.near.ai/v1"}/models`, { headers: { authorization: `Bearer ${process.env.NEARAI_API_KEY}` }, cache: "no-store" });
      return r.status;
    }),
  ]);

  const checks: Check[] = [];
  const heads = rpcs.filter((r) => r.v).map((r) => r.v as number), best = heads.length ? Math.max(...heads) : 0;
  for (const r of rpcs) {
    const behind = r.v ? best - r.v : 0;
    checks.push({ key: `rpc-${host(r.u)}`, group: "X Layer", name: `RPC · ${host(r.u)}`, ms: r.ms,
      level: r.e ? (heads.length ? "warn" : "down") : r.ms > 3000 || behind > 20 ? "warn" : "ok",
      value: r.e ? "no answer" : `${r.ms} ms`, detail: r.e ? `${r.e}; reads fall back to the other RPCs` : `block ${r.v!.toLocaleString("en-US")}${behind ? `, ${behind} behind` : ""}` });
  }
  const lag = best ? best - index.scannedTo : 0;
  checks.push({ key: "index", group: "X Layer", name: "Event index", level: !best ? "warn" : lag > 50_000 ? "warn" : "ok",
    value: best ? `${lag.toLocaleString("en-US")} blocks to catch up` : "unknown",
    detail: "Blocks since the committed index was built (each deploy refreshes it); the app reads the rest live, in cached windows." });

  checks.push({ key: "processor", group: "TapeOut", name: "Processor trust", level: trusted.e ? "warn" : trusted.v ? "ok" : "down",
    value: trusted.e ? "unknown" : trusted.v ? "trusted" : "untrusted",
    detail: trusted.v ? "TapeOut's processor runs the code Fusebox pinned, so every fuse evaluates." : trusted.e ? `couldn't read it: ${trusted.e}` : "TapeOut's processor code changed: every fuse fails closed and charges nothing until it's re-attested." });

  if (atlas.v) {
    const a = atlas.v;
    const per = a.fuses.reduce((t, f) => t + Math.min(Number(f.fee), Number(f.maxFee)), 0);
    const covers = per > 0 ? Math.floor(Number(a.feeBalance) / per) : 0;
    const blown = a.fuses.filter((f) => f.latched).map((f) => f.name);
    checks.push({ key: "atlas", group: "Atlas", name: "Atlas line", level: a.paused || blown.length ? "warn" : "ok",
      value: a.paused ? "paused" : blown.length ? `${blown.join(", ")} blown` : `${a.fuses.length} fuses closed`, detail: `${a.counts.decisions} decisions on mainnet; the last ${a.decisions[0] ? new Date(a.decisions[0].time * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "none yet"}.` });
    checks.push({ key: "fees", group: "Atlas", name: "Prepaid fees", level: covers < 5 ? "warn" : "ok",
      value: `${Number(a.feeBalance).toFixed(4)} USD₮0`, detail: `Covers about ${covers} more decisions at ${per.toFixed(4)} USD₮0 each.` });
  } else checks.push({ key: "atlas", group: "Atlas", name: "Atlas line", level: "warn", value: "unknown", detail: `couldn't read Atlas: ${atlas.e}` });

  const am = agentMode();
  checks.push({ key: "agent", group: "Services", name: "Rob the agent", level: am.mode === "llm" ? "ok" : process.env.NEARAI_API_KEY || process.env.ANTHROPIC_API_KEY ? "warn" : "ok",
    value: am.mode === "llm" ? am.label : "scripted agent", detail: am.mode === "llm" ? "The model answers, within per-visitor and per-server caps." : "The model is off or cooling down, so the scripted agent answers." });
  if (near.v !== null && near.v !== undefined || near.e) checks.push({ key: "nearai", group: "Services", name: "NEAR AI Cloud", ms: near.ms, level: near.e ? "warn" : near.v === 200 ? "ok" : "warn",
    value: near.e ? "no answer" : near.v === 200 ? `${near.ms} ms` : `HTTP ${near.v}`, detail: near.e ? near.e : "Hosts the model behind Rob the agent and plain-English guardrails." });
  checks.push({ key: "x402", group: "Services", name: "x402 sellers", ms: offer.ms, level: offer.v === 402 ? "ok" : "down",
    value: offer.v === 402 ? "issuing offers" : "not issuing", detail: offer.v === 402 ? "The demo price sheet answers 402 with a signed Fusebox offer." : `couldn't sign an offer: ${offer.e ?? "unknown"}` });
  checks.push({ key: "alerts", group: "Services", name: "Approver alerts", level: subs.e ? "warn" : subs.v === -1 ? "warn" : "ok",
    value: subs.e ? "store unreachable" : subs.v === -1 ? "not configured" : `${subs.v} approver${subs.v === 1 ? "" : "s"} subscribed`, detail: `Web push (VAPID) with subscriptions in ${STORE_KIND === "blob" ? "a private Vercel Blob store" : "the local file store"}; swept hourly.` });

  const level: Level = checks.some((c) => c.level === "down") ? "down" : checks.some((c) => c.level === "warn") ? "warn" : "ok";
  cached = { at: Date.now(), level, checks };
  return cached;
}
