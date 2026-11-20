"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { pub } from "@/lib/client-chain";
import { fuseboxWalletAbi } from "@/lib/abi";
import { OKLINK, short, useAtlas } from "@/lib/hooks";
import type { FuseSlot } from "@/lib/atlas";
import { agentPay, checkFor, gasNeeded, type CheckView, type PayResult } from "@/lib/agentPay";
import { keyFrom, loadAgentKey, loadLabels, saveAgentKey, saveLabel, walletsWithKeys, type AgentKey } from "@/lib/agentKey";
import { feeRunway } from "@/lib/plain";
import Loading from "./Loading";
import { Glyph, Plate } from "./Pixel";
import { PageChrome } from "./m/chrome";
import { MChips, MRow, MSheet } from "./m/ui";

interface Proposal { to: Address; amount: string; memo: string; check?: CheckView; result?: PayResult; error?: string; state: "checking" | "ready" | "paying" | "done" | "cancelled" }

/** Why a fuse says no to a proposed payment, and the one fix only the owner can make. Nothing in the chat overrides it. */
function stopWhy(f: FuseSlot, st: CheckView["status"][number], amount: string, saved: boolean): string {
  if (st === "failed") return "The circuit call failed, so the fuse fails closed.";
  if (st === "untrusted") return "TapeOut's processor code changed and isn't attested, so the fuse fails closed.";
  if (f.key === "daily-cap") return `${amount} USD₮0 would take today past the ${f.a} USD₮0 cap (${Number(f.spentToday).toFixed(2)} spent). It resets at 00:00 UTC.`;
  if (f.key === "payee-guard") return saved ? `Saved recently and still cooling off (${f.a} h), and ${amount} USD₮0 is over the ${f.b} USD₮0 trial.` : "Not a saved payee. Only the owner can save it, in the Owner tab, and it then starts on the trial amount.";
  if (f.key === "breaker") return f.latched ? "Already blown. Nothing pays until the owner resets it." : "A payment to a stranger trips it, and it stays blown until the owner resets it.";
  if (f.key === "approval-2of3") return `Over ${f.a} USD₮0, so two of the three approvers must sign this exact payment first.`;
  if (f.key === "repeat-guard") return `The same ${amount} USD₮0 to this payee already went out in the last ${f.a} h, so this looks like the same invoice twice. If it really is a second payment, only the owner can let it through once, in the Owner tab.`;
  return "Says no.";
}
interface Msg { role: "user" | "assistant"; text: string; pay?: Proposal }

/** Pay by chatting. The model only proposes; the wallet's real fuses are checked, you tap Pay, and the agent key in
 *  this browser signs. It never leaves the device and can only pay through the fuses. */
export default function AssistantView() {
  const [wallet, setWallet] = useState<Address | null>(null);
  const [choices, setChoices] = useState<Address[]>([]);
  useEffect(() => {
    const mine = walletsWithKeys(); setChoices(mine);
    const w = new URLSearchParams(window.location.search).get("wallet");
    setWallet(w && isAddress(w, { strict: false }) ? getAddress(w.toLowerCase()) : mine[0] ?? null);
  }, []);
  const { data: a, error, reload } = useAtlas(8000, wallet ? `/api/wallet/${wallet}` : "/api/atlas");
  const [key, setKey] = useState<AgentKey | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => { if (wallet) { setKey(loadAgentKey(wallet)); setLabels(loadLabels(wallet)); } }, [wallet]);
  const [gas, setGas] = useState<bigint | null>(null);
  const [need, setNeed] = useState<bigint | null>(null);
  // is this key an agent of the wallet? Asked of the contract itself (a new wallet's history can lag behind)
  const [agentOk, setAgentOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!key || !wallet) return;
    setAgentOk(null);
    pub.readContract({ address: wallet, abi: fuseboxWalletAbi, functionName: "isAgent", args: [key.address] }).then(setAgentOk).catch(() => setAgentOk(null));
  }, [key, wallet]);
  useEffect(() => { gasNeeded(a?.fuses.length).then(setNeed).catch(() => {}); }, [a?.fuses.length]);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const pull = () => pub.getBalance({ address: key.address }).then((b) => { if (live) setGas(b); }).catch(() => {});
    pull(); const id = setInterval(pull, 10000);
    return () => { live = false; clearInterval(id); };
  }, [key]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [names, setNames] = useState(false); const [imp, setImp] = useState(""); const [impWallet, setImpWallet] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { fetch("/api/assistant").then((r) => r.json()).then((j) => setMode(j.label ?? null)).catch(() => {}); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  const nameOf = (addr: string) => labels[addr.toLowerCase()] ?? short(addr);
  const patch = (i: number, p: Partial<Proposal>) => setMsgs((m) => m.map((x, k) => (k === i && x.pay ? { ...x, pay: { ...x.pay, ...p } } : x)));

  const ask = async (message: string) => {
    if (!wallet || !a || !message.trim() || busy) return;
    setBusy(true); setErr(null); setText("");
    const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text: message }]);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        message, history,
        context: { wallet, balance: a.balance, payees: a.payees.map((p) => ({ address: p.address, label: labels[p.address.toLowerCase()] })), fuses: a.fuses.map((f) => ({ name: f.name, limit: f.key === "daily-cap" ? `${f.a} USD₮0 a day, ${Number(f.spentToday).toFixed(2)} spent today` : f.key === "approval-2of3" ? `approvals above ${f.a} USD₮0` : f.key === "payee-guard" ? `saved payees only, new ones get ${f.b} USD₮0 for ${f.a} h` : f.key === "repeat-guard" ? `the same amount to the same payee once per ${f.a} h` : undefined })) },
      }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "The assistant couldn't answer."); return; }
      const idx = msgs.length + 1; // the assistant's message lands after the user's
      setMsgs((m) => [...m, { role: "assistant", text: j.reply, pay: j.pay ? { ...j.pay, state: "checking" } : undefined }]);
      if (j.pay) {
        try { patch(idx, { check: await checkFor(wallet, j.pay.to, j.pay.amount), state: "ready" }); }
        catch { patch(idx, { state: "ready", error: "Couldn't ask the fuses just now." }); }
      }
    } catch { setErr("Couldn't reach the server. Try again."); } finally { setBusy(false); }
  };

  const pay = async (i: number, p: Proposal) => {
    if (!key || !wallet) return;
    patch(i, { state: "paying", error: undefined });
    try {
      patch(i, { result: await agentPay(key.key, wallet, p.to, p.amount, p.memo), state: "done" });
      reload(); pub.getBalance({ address: key.address }).then(setGas).catch(() => {});
    } catch (e) { patch(i, { state: "ready", error: (e as Error).message }); }
  };

  if (!wallet || !key) return (
    <div className="mpage asst">
      <PageChrome title="Assistant" sub="Pay by chatting" info={<p>The Fusebox assistant pays for you from your own wallet: you say who and how much, your wallet&apos;s fuses are checked, and you tap to pay. It signs with your agent key, kept in this browser.</p>} />
      <div className="mtitle">Pay by chatting</div>
      <p className="mcap">Say &ldquo;pay Kano Cotton 2&rdquo; and the assistant lines it up. Your wallet&apos;s fuses check it, you tap Pay. It needs your wallet&apos;s agent key in this browser.</p>
      <div className="mrows">
        <MRow href="/app/new" icon={<Glyph name="new" size={16} />} title="Wire up a wallet" sub="Fusebox makes the agent key for you" />
      </div>
      <div className="mcard mpay">
        <span className="m mute">Already have a wallet? Add its agent key</span>
        <label className="mfield"><span className="m">Fusebox wallet</span><input aria-label="Fusebox wallet address" value={impWallet} onChange={(e) => setImpWallet(e.target.value)} placeholder="0x…" spellCheck={false} /></label>
        <label className="mfield"><span className="m">Agent private key</span><input aria-label="Agent private key" type="password" value={imp} onChange={(e) => setImp(e.target.value)} placeholder="0x… (64 hex characters)" spellCheck={false} /></label>
        <button className="btn lime" style={{ justifyContent: "center", height: 48 }} disabled={!isAddress(impWallet.trim(), { strict: false }) || !keyFrom(imp)} onClick={() => { const w = getAddress(impWallet.trim().toLowerCase()); const k = keyFrom(imp)!; saveAgentKey(w, k); setKey(k); setWallet(w); setChoices((c) => [...new Set([w, ...c])]); setImp(""); }}>Use this wallet</button>
        <p className="mnote">The key stays in this browser. It can only ask the wallet to pay, through every fuse.</p>
      </div>
    </div>
  );
  if (!a || a.isAtlas) return <div className="mpage asst"><PageChrome title="Assistant" sub={short(wallet)} /><Loading label="Reading your wallet from X Layer" error={error} /></div>;

  const isAgent = agentOk ?? (a.agents ?? []).some((x) => x.toLowerCase() === key.address.toLowerCase());
  const perPay = a.fuses.reduce((t, f) => t + Number(f.fee), 0);
  const first = a.payees[0];
  const chips: [string, string][] = [
    ...(first ? [[`pay ${labels[first.address.toLowerCase()] ?? first.address} 0.01`, `Pay ${nameOf(first.address)} 0.01`] as [string, string]] : []),
    ["What's my balance?", "Balance"], ["Who can I pay?", "Who can I pay?"],
  ];
  return (
    <div className="mpage asst">
      <PageChrome title="Assistant" sub={`Wallet ${short(wallet)}`} info={<><p>Say who to pay and how much. The assistant ({mode ?? "…"}) only lines payments up: your wallet&apos;s fuses check each one on X Layer, you tap Pay, and the agent key in this browser signs.</p><p>It only pays your saved payees, or an address you type in full. Name your payees so you can say &ldquo;pay Kano Cotton 2&rdquo;.</p></>} />
      <div className="asst-top mcard">
        <span className="asst-w"><Plate address={wallet} size={22} /><span><b>{Number(a.balance).toFixed(4)} USD₮0</b><small className="m">{feeRunway(Number(a.feeBalance), perPay)} · agent gas {gas === null ? "…" : (Number(gas) / 1e18).toFixed(5)} OKB</small></span></span>
        <span className="asst-btns">
          {choices.length > 1 && <select aria-label="Wallet" value={wallet} onChange={(e) => { setWallet(getAddress(e.target.value)); setMsgs([]); }}>{choices.map((w) => <option key={w} value={w}>{short(w)}</option>)}</select>}
          <button className="btn" onClick={() => setNames(true)}>Name payees</button>
        </span>
      </div>
      {agentOk === false && <p className="mnote" style={{ color: "var(--red)" }}>This key ({short(key.address)}) isn&apos;t an agent of this wallet, so payments would be refused. The owner can add it in the Owner tab.</p>}
      {gas !== null && need !== null && gas < need && <p className="mnote" style={{ color: "var(--red)" }}>Your agent needs a little more OKB for gas ({(Number(need) / 1e18).toFixed(5)} per payment, up front). <Link className="lime" href={`/app/first?wallet=${wallet}`}>Send it some →</Link></p>}

      <div className="asst-log" aria-live="polite">
        {!msgs.length && <div className="asst-empty"><Glyph name="rob" size={28} /><p>Tell me who to pay and how much. I&apos;ll line it up, your fuses check it, and you tap Pay.</p></div>}
        {msgs.map((m, i) => (
          <div key={i} className={`asst-msg ${m.role}`}>
            <p>{m.text}</p>
            {m.pay && (
              <div className={`asst-pay${m.pay.state === "done" ? (m.pay.result?.allowed ? " ok" : " no") : ""}`}>
                <div className="asst-pay-h"><b>{m.pay.amount} USD₮0</b><span className="m">to {nameOf(m.pay.to)}</span></div>
                {m.pay.state === "checking" && <p className="m mute">Asking your fuses…</p>}
                {m.pay.check && m.pay.state !== "done" && (
                  <div className="asst-fz">{a.fuses.map((f, k) => <span key={f.slot} className={`mtag ${m.pay!.check!.status[k] === "pass" ? "ok" : "no"}`}>{f.name} · {m.pay!.check!.status[k] === "pass" ? "passes" : "says no"}</span>)}</div>
                )}
                {m.pay.check && !m.pay.check.allowed && m.pay.state !== "done" && (
                  <ul className="asst-why">{a.fuses.map((f, k) => m.pay!.check!.status[k] === "pass" ? null : <li key={f.slot}><b>{f.name}</b> {stopWhy(f, m.pay!.check!.status[k], m.pay!.amount, a.payees.some((p) => p.address.toLowerCase() === m.pay!.to.toLowerCase()))}</li>)}</ul>
                )}
                {m.pay.result && (
                  <div className="asst-fz">{a.fuses.map((f, k) => <span key={f.slot} className={`mtag ${m.pay!.result!.status[k] === "pass" ? "ok" : "no"}`}>{f.name} · {m.pay!.result!.status[k] === "pass" ? "passed" : "stopped"}</span>)}</div>
                )}
                {m.pay.state === "done" && m.pay.result && <p className="m">{m.pay.result.allowed ? "Paid" : "Stopped"} · payment #{m.pay.result.decisionId} · <a className="lime" href={`${OKLINK}/tx/${m.pay.result.hash}`} target="_blank" rel="noreferrer">transaction ↗</a></p>}
                {m.pay.error && <p className="mnote" style={{ color: "var(--red)" }}>{m.pay.error}</p>}
                {(m.pay.state === "ready" || m.pay.state === "paying") && (
                  <div className="asst-act">
                    {m.pay.check?.allowed
                      ? <button className="btn lime" disabled={m.pay.state === "paying" || !isAgent} onClick={() => pay(i, m.pay!)}>{m.pay.state === "paying" ? "Your fuses are deciding…" : "Pay as your agent"}</button>
                      : <span className="mnote">{m.pay.check ? "Your fuses would stop this, so there's nothing to sign, and nothing in this chat can change that." : ""}</span>}
                    {m.pay.state === "ready" && <button className="btn" onClick={() => patch(i, { state: "cancelled" })}>Cancel</button>}
                  </div>
                )}
                {m.pay.state === "cancelled" && <p className="m mute">Cancelled. Nothing was sent.</p>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="asst-msg assistant"><p className="m mute">Thinking…</p></div>}
        <div ref={end} />
      </div>
      {err && <p className="mnote" style={{ color: "var(--red)" }} role="alert">{err}</p>}
      <MChips label="Suggestions" items={chips} value={null} onChange={(v) => ask(v)} />
      <form className="asst-in" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <label className="sr" htmlFor="asst-text">Message the assistant</label>
        <input id="asst-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Pay Kano Cotton 2" autoComplete="off" maxLength={1000} />
        <button className="btn lime" disabled={busy || !text.trim()} aria-label="Send">→</button>
      </form>

      <MSheet open={names} onClose={() => setNames(false)} title="Name your payees">
        <p className="mnote">Names live in this browser, so you can say &ldquo;pay Kano Cotton 2&rdquo;.</p>
        {a.payees.length ? a.payees.map((p) => (
          <label key={p.address} className="mfield"><span className="m">{p.address}</span>
            <input aria-label={`Name for ${p.address}`} defaultValue={labels[p.address.toLowerCase()] ?? ""} placeholder="e.g. Kano Cotton" maxLength={40} onBlur={(e) => setLabels(saveLabel(wallet, p.address, e.target.value))} /></label>
        )) : <p className="mcap">No saved payees yet. The owner saves them in the wallet&apos;s Owner tab.</p>}
      </MSheet>
    </div>
  );
}
