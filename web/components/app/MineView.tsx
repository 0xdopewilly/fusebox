"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fuseboxWalletAbi } from "@/lib/abi";
import { useTxQueue } from "@/lib/useTxQueue";
import { short, OKLINK } from "@/lib/hooks";
import type { FleetWallet } from "@/app/api/fleet/route";
import { useWallet } from "./WalletProvider";
import Loading from "./Loading";

const ago = (t: number) => { const s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const STATUS: Record<FleetWallet["status"], [string, string]> = {
  live: ["Live", "lime"], paused: ["Paused", "red"], blown: ["Blown", "red"], "low-fees": ["Low on fees", "amber"], "no-fuses": ["No fuses", "amber"], "no-agent": ["No agent", "amber"],
};
const usd = (v: string | number) => { const n = Number(v); return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toFixed(n >= 10 ? 1 : 4); };

/** Every Fusebox wallet the connected address owns, as a fleet: money, fees left, what's blown, today's activity. */
export default function MineView() {
  const { account, wallets, connect, write } = useWallet();
  const q = useTxQueue<object>();
  const [rows, setRows] = useState<FleetWallet[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!account) { setRows(null); return; }
    let on = true;
    const pull = () => fetch(`/api/fleet?owner=${account}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (!on) return; if (j.wallets) { setRows(j.wallets); setErr(null); } else setErr(j.error ?? "unreachable"); }).catch(() => on && setErr("unreachable"));
    pull(); const id = setInterval(pull, 15000);
    return () => { on = false; clearInterval(id); };
  }, [account, nonce]);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);

  const live = (rows ?? []).filter((r) => !r.paused && !r.blown.length);
  const freezeAll = async () => {
    setArmed(false);
    const ok = await q.start(live.map((r) => ({ id: r.wallet, label: `Freeze ${r.isAtlas ? "Atlas" : short(r.wallet)}`, run: () => write({ address: r.wallet, abi: fuseboxWalletAbi, functionName: "freeze" }) })), {});
    setNonce((n) => n + 1);
    return ok;
  };
  const cur = q.steps.find((s) => s.state === "sign" || s.state === "mine" || s.state === "error") ?? q.steps[q.steps.length - 1];
  const t = rows ? {
    balance: rows.reduce((s, r) => s + Number(r.balance), 0), fees: rows.reduce((s, r) => s + Number(r.feeBalance), 0),
    today: rows.reduce((s, r) => s + r.today.decisions, 0), stopped: rows.reduce((s, r) => s + r.today.stopped, 0),
    alerts: rows.filter((r) => r.status !== "live").length,
  } : null;

  return (
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <section className="try-head">
        <h1 className="disp" data-a>My <span className="lime">[wallets]</span>.</h1>
        <p data-a>Every Fusebox wallet your connected address owns, as one fleet: the money, the fees left, what&apos;s blown and what the agents did today. Read from X Layer; nothing is signed just to look.</p>
      </section>
      <h2 className="sr">Your wallets</h2>
      {!account ? (
        <div className="empty-card" data-a>
          <div className="m lime">Not connected</div>
          <h3>Connect the wallet that owns them</h3>
          <p>Fusebox reads every wallet the factory made for your address. Nothing is signed just to look.</p>
          {wallets.length ? <div className="prow">{wallets.map((w) => <button key={w.info.rdns} className="btn lime" onClick={() => connect(w.info.rdns)}>Connect {w.info.name} <span className="k">→</span></button>)}</div>
            : <p className="m mute">No wallet in this browser. <a className="lime" href="https://web3.okx.com/download" target="_blank" rel="noreferrer">Get OKX Wallet ↗</a> or open Fusebox in its built-in browser.</p>}
        </div>
      ) : !rows ? <Loading label="Finding your wallets in the factory" error={err} /> : (
        <>
          {t && rows.length > 0 && (
            <section className="stats m mute fleet-kpi" data-a>
              <div>Wallets<b>{rows.length}</b></div>
              <div>In the wallets<b>{usd(t.balance)}<small>USD₮0</small></b></div>
              <div>Prepaid fees<b>{usd(t.fees)}<small>USD₮0</small></b></div>
              <div>Decisions today<b>{t.today}</b></div>
              <div>Stopped today<b style={{ color: t.stopped ? "var(--red)" : undefined }}>{t.stopped}</b></div>
              <div>Need a look<b style={{ color: t.alerts ? "#e8b13a" : undefined }}>{t.alerts}</b></div>
            </section>
          )}
          {rows.length > 0 && (
            <div className="fleet-bar m" data-a>
              <span className="mute">{live.length} live · {rows.length - live.length} paused or blown</span>
              {cur && <span className={cur.state === "error" ? "red" : "mute"} role="status">{cur.label}: {cur.state === "done" ? "done" : cur.state === "error" ? cur.error : cur.state === "mine" ? "confirming…" : "sign in your wallet…"}</span>}
              <button className={`btn danger${armed ? " armed" : ""}`} disabled={!live.length || q.running} onClick={() => (armed ? freezeAll() : setArmed(true))}>{armed ? `Freeze all ${live.length}? Tap again` : "Freeze every agent"}</button>
            </div>
          )}
          <div className="mine-list fleet" data-a>
            {rows.map((r) => {
              const [label, tone] = STATUS[r.status];
              return (
                <Link key={r.wallet} href={r.isAtlas ? "/app" : `/app/w/${r.wallet}`} className="flt" data-wallet={r.wallet} data-cursor="Open">
                  <div className="flt-id"><span className={`flt-dot ${tone}`} aria-hidden="true" /><div><b>{r.isAtlas ? "Atlas" : short(r.wallet)}</b><span className="m mute">{r.fuses} fuse{r.fuses === 1 ? "" : "s"} · {r.agents} agent{r.agents === 1 ? "" : "s"}{r.approvers ? ` · ${r.approvers} approvers` : ""}</span></div></div>
                  <div className="flt-c"><span className="m mute">Balance</span><b>{usd(r.balance)}</b></div>
                  <div className="flt-c"><span className="m mute">Fees left</span><b className={r.covers !== null && r.covers < 10 ? "amber" : ""}>{usd(r.feeBalance)}</b><small className="m mute">{r.covers === null ? "—" : `≈ ${r.covers} decisions`}</small></div>
                  <div className="flt-c"><span className="m mute">Today</span><b>{r.today.decisions}</b><small className="m mute">{r.today.stopped ? <span className="red">{r.today.stopped} stopped</span> : "none stopped"}</small></div>
                  <div className="flt-c flt-last"><span className="m mute">Last decision</span>{r.last ? <><b className={r.last.paid ? "" : "red"}>{r.last.paid ? "Paid" : "Stopped"} {usd(r.last.amount)}</b><small className="m mute">{ago(r.last.time)}</small></> : <b className="mute">None yet</b>}</div>
                  <div className="flt-s m"><span className={`flt-tag ${tone}`}>{label}</span>{r.blown.length ? <small className="red">{r.blown.join(", ")}</small> : null}</div>
                </Link>
              );
            })}
            <div className="flt flt-new">
              <div className="flt-id"><span className="flt-dot" aria-hidden="true" /><div><b>{rows.length ? "Wire up another" : "No wallets yet"}</b><span className="m mute">Give an agent its own wallet with fuses, in a few signatures.</span></div></div>
              <Link className="btn lime" href="/app/new">Wire up a wallet <span className="k">→</span></Link>
            </div>
          </div>
          {q.steps.some((s) => s.hash) && <p className="m mute fleet-txs">{q.steps.filter((s) => s.hash).map((s) => <a key={s.id} className="lime" href={`${OKLINK}/tx/${s.hash}`} target="_blank" rel="noreferrer">{s.label} ↗ </a>)}</p>}
        </>
      )}
    </div>
  );
}
