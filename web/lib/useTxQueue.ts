"use client";
import { useCallback, useRef, useState } from "react";
import type { Hash, TransactionReceipt } from "viem";
import { pub } from "./client-chain";

export type StepState = "todo" | "sign" | "mine" | "done" | "skip" | "error";
export interface TxStep<C> { id: string; label: string; detail?: string; run: (ctx: C) => Promise<Hash | null>; after?: (r: TransactionReceipt, ctx: C) => void }
export interface StepView { id: string; label: string; detail?: string; state: StepState; hash?: Hash; error?: string }

/** Runs wallet transactions one by one: sign, wait for the receipt, carry results forward; retry resumes at the failure. */
export function useTxQueue<C extends object>() {
  const [steps, setSteps] = useState<StepView[]>([]);
  const [running, setRunning] = useState(false);
  const plan = useRef<{ list: TxStep<C>[]; ctx: C; at: number } | null>(null);
  const patch = (i: number, p: Partial<StepView>) => setSteps((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));

  const go = useCallback(async () => {
    const pl = plan.current; if (!pl) return false;
    setRunning(true);
    try {
      for (let i = pl.at; i < pl.list.length; i++) {
        pl.at = i;
        const st = pl.list[i];
        patch(i, { state: "sign", error: undefined });
        try {
          const hash = await st.run(pl.ctx);
          if (!hash) { patch(i, { state: "skip" }); continue; }
          patch(i, { state: "mine", hash });
          const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
          if (r.status !== "success") throw new Error("The transaction reverted on X Layer.");
          st.after?.(r, pl.ctx);
          patch(i, { state: "done" });
        } catch (e) {
          const msg = (e as { shortMessage?: string; message?: string }).shortMessage || (e as Error).message || "Failed";
          patch(i, { state: "error", error: /reject|denied|cancel/i.test(msg) ? "You declined it in your wallet." : msg.split("\n")[0] });
          return false;
        }
      }
      pl.at = pl.list.length;
      return true;
    } finally { setRunning(false); }
  }, []);

  const start = useCallback((list: TxStep<C>[], ctx: C) => {
    plan.current = { list, ctx, at: 0 };
    setSteps(list.map((s) => ({ id: s.id, label: s.label, detail: s.detail, state: "todo" as StepState })));
    return go();
  }, [go]);

  return { steps, running, start, retry: go, ctx: () => plan.current?.ctx };
}
