"use client";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { fuseboxFactoryAbi, fuseboxWalletAbi } from "./abi";
import { DEP, pub } from "./client-chain";

export interface MyWallet { address: Address; fuses: number; fuseIds: number[]; decisions: number; paused: boolean; block?: number }

/** Every Fusebox wallet `account` owns, read from the factory (owner() is live, so handovers show at once). */
export function useMyWallets(account: Address | null, nonce = 0) {
  const [rows, setRows] = useState<MyWallet[] | null>(null);
  useEffect(() => {
    if (!account) { setRows(null); return; }
    let alive = true;
    (async () => {
      const F = { address: DEP.factory as Address, abi: fuseboxFactoryAbi } as const;
      const n = Number(await pub.readContract({ ...F, functionName: "walletCount" }));
      const addrs = await Promise.all(Array.from({ length: n }, (_, i) => pub.readContract({ ...F, functionName: "walletAt", args: [BigInt(i)] })));
      const owners = await Promise.all(addrs.map((a) => pub.readContract({ address: a, abi: fuseboxWalletAbi, functionName: "owner" })));
      const mine = addrs.filter((_, i) => owners[i].toLowerCase() === account.toLowerCase());
      let local: { address: string; block: number }[] = []; try { local = JSON.parse(localStorage.getItem("fusebox:mine") || "[]"); } catch {}
      const out = await Promise.all(mine.map(async (a) => {
        const W = { address: a, abi: fuseboxWalletAbi } as const;
        const [f, d, p] = await Promise.all([
          pub.readContract({ ...W, functionName: "fuseCount" }),
          pub.readContract({ ...W, functionName: "decisionCount" }),
          pub.readContract({ ...W, functionName: "paused" }),
        ]);
        const slots = await Promise.all(Array.from({ length: Number(f) }, (_, i) => pub.readContract({ ...W, functionName: "slotAt", args: [BigInt(i)] })));
        return { address: a, fuses: Number(f), fuseIds: slots.map((s) => Number(s.fuseId)), decisions: Number(d), paused: p, block: local.find((x) => x.address?.toLowerCase() === a.toLowerCase())?.block };
      }));
      if (alive) setRows(out);
    })().catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [account, nonce]);
  return rows;
}
