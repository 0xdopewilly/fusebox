"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { parseUnits, type Address } from "viem";
import { fuseboxWalletAbi } from "@/lib/abi";
import { DEP } from "@/lib/client-chain";
import { useTxQueue } from "@/lib/useTxQueue";
import { short, OKLINK } from "@/lib/hooks";
import type { Inbox, Request } from "@/lib/approvals";
import { useWallet } from "./WalletProvider";

const ago = (t: number) => { const s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const signed = (m: number) => [0, 1, 2].filter((i) => (m >> i) & 1).length;

/** Every payment waiting on the connected approver, across all the wallets where they hold a seat. */
export default function ApprovalInbox({ account, onPick }: { account: Address; onPick: (r: Request) => void }) {
  const { write } = useWallet();
  const q = useTxQueue<object>();
  const [box, setBox] = useState<Inbox | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let on = true;
    const pull = () => fetch(`/api/approvals?approver=${account}${nonce ? "&fresh=1" : ""}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (!on) return; if (j.open) { setBox(j); setErr(null); } else setErr(j.error ?? "unreachable"); }).catch(() => on && setErr("unreachable"));
    pull(); const id = setInterval(pull, 12000);
    return () => { on = false; clearInterval(id); };
  }, [account, nonce]);
  const act = async (r: Request, fn: "approvePayment" | "revokeApproval") => {
    const ok = await q.start([{ id: fn, label: fn === "approvePayment" ? `Approve ${r.amount} USDT0 to ${short(r.to)}` : `Revoke your approval of ${r.amount} USDT0 to ${short(r.to)}`, run: () => write({ address: r.wallet, abi: fuseboxWalletAbi, functionName: fn, args: [DEP.usdt0 as Address, r.to, parseUnits(r.amount, 6)] }) }], {});
    if (ok) setNonce((n) => n + 1);
  };
  const last = q.steps[q.steps.length - 1];
  const feed = `/api/approvals/feed?approver=${account}`;

  return (
    <section className="inbox" data-a aria-label="Approvals waiting for you">
      <div className="blockhead"><h2 className="disp">Waiting for <span className="lime">you</span></h2>
        <span className="m mute">{box ? `${box.open.length} open · seats in ${box.seated} of ${box.wallets} wallets` : err ? `couldn't read X Layer (${err})` : "reading every wallet where you hold a seat…"}</span></div>
      {last && <p className={`m ${last.state === "error" ? "red" : "mute"} inbox-status`} role="status">{last.label}: {last.state === "done" ? "done" : last.state === "error" ? last.error : last.state === "mine" ? "confirming on X Layer…" : "sign in your wallet…"}{last.hash ? <> · <a className="lime" href={`${OKLINK}/tx/${last.hash}`} target="_blank" rel="noreferrer">tx ↗</a></> : null}</p>}
      {box && box.open.length === 0 && (
        <div className="inbox-empty m mute">{box.seated ? `Nothing is waiting on ${short(account)}. When an agent is stopped above a threshold in one of your ${box.seated} wallet${box.seated > 1 ? "s" : ""}, it lands here.` : `${short(account)} isn't an approver on any Fusebox wallet yet. An owner seats approvers from their wallet's console.`}</div>
      )}
      <div className="inbox-list">
        {box?.open.map((r) => {
          const n = signed(r.mask), mine = r.mySeat >= 0 && ((r.mask >> r.mySeat) & 1) === 1;
          return (
            <article key={`${r.wallet}-${r.to}-${r.amount}`} className={`ibx${n >= 2 ? " clear" : ""}`}>
              <div className="ibx-top">
                <div><b>{r.amount} USDT0</b><span className="m mute"> → {short(r.to)} · {r.saved ? "saved payee" : "not a saved payee"}</span></div>
                <span className="m mute">{ago(r.last)}{r.attempts > 1 ? ` · ${r.attempts} attempts` : ""}</span>
              </div>
              <p className="ibx-memo">“{r.memo}”</p>
              <div className="ibx-row m">
                <span className="ibx-seats" aria-label={`${n} of 2 approvals`}>
                  {r.seats.map((s, i) => <span key={i} className={(r.mask >> i) & 1 ? "on" : ""} title={s}>{(r.mask >> i) & 1 ? "✓ " : ""}S{i + 1}{i === r.mySeat ? " · you" : ""}</span>)}
                </span>
                <span className={n >= 2 ? "lime" : "mute"}>{n >= 2 ? "Cleared: the agent's retry passes this fuse" : `${n} of 2 signed${r.threshold !== null ? ` · over ${r.threshold} USDT0` : ""}`}</span>
              </div>
              <div className="ibx-act">
                <Link className="m mute" href={r.isAtlas ? "/app" : `/app/w/${r.wallet}`}>{r.isAtlas ? "Atlas" : `Wallet ${short(r.wallet)}`} ↗</Link>
                <button className="dt-btn" onClick={() => onPick(r)}>Details</button>
                {mine ? <button className="btn" disabled={q.running} onClick={() => act(r, "revokeApproval")}>Revoke mine</button>
                  : <button className="btn lime" disabled={q.running || r.mySeat < 0} onClick={() => act(r, "approvePayment")}>Approve as seat {r.mySeat + 1}</button>}
              </div>
            </article>
          );
        })}
      </div>
      {box && box.recent.length > 0 && (
        <details className="inbox-recent m"><summary>Paid after approval · {box.recent.length}</summary>
          <ul>{box.recent.map((r) => <li key={`${r.wallet}-${r.to}-${r.amount}-${r.paid}`}><span>{r.amount} USDT0 → {short(r.to)}</span><span className="mute">{r.isAtlas ? "Atlas" : short(r.wallet)} · paid {ago(r.paid!)}</span></li>)}</ul>
        </details>
      )}
      <div className="inbox-feed m">
        <button className="dt-btn" onClick={() => { navigator.clipboard?.writeText(`${location.origin}${feed}`); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? "Feed URL copied" : "Copy my approvals feed"}</button>
        <span className="mute">Subscribe in Slack (/feed subscribe), an email digest or any reader to hear about new requests.</span>
      </div>
    </section>
  );
}
