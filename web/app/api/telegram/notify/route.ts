import { isFuseboxWallet } from "@/lib/atlas";
import { cronAuthorized } from "@/lib/cron";
import { postStops, TS_READY } from "@/lib/tapesend";
import { announce, decisionsInTx, TG_READY, type Decision } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * "This transaction has a Fusebox decision in it": the app, the SDK and the MCP server call this right after a payment.
 * Everything is read back from X Layer (the receipt's Decision events, from a wallet a Fusebox factory made), so the
 * caller only names the transaction. Each decision is announced once on Telegram (here or by the sweep), and each stop
 * is posted once to the wallet's TapeSend inbox on X Layer (lib/tapesend.ts). With the cron secret,
 * { only: "tapesend" } skips Telegram (posting older stops on-chain without re-announcing them).
 */
export async function POST(req: Request) {
  if (!TG_READY && !TS_READY) return Response.json({ ready: false });
  const b = (await req.json().catch(() => null)) as { tx?: string; only?: string } | null;
  if (!b?.tx || !/^0x[0-9a-fA-F]{64}$/.test(b.tx)) return Response.json({ error: "Send { tx: \"0x…\" } with the payment's transaction hash." }, { status: 400 });
  const onlyChain = b.only === "tapesend" && cronAuthorized(req);
  try {
    let decisions = await decisionsInTx(b.tx as `0x${string}`).catch(() => null);
    if (!decisions) { await new Promise((r) => setTimeout(r, 3000)); decisions = await decisionsInTx(b.tx as `0x${string}`); } // a node a block behind
    const ours: Decision[] = [];
    for (const d of decisions) if (await isFuseboxWallet(d.wallet)) ours.push(d);
    let sent = 0;
    if (TG_READY && !onlyChain) for (const d of ours) sent += await announce(d);
    const onchain = TS_READY
      ? await postStops(ours).catch((e) => { console.error("tapesend post", (e as Error).message); return { posted: 0, tx: undefined }; })
      : { posted: 0, tx: undefined };
    return Response.json({ decisions: decisions.length, sent, posted: onchain.posted, ...(onchain.tx ? { tapesend: onchain.tx } : {}) });
  } catch (e) {
    console.error("tg notify", (e as Error).message);
    return Response.json({ error: "Couldn't read that transaction from X Layer yet." }, { status: 503 });
  }
}
