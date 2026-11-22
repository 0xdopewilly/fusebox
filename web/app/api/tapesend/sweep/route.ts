import { getAddress, parseAbiItem, toEventSelector, type Address, type Log } from "viem";
import { client, DEPLOYMENT, IS_FORK, VERSIONS } from "@/lib/chain";
import { cronAuthorized, cronDenied } from "@/lib/cron";
import { decisionOf, type Decision } from "@/lib/telegram";
import { postStops, tsState, TS_READY } from "@/lib/tapesend";
import index from "@/lib/deployments/mainnet-index.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const LOOKBACK = 3600; // blocks (about an hour): the most one sweep reads back
const STEP = 100; // the public RPCs' getLogs window
const CREATED = parseAbiItem("event WalletCreated(address indexed wallet, address indexed owner, address indexed creator, address[] agents)");

/** Logs of `addresses` between two blocks, in windows the public RPCs accept. */
async function logsOf(addresses: Address[], from: number, to: number): Promise<Log[]> {
  const out: Log[] = [];
  for (let a = from; a <= to; a += STEP) {
    out.push(...(await client.getLogs({ address: addresses, fromBlock: BigInt(a), toBlock: BigInt(Math.min(to, a + STEP - 1)) })));
  }
  return out;
}

/**
 * Posts every stopped payment of every Fusebox wallet to its TapeSend inbox on X Layer, once, including payments made
 * outside the app (the app, SDK and MCP already trigger a post through /api/telegram/notify). Learns new wallets from
 * the factories' WalletCreated events. Run every 10 minutes by the alerts workflow; safe any time.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return cronDenied();
  if (!TS_READY) return Response.json({ ready: false });
  try {
    const head = Number(await client.getBlockNumber());
    const st = await tsState.get();
    const known = new Set<string>((st?.wallets ?? [DEPLOYMENT.atlas, ...(IS_FORK ? [] : (index as { wallets?: string[] }).wallets ?? [])]).map((w) => w.toLowerCase()));
    const from = Math.max((st?.block ?? head - 600) + 1, head - LOOKBACK);
    if (from > head) return Response.json({ from, head, posted: 0 });
    const factories = VERSIONS.map((v) => v.factory);
    const logs = await logsOf([...factories, ...[...known].map((w) => getAddress(w))], from, head);
    const fresh: Address[] = [];
    const createdTopic = toEventSelector(CREATED);
    for (const l of logs) {
      if (l.topics[0] === createdTopic && factories.some((f) => f.toLowerCase() === l.address.toLowerCase())) {
        const w = `0x${l.topics[1]!.slice(26)}`.toLowerCase();
        if (!known.has(w)) { known.add(w); fresh.push(getAddress(w)); }
      }
    }
    const ds: Decision[] = logs.map((l) => decisionOf(l)).filter((d): d is Decision => !!d && known.has(d.wallet.toLowerCase()));
    // a wallet made inside this window may already have paid in it
    if (fresh.length) for (const l of await logsOf(fresh, from, head)) { const d = decisionOf(l); if (d) ds.push(d); }
    ds.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
    const r = await postStops(ds);
    await tsState.set(head, [...known]);
    return Response.json({ wallets: known.size, newWallets: fresh.length, from, head, decisions: ds.length, ...r }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("tapesend sweep", (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now." }, { status: 503 });
  }
}
