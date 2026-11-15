"use client";
import { useState } from "react";
import { isAddress, getAddress, parseUnits } from "viem";
import { fuseboxWalletAbi } from "@/lib/abi";
import { useTxQueue } from "@/lib/useTxQueue";
import { OKLINK } from "@/lib/hooks";
import type { Atlas } from "@/lib/atlas";
import { useWallet } from "./WalletProvider";

/** Owner controls, shown only when the connected wallet owns this Fusebox wallet. */
export default function OwnerPanel({ data }: { data: Atlas }) {
  const { account, write } = useWallet();
  const q = useTxQueue<object>();
  const [payee, setPayee] = useState(""); const [amt, setAmt] = useState("");
  if (!account || account.toLowerCase() !== data.owner.toLowerCase()) return null;
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const blown = data.fuses.some((f) => f.latched);
  const hasBreaker = data.fuses.some((f) => f.key === "breaker");
  const one = (label: string, run: () => ReturnType<typeof write>) => q.start([{ id: label, label, run }], {});
  const last = q.steps[q.steps.length - 1];
  return (
    <section className="owner" data-b>
      <div className="oh m"><span className="lime">You own this wallet</span><span className="mute">{last ? `${last.label}: ${last.state === "done" ? "done" : last.state === "error" ? last.error : last.state === "skip" ? "not needed" : "sign in your wallet…"}` : "Every control is one transaction"}{last?.hash ? <> · <a href={`${OKLINK}/tx/${last.hash}`} target="_blank" rel="noreferrer" className="lime">tx ↗</a></> : null}</span></div>
      <div className="ob m">
        <div>
          <p>{data.paused ? "Paused: nothing pays until you lift it." : blown ? "A Breaker is blown. Reset it once you've checked what tripped it." : "Freeze stops every payment now. Your agent and approvers can freeze too; only you can undo it."}</p>
          {data.paused ? <button className="btn lime" disabled={q.running} onClick={() => one("Unpause", () => write({ ...W, functionName: "setPaused", args: [false] }))}>Unpause</button>
            : blown ? <button className="btn lime" disabled={q.running} onClick={() => one("Reset the Breaker", () => write({ ...W, functionName: "unfreeze" }))}>Reset the Breaker</button>
            : <button className="btn" disabled={q.running} onClick={() => one("Freeze", () => write({ ...W, functionName: "freeze" }))} style={{ borderColor: "var(--red)", color: "var(--red)" }}>Freeze now</button>}
          {hasBreaker && !blown && !data.paused ? <span className="mute" style={{ fontSize: 11 }}>Freezing blows the Breaker; reset it here.</span> : null}
        </div>
        <div>
          <p>Save a payee. Payee Guard still holds them to the trial amount until their cooling-off ends.</p>
          <input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="0x…" spellCheck={false} />
          <button className="btn" disabled={q.running || !isAddress(payee.trim(), { strict: false })} onClick={() => one("Save payee", () => write({ ...W, functionName: "addPayee", args: [getAddress(payee.trim().toLowerCase())] }))}>Save payee</button>
        </div>
        <div>
          <p>Fee balance: {Number(data.feeBalance).toFixed(4)} USDT0. Withdraw any of it back to you.</p>
          <input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="USDT0" inputMode="decimal" />
          <button className="btn" disabled={q.running || !(Number(amt) > 0) || Number(amt) > Number(data.feeBalance)} onClick={() => one("Withdraw fees", () => write({ ...W, functionName: "withdrawFeeBalance", args: [parseUnits(amt, 6), account] }))}>Withdraw</button>
        </div>
        <div>
          <p>Your agent pays by calling <span className="lime">pay(USDT0, to, amount, memo)</span> on {data.wallet.slice(0, 8)}…; dry-run with <span className="lime">check()</span>.</p>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(data.wallet)}>Copy wallet address</button>
        </div>
      </div>
    </section>
  );
}
