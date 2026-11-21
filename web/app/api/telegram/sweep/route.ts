import { client } from "@/lib/chain";
import { announce, decisionsBetween, followedWallets, sweepState, TG_READY } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const LOOKBACK = 3600; // blocks (about an hour on X Layer): the most a sweep reads back

/**
 * Catches decisions nobody announced through notify (an agent paying with its own code): reads the followed wallets'
 * Decision events since the last sweep and announces each once. Run every 10 minutes by a GitHub workflow; safe any time.
 */
export async function GET() {
  if (!TG_READY) return Response.json({ ready: false });
  try {
    const head = Number(await client.getBlockNumber());
    const wallets = await followedWallets();
    const last = (await sweepState.get())?.block ?? head - 600;
    const from = Math.max(last + 1, head - LOOKBACK);
    if (!wallets.length || from > head) { await sweepState.set(head); return Response.json({ wallets: wallets.length, from, head, sent: 0 }); }
    const ds = (await decisionsBetween(wallets, from, head)).sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
    let sent = 0;
    for (const d of ds) sent += await announce(d);
    await sweepState.set(head);
    return Response.json({ wallets: wallets.length, from, head, decisions: ds.length, sent }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("tg sweep", (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now." }, { status: 503 });
  }
}
