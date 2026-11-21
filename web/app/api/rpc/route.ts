import { RPCS } from "@/lib/chain";
import { ipKey } from "@/lib/clientIp";

export const dynamic = "force-dynamic";

/** The methods the browser needs: reads, plus broadcasting a transaction an in-browser agent key already signed (the
 *  Fusebox assistant and the first-payment guide). Nothing here can sign; owners still sign in their own wallet. */
const ALLOWED = new Set([
  "eth_chainId", "net_version", "eth_blockNumber", "eth_call", "eth_estimateGas", "eth_getBalance", "eth_getCode",
  "eth_getStorageAt", "eth_getLogs", "eth_getTransactionCount", "eth_getTransactionByHash", "eth_getTransactionReceipt",
  "eth_getBlockByNumber", "eth_getBlockByHash", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory",
  "eth_sendRawTransaction",
]);
const MAX_BATCH = 25;
/** The widest eth_getLogs range served (X Layer's public RPCs cap far lower; the app reads in 1,000-block windows). */
const MAX_LOG_SPAN = 5_000n;
/** Requests per visitor (IPv4, or IPv6 /64) per minute, per instance: the app's own pages stay far below it. */
const PER_MINUTE = 240;
const hits = new Map<string, number[]>();
function allow(key: string) {
  if (key === "local") return true; // no proxy header: a local run, not the deployment
  const now = Date.now(), w = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (w.length >= PER_MINUTE) return false;
  w.push(now); hits.set(key, w); if (hits.size > 10_000) hits.clear();
  return true;
}
const asBlock = (v: unknown): bigint | null => (typeof v === "string" && /^0x[0-9a-f]+$/i.test(v) ? BigInt(v) : null);
/** A logs query must name a block hash, or a numeric range no wider than MAX_LOG_SPAN. */
function logsTooWide(params: unknown[] | undefined): boolean {
  const f = (params?.[0] ?? {}) as { blockHash?: unknown; fromBlock?: unknown; toBlock?: unknown };
  if (f.blockHash) return false;
  const from = asBlock(f.fromBlock), to = asBlock(f.toBlock);
  return from === null || to === null || to < from || to - from > MAX_LOG_SPAN;
}

type Req = { jsonrpc: "2.0"; id: number | string | null; method: string; params?: unknown[] };
type Res = { id?: unknown; result?: unknown; error?: { code?: number; message?: string } };

const fail = (id: unknown, code: number, message: string, status = 200) =>
  Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });

/** A revert is the chain's real answer; any other error (range caps, CDN pages, rate limits) means try the next RPC. */
const authoritative = (r: Res) => !r.error || /revert/i.test(r.error.message ?? "") || r.error.code === 3;

export async function POST(req: Request) {
  // this endpoint serves the app's own pages: a browser request from another site is refused
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "same-site") return fail(null, -32600, "This RPC serves the Fusebox app only.", 403);
  if (!allow(ipKey(req))) return fail(null, -32005, "Too many requests: slow down.", 429);
  let body: Req | Req[];
  try { body = await req.json(); } catch { return fail(null, -32700, "parse error", 400); }
  const calls = Array.isArray(body) ? body : [body];
  if (!calls.length || calls.length > MAX_BATCH) return fail(null, -32600, `batch must hold 1-${MAX_BATCH} calls`, 400);
  for (const c of calls) {
    if (!c || typeof c.method !== "string") return fail(null, -32600, "invalid request", 400);
    if (!ALLOWED.has(c.method)) return fail(c.id, -32601, `${c.method} is not available on this read-only endpoint`);
    if (c.method === "eth_getLogs" && logsTooWide(c.params)) return fail(c.id, -32602, `eth_getLogs needs a numeric range of at most ${MAX_LOG_SPAN} blocks, or a block hash`);
  }

  const payload = JSON.stringify(body);
  let last: unknown = null;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: payload, signal: AbortSignal.timeout(6_000), cache: "no-store" });
      const text = await r.text();
      if (!r.ok || !text.trimStart().startsWith("{") && !text.trimStart().startsWith("[")) continue;
      const json = JSON.parse(text) as Res | Res[];
      last = json;
      if ((Array.isArray(json) ? json : [json]).every(authoritative)) return Response.json(json, { headers: { "cache-control": "no-store" } });
    } catch { /* next RPC */ }
  }
  if (last) return Response.json(last, { headers: { "cache-control": "no-store" } });
  return fail(calls[0].id, -32603, "X Layer RPCs unreachable", 503);
}
