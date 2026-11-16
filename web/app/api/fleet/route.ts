import { getAddress, isAddress, type Address } from "viem";
import { client, DEPLOYMENT } from "@/lib/chain";
import { fuseboxWalletAbi } from "@/lib/abi";
import { factoryWallets } from "@/lib/logs";
import { getWallet } from "@/lib/atlas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface FleetWallet {
  wallet: Address; isAtlas: boolean; balance: string; feeBalance: string; perDecision: string; covers: number | null;
  paused: boolean; blown: string[]; fuses: number; agents: number; approvers: number;
  today: { decisions: number; stopped: number; maxDecisions: number }; total: { decisions: number; paid: number; stopped: number };
  last: { time: number; paid: boolean; amount: string } | null;
  status: "live" | "paused" | "blown" | "low-fees" | "no-fuses" | "no-agent";
}

/** Every Fusebox wallet `owner` holds, summarised for the fleet view. */
export async function GET(req: Request) {
  const o = new URL(req.url).searchParams.get("owner") ?? "";
  if (!isAddress(o, { strict: false })) return Response.json({ error: "Pass ?owner=0x…" }, { status: 400 });
  const owner = getAddress(o.toLowerCase());
  try {
    const head = Number(await client.getBlockNumber());
    const wallets = await factoryWallets(head);
    const owners = await Promise.all(wallets.map((w) => client.readContract({ address: w, abi: fuseboxWalletAbi, functionName: "owner" }).catch(() => null)));
    const mine = wallets.filter((_, i) => owners[i]?.toLowerCase() === owner.toLowerCase()).map((w) => getAddress(w));
    const rows = (await Promise.all(mine.map(async (w): Promise<FleetWallet | null> => {
      const a = await getWallet(w).catch(() => null);
      if (!a) return null;
      // what one decision costs this wallet now: each fuse at the lower of the designer's fee and the accepted one
      const per = a.fuses.reduce((t, f) => t + Math.min(Number(f.fee), Number(f.maxFee)), 0);
      const covers = per > 0 ? Math.floor(Number(a.feeBalance) / per) : null;
      const blown = a.fuses.filter((f) => f.latched).map((f) => f.name);
      const agents = a.agents?.length ?? 0;
      const status: FleetWallet["status"] = a.paused ? "paused" : blown.length ? "blown" : !a.fuses.length ? "no-fuses" : !agents ? "no-agent" : covers !== null && covers < 10 ? "low-fees" : "live";
      const d = a.decisions[0];
      return {
        wallet: w, isAtlas: w.toLowerCase() === DEPLOYMENT.atlas.toLowerCase(), balance: a.balance, feeBalance: a.feeBalance, perDecision: per.toFixed(6), covers,
        paused: a.paused, blown, fuses: a.fuses.length, agents, approvers: a.approvers.filter((x) => !/^0x0{40}$/i.test(x)).length,
        today: { decisions: a.limits?.decisionsToday ?? 0, stopped: a.limits?.blockedToday ?? 0, maxDecisions: a.limits?.maxDecisions ?? 0 },
        total: { decisions: a.counts.decisions, paid: a.counts.allowed, stopped: a.counts.blocked },
        last: d ? { time: d.time, paid: d.allowed, amount: d.amount } : null, status,
      };
    }))).filter((x): x is FleetWallet => !!x);
    rows.sort((x, y) => (y.last?.time ?? 0) - (x.last?.time ?? 0));
    return Response.json({ owner, block: head, wallets: rows }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("fleet", (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now." }, { status: 503 });
  }
}
