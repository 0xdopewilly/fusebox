"use client";
import Link from "next/link";
import { useState } from "react";
import type { Proposal } from "@/lib/guardrails";

const EXAMPLES = [
  "It pays our three cotton suppliers. Never more than 80 a day, and anything over 30 needs me and my partner to sign off. New vendors wait 2 days before real money.",
  "It handles refunds for customers, so it pays new people all the time. Keep it under 150 a day and get approval for anything above 25.",
  "A new experimental agent. Tiny budget, a few dollars a day, and it should only ever pay addresses I've saved.",
];
const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** The line, as the simulator's ?f= (shipped fuse ids 1-4) and its test payments as ?rows=. */
export function simLinkFor(p: Proposal) {
  const l = p.line, f: string[] = [];
  if (l.dailyCap.on) f.push(`1:${l.dailyCap.cap}`);
  if (l.payeeGuard.on) f.push(`2:${l.payeeGuard.coolingHours}:${l.payeeGuard.trial}`);
  if (l.breaker.on) f.push("3");
  if (l.twoOfThree.on) f.push(`4:${l.twoOfThree.threshold}`);
  const rows = p.tests.map((t) => [t.memo, t.to, t.amount, t.approvals]);
  return `/app/simulate?f=${f.join(",")}${rows.length ? `&rows=${b64url(JSON.stringify(rows))}` : ""}`;
}

/** Plain-English guardrails: describe the agent, get a proposed line with reasons, test it, then use it. */
export default function GuardrailsCard({ onApply }: { onApply: (p: Proposal) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [p, setP] = useState<(Proposal & { fellBack?: boolean }) | null>(null);
  const [applied, setApplied] = useState(false);
  const go = async () => {
    setBusy(true); setErr(null); setApplied(false);
    try {
      const r = await fetch("/api/guardrails", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: text }) });
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? "Couldn't propose a line."); else setP(j);
    } catch { setErr("Couldn't reach the server. Try again."); } finally { setBusy(false); }
  };
  const rows: [string, boolean, string, string][] = p ? [
    ["Daily Cap", p.line.dailyCap.on, p.line.dailyCap.on ? `${p.line.dailyCap.cap} USD₮0 a day` : "off", p.reasons.dailyCap],
    ["Payee Guard", p.line.payeeGuard.on, p.line.payeeGuard.on ? `${p.line.payeeGuard.coolingHours} h cooling-off · ${p.line.payeeGuard.trial} USD₮0 trial` : "off", p.reasons.payeeGuard],
    ["Breaker", p.line.breaker.on, p.line.breaker.on ? "on" : "off", p.reasons.breaker],
    ["Two of Three", p.line.twoOfThree.on, p.line.twoOfThree.on ? `approvals above ${p.line.twoOfThree.threshold} USD₮0` : "off", p.reasons.twoOfThree],
  ] : [];
  return (
    <section className="gr" aria-label="Describe your agent">
      <div className="gr-h"><b>Describe your agent</b><span className="m mute">and get a line of fuses, with reasons</span></div>
      <label className="sr" htmlFor="gr-text">What does your agent pay for, how much, and who signs off big payments?</label>
      <textarea id="gr-text" className="gr-text" rows={3} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} placeholder="It pays our suppliers. Never more than 80 a day; anything over 30 needs me and my partner." />
      <div className="gr-ex m">{EXAMPLES.map((x, i) => <button key={i} className="gr-chip" onClick={() => { setText(x); setP(null); }}>{["Supplier agent", "Refund desk", "Tiny budget"][i]}</button>)}</div>
      <div className="gr-go">
        <button className="btn lime" onClick={go} disabled={busy || text.trim().length < 12}>{busy ? "Working it out…" : <>Propose a line <span className="k">→</span></>}</button>
        {err && <span className="err m" role="alert">{err}</span>}
      </div>
      {p && (
        <div className="gr-out" aria-live="polite">
          <div className="gr-src m mute">{p.source === "ai" ? `Proposed by ${p.model?.replace(/^.*\//, "").replace("claude-haiku-5-5", "Claude Haiku 5.5") ?? "the model"} on NEAR AI Cloud` : p.fellBack ? "The model was unavailable, so Fusebox's rule reader proposed this" : "Proposed by Fusebox's rule reader"} · check every number before you sign</div>
          <ul className="gr-rows">
            {rows.map(([name, on, val, why]) => (
              <li key={name} className={on ? "on" : "off"}>
                <span className="gr-dot" aria-hidden="true" /><b>{name}</b><span className="m">{val}</span><p>{why}</p>
              </li>
            ))}
          </ul>
          {(p.payees.length > 0 || p.approvers.length > 0) && <p className="gr-note m mute">{p.payees.length ? `${p.payees.length} payee address${p.payees.length > 1 ? "es" : ""}` : ""}{p.payees.length && p.approvers.length ? " and " : ""}{p.approvers.length ? `${p.approvers.length} approver address${p.approvers.length > 1 ? "es" : ""}` : ""} from your description will be filled in below.</p>}
          {p.summary && <p className="gr-sum">{p.summary}</p>}
          {p.tests.length > 0 && <p className="gr-tests m mute">Test payments: {p.tests.map((t) => `${t.amount} USD₮0 to a ${t.to} payee${t.approvals ? ` (${t.approvals} signed)` : ""}: should ${t.expect}`).join(" · ")}</p>}
          <div className="gr-act">
            <button className="btn lime" onClick={() => { onApply(p); setApplied(true); }}>{applied ? "Applied to the wizard ✓" : <>Use this line <span className="k">→</span></>}</button>
            <Link className="btn" href={simLinkFor(p)}>Test it on TapeOut&apos;s circuits <span className="k">↗</span></Link>
          </div>
        </div>
      )}
    </section>
  );
}
