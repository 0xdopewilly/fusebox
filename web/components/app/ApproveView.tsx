"use client";
import { useCallback, useEffect, useState } from "react";
import { getAddress, isAddress, parseUnits, type Address } from "viem";
import { fuseboxWalletAbi } from "@/lib/abi";
import { DEP, pub } from "@/lib/client-chain";
import { useAtlas, short, fmt, OKLINK } from "@/lib/hooks";
import { useTxQueue } from "@/lib/useTxQueue";
import { useWallet } from "./WalletProvider";
import NoWallet from "./NoWallet";
import ApprovalInbox from "./ApprovalInbox";
import ApproverAlerts from "./ApproverAlerts";

/** Two of Three: approvers sign off one exact payment (token, payee, amount) so the agent's retry can pass. */
export default function ApproveView() {
  const { account, wallets, connect, write } = useWallet();
  const q = useTxQueue<object>();
  const [wallet, setWallet] = useState<string>(DEP.atlas);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  // Deep links (?wallet=&to=&amount=) are read after mount, so the page hydrates with the template's reveal intact.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("wallet")) setWallet(sp.get("wallet")!);
    if (sp.get("to")) setTo(sp.get("to")!);
    if (sp.get("amount")) setAmount(sp.get("amount")!);
  }, []);
  const [seats, setSeats] = useState<Address[] | null>(null);
  const [mask, setMask] = useState(0);
  const [ttl, setTtl] = useState(86400);
  const valid = isAddress(wallet, { strict: false });
  const { data } = useAtlas(8000, valid ? (wallet.toLowerCase() === DEP.atlas.toLowerCase() ? "/api/atlas" : `/api/wallet/${wallet}`) : "/api/atlas");
  const amt = (() => { try { return Number(amount) > 0 ? parseUnits(amount, 6) : null; } catch { return null; } })();
  const payee = isAddress(to, { strict: false }) ? getAddress(to.toLowerCase()) : null;

  const read = useCallback(async () => {
    if (!valid) return;
    const W = { address: getAddress(wallet.toLowerCase()), abi: fuseboxWalletAbi } as const;
    try {
      const [s, t] = await Promise.all([pub.readContract({ ...W, functionName: "approvers" }), pub.readContract({ ...W, functionName: "approvalTtl" })]);
      setSeats([...s]); setTtl(Number(t));
      setMask(payee && amt ? Number(await pub.readContract({ ...W, functionName: "approvalMaskOf", args: [DEP.usdt0 as Address, payee, amt] })) : 0);
    } catch { setSeats(null); }
  }, [wallet, valid, payee, amt]);
  useEffect(() => { read(); const id = setInterval(read, 6000); return () => clearInterval(id); }, [read]);

  const two = data?.fuses.findIndex((f) => f.key === "approval-2of3") ?? -1;
  const threshold = two >= 0 ? data!.fuses[two].a : null;
  const waiting = two >= 0 ? (data?.decisions ?? []).filter((d) => !d.allowed && d.status[two] === "blew") : [];
  const mySeat = account && seats ? seats.findIndex((s) => s.toLowerCase() === account.toLowerCase()) : -1;
  const approvedByMe = mySeat >= 0 && ((mask >> mySeat) & 1) === 1;
  const count = [0, 1, 2].filter((b) => (mask >> b) & 1).length;
  const act = async (fn: "approvePayment" | "revokeApproval") => {
    await q.start([{ id: fn, label: fn === "approvePayment" ? "Approve this payment" : "Revoke your approval", run: () => write({ address: getAddress(wallet.toLowerCase()), abi: fuseboxWalletAbi, functionName: fn, args: [DEP.usdt0 as Address, payee!, amt!] }) }], {});
    read();
  };
  const last = q.steps[q.steps.length - 1];

  return (
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <section className="try-head">
        <h1 className="disp" data-a>Two of <span className="lime">[three]</span>.</h1>
        <p data-a>Above its threshold, a wallet with the Two of Three fuse pays only what two of its three approvers have signed off: this exact payee, this exact amount. Approvals expire {Math.round(ttl / 3600)} hours after the first one. Connect as an approver to see everything waiting on you, across every wallet where you hold a seat.</p>
      </section>
      {account && <ApproverAlerts account={account} />}
      {account && <ApprovalInbox account={account} onPick={(r) => { setWallet(r.wallet); setTo(r.to); setAmount(r.amount); setTimeout(() => document.getElementById("approve-one")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />}
      <h2 className="sr" id="approve-one">Approve a payment</h2>
      <section className="wz">
        <div className="wz-main" data-a>
          <div className="wz-sec">
            <div className="ix">01</div>
            <div>
              <h3>The payment</h3>
              <p className="lead">Pick one the agent was stopped on, or type it in.</p>
              {waiting.length > 0 && (
                <div className="tricks" style={{ marginBottom: 20 }}>
                  {waiting.slice(0, 6).map((d) => (
                    <button key={d.id} className={`trick${payee?.toLowerCase() === d.to.toLowerCase() && amount === d.amount ? " on" : ""}`} onClick={() => { setTo(d.to); setAmount(d.amount); }} data-cursor="Load">
                      <span className="n">#{d.id}</span><span>{fmt(d.amount, 2)} USD₮0 → {short(d.to)} · “{d.memo.slice(0, 48)}”</span><span className="go">Load</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="fields m" style={{ marginTop: 0 }}>
                <div className="field"><label>Wallet</label><input aria-label="Wallet" value={wallet} onChange={(e) => setWallet(e.target.value)} spellCheck={false} /></div>
                <div className="prow">
                  <div className="field" style={{ flex: 2 }}><label>Pay to</label><input aria-label="Pay to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" spellCheck={false} /></div>
                  <div className="field"><label>Amount, USD₮0</label><input aria-label="Amount, USD₮0" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></div>
                </div>
                {threshold !== null && amt && Number(amount) <= threshold && <div className="hint2">{amount} USD₮0 is under this wallet&apos;s {threshold} USD₮0 threshold, so Two of Three already lets it through.</div>}
                {two < 0 && data && <div className="hint2">This wallet has no Two of Three fuse.</div>}
              </div>
            </div>
          </div>
        </div>
        <div className="wz-side" data-a>
          <div className="summary">
            <div className="sh2 m"><span className="mute">Approvals</span><span className={count >= 2 ? "lime" : "mute"}>{count} of 2 needed</span></div>
            <div className="rows">
              {(seats ?? [null, null, null]).map((s, i) => (
                <div key={i}><span>Seat {i + 1}{mySeat === i ? " · you" : ""}</span><span style={{ color: (mask >> i) & 1 ? "var(--lime)" : "var(--dim)" }}>{s ? short(s) : "—"} {(mask >> i) & 1 ? "✓ signed" : "· not yet"}</span></div>
              ))}
            </div>
            <div className="go">
              {!account ? (wallets.length ? wallets.map((w) => <button key={w.info.rdns} className="btn lime" style={{ marginBottom: 8 }} onClick={() => connect(w.info.rdns)}>Connect {w.info.name}</button>) : <NoWallet />)
                : mySeat < 0 ? <div className="warn2">Your connected wallet {short(account)} isn&apos;t one of this wallet&apos;s approvers.</div>
                : !payee || !amt ? <div className="warn2">Enter the payee and amount to approve.</div>
                : approvedByMe ? <button className="btn" disabled={q.running} onClick={() => act("revokeApproval")}>Revoke my approval</button>
                : <button className="btn lime" disabled={q.running} onClick={() => act("approvePayment")} data-cursor="Approve"><span className="roll"><span>Approve as seat {mySeat + 1}</span><span aria-hidden="true">Approve as seat {mySeat + 1}</span></span> <span className="k">✓</span></button>}
              {last && <p className="m mute" style={{ marginTop: 10 }}>{last.label}: {last.state === "done" ? "done" : last.state === "error" ? last.error : "sign in your wallet…"}{last.hash ? <> · <a className="lime" href={`${OKLINK}/tx/${last.hash}`} target="_blank" rel="noreferrer">tx ↗</a></> : null}</p>}
              {count >= 2 && <div className="done-card"><h4>Cleared.</h4><p style={{ color: "var(--soft)", fontSize: 14, lineHeight: 1.5 }}>Two approvers signed this exact payment. When the agent retries it, Two of Three holds, and the other fuses still decide.</p></div>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
