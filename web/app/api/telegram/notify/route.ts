import { isFuseboxWallet } from "@/lib/atlas";
import { announce, decisionsInTx, TG_READY } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * "This transaction has a Fusebox decision in it": the app, the SDK and the MCP server call this right after a payment.
 * Everything is read back from X Layer (the receipt's Decision events, from a wallet a Fusebox factory made), so the
 * caller only names the transaction. Each decision is announced once, here or by the sweep.
 */
export async function POST(req: Request) {
  if (!TG_READY) return Response.json({ ready: false });
  const b = (await req.json().catch(() => null)) as { tx?: string } | null;
  if (!b?.tx || !/^0x[0-9a-fA-F]{64}$/.test(b.tx)) return Response.json({ error: "Send { tx: \"0x…\" } with the payment's transaction hash." }, { status: 400 });
  try {
    let decisions = await decisionsInTx(b.tx as `0x${string}`).catch(() => null);
    if (!decisions) { await new Promise((r) => setTimeout(r, 3000)); decisions = await decisionsInTx(b.tx as `0x${string}`); } // a node a block behind
    let sent = 0;
    for (const d of decisions) if (await isFuseboxWallet(d.wallet)) sent += await announce(d);
    return Response.json({ decisions: decisions.length, sent });
  } catch (e) {
    console.error("tg notify", (e as Error).message);
    return Response.json({ error: "Couldn't read that transaction from X Layer yet." }, { status: 503 });
  }
}
