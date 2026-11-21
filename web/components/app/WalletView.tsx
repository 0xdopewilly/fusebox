"use client";
import Link from "next/link";
import { alertsLink } from "@/lib/alerts";
import AcceptOwnership from "./AcceptOwnership";
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap, useGSAP, reduced } from "@/lib/gsap";
import { useAtlas, short, fmt, OKLINK } from "@/lib/hooks";
import { LAYERS } from "@/lib/fuses";
import { describe } from "@/lib/sockets";
import type { Atlas, DecisionRow } from "@/lib/atlas";
import LineWire, { type WireStatus } from "./LineWire";
import Netlist from "@/components/landing/Netlist";
import OwnerConsole from "./OwnerConsole";
import DecisionTools from "./DecisionTools";
import SpendView from "./SpendView";
import Loading from "./Loading";
import { Responsive } from "./m/useMobile";
import WalletMobile from "./m/WalletMobile";
import Term from "./m/Term";
import { readableMemo } from "@/lib/plain";

/** A number that rolls to its new value whenever it changes. */
function Count({ value, d = 6, className }: { value: number; d?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(0);
  useEffect(() => {
    const o = { v: last.current };
    if (reduced()) { ref.current!.textContent = value.toFixed(d); last.current = value; return; }
    const tw = gsap.to(o, { v: value, duration: 1.2, ease: "power3.out", onUpdate: () => { if (ref.current) ref.current.textContent = o.v.toFixed(d); } });
    last.current = value;
    return () => { tw.kill(); };
  }, [value, d]);
  return <span ref={ref} className={className}>{(0).toFixed(d)}</span>;
}

function Scope({ rows }: { rows: DecisionRow[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const list = [...rows].reverse();
  const W = 1000, H = 180, mid = 92, n = Math.max(list.length, 12);
  const x = (i: number) => 30 + (i * (W - 60)) / (n - 1 || 1);
  const h = (a: string) => Math.min(78, 14 + Math.log10(Number(a) + 1) * 34);
  useGSAP(() => {
    if (reduced()) return;
    gsap.from(ref.current!.querySelectorAll(".tick"), { scaleY: 0, transformOrigin: (i, el: SVGElement) => (el.dataset.up === "1" ? "50% 100%" : "50% 0%"), duration: 0.6, stagger: 0.05, ease: "back.out(2)" });
    gsap.from(ref.current!.querySelector(".axis"), { drawSVG: "0%", duration: 1.2, ease: "wire" });
  }, { dependencies: [rows.length] });
  return (
    <div className="scope">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        <line x1="0" y1={mid} x2={W} y2={mid} stroke="rgba(255,255,255,.18)" className="axis" />
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={W * f} y1="10" x2={W * f} y2={H - 10} stroke="rgba(255,255,255,.05)" />)}
        {list.map((r, i) => {
          const up = r.allowed, hh = h(r.amount), c = up ? "#bbfe2f" : "#ff5232";
          return (
            <g key={r.id} onMouseEnter={() => setHover(i)} data-cursor={`#${r.id} · ${up ? "paid" : "blocked"}`}>
              <rect x={x(i) - 10} y="0" width="20" height={H} fill="transparent" />
              <rect className="tick" data-up={up ? "1" : "0"} x={x(i) - 1.5} y={up ? mid - hh : mid} width="3" height={hh} fill={c} opacity={hover === null || hover === i ? 1 : 0.35} />
              <rect x={x(i) - 3.5} y={(up ? mid - hh : mid + hh) - 3.5} width="7" height="7" fill={c} opacity={hover === i ? 1 : 0} />
              {hover === i && <text x={Math.min(W - 160, x(i) + 10)} y={up ? mid - hh - 8 : mid + hh + 16} fill={c} fontFamily="var(--f-mono)" fontSize="11" letterSpacing=".6">{`#${r.id} ${Number(r.amount).toFixed(2)} USD₮0 · ${up ? "PAID" : "BLOCKED"}`}</text>}
            </g>
          );
        })}
      </svg>
      <div className="m mute" style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}><span>Up = paid · down = stopped · height = amount</span><span>Oldest → newest</span></div>
    </div>
  );
}

export default function WalletView({ address, from }: { address?: string; from?: number }) {
  const { data, error, fresh } = useAtlas(4000, address ? `/api/wallet/${address}${from ? `?from=${from}` : ""}` : "/api/atlas");
  const [sel, setSel] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [more, setMore] = useState(0); // older decisions revealed, 20 at a time
  const detailRef = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => { if (data && root.current && !reduced()) gsap.from(root.current.querySelectorAll("[data-b]"), { y: 26, autoAlpha: 0, duration: 0.9, stagger: 0.08, ease: "snap" }); }, { dependencies: [!!data] });
  useGSAP(() => { if (sel !== null && detailRef.current && !reduced()) gsap.fromTo(detailRef.current, { height: 0, autoAlpha: 0 }, { height: "auto", autoAlpha: 1, duration: 0.6, ease: "snap" }); }, { dependencies: [sel] });

  const live: WireStatus[] = useMemo(() => (data ? data.fuses.map((f) => (f.latched ? "latched" : "pass")) : []), [data]);
  if (!data) return <div className="page"><div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div><Loading label={address ? "Reading this wallet from X Layer" : "Reading Atlas from X Layer"} error={error} /></div>;

  const a: Atlas = data;
  const cap = a.fuses.find((f) => f.key === "daily-cap" && f.original !== false) ?? a.fuses.find((f) => f.key === "daily-cap");
  const blown = a.fuses.find((f) => f.latched);
  const isPayee = (addr: string) => a.payees.some((p) => p.address.toLowerCase() === addr.toLowerCase());
  const f = sel !== null ? a.fuses[sel] : null;
  const layout = f?.original ? LAYERS.find((l) => l.key === f.key) : null;
  const copy = () => { navigator.clipboard?.writeText(a.wallet); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  // a long history starts short: 20 rows on the desktop table, 8 cards on phones, then 20 more per tap
  const tableN = 20 + more, cardN = 8 + more;
  const older = (n: number) => n < a.decisions.length
    ? <button className="more-btn m" onClick={() => setMore((m) => m + 20)}>Show older decisions <span className="mute">· {Math.min(20, a.decisions.length - n)} of {a.decisions.length - n} more</span></button>
    : a.counts.decisions > a.decisions.length
      ? <p className="more-note m mute">The latest {a.decisions.length} of {a.counts.decisions}. Every one is on X Layer: <a href={`${OKLINK}/address/${a.wallet}`} target="_blank" rel="noreferrer">full history on OKLink ↗</a></p>
      : null;

  return <Responsive mobile={<WalletMobile a={a} fresh={fresh} />} desktop={
    <div className="page" ref={root}>
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <h1 className="sr">{a.isAtlas ? "Atlas, the public Fusebox demo wallet" : `Fusebox wallet ${short(a.wallet)}`}</h1>
      {!a.isAtlas && <AcceptOwnership wallet={a.wallet} style={{ marginTop: 32, marginBottom: -16 }} />}
      <section className="w-hero">
        <div className="who" data-b>
          <div className="m">{a.isAtlas ? <><span className="lime">[<Term k="atlas">Atlas</Term>]</span> <span className="mute">a live AI agent&apos;s wallet on X Layer · try to trick it into paying a scammer</span></> : <><span className="lime">[Fusebox wallet]</span> <span className="mute">owner {short(a.owner)} · agent {short(a.agent)}</span></>}</div>
          <div className="m addr">{a.wallet}<button onClick={copy} data-cursor="Copy">{copied ? "Copied" : "Copy"}</button><a href={`${OKLINK}/address/${a.wallet}`} target="_blank" rel="noreferrer" data-cursor="OKLink">↗</a>{a.isAtlas ? <a href={`https://repo.sourcify.dev/196/${a.wallet}`} target="_blank" rel="noreferrer" data-cursor="Source" style={{ color: "var(--dim)" }}>Verified source ↗</a> : null}</div>
          <div className="bal"><b><Count value={Number(a.balance)} /></b><span className="m">USD₮0 in the wallet</span></div>
          <div className={`state-line${blown || a.paused ? " bad" : ""}`}>
            <i />{a.paused ? <span><b>Paused.</b> The owner froze the wallet; nothing pays until they unfreeze it.</span>
              : blown ? <span><b>{blown.name} blown.</b> Nothing can be paid until the owner resets it.</span>
              : <span><b>{a.fuses.length === 1 ? "Its fuse is holding." : `All ${a.fuses.length} fuses holding.`}</b> A payment reaches the payee only if every <Term k="fuse">fuse</Term> says yes; one no and nothing moves.</span>}
          </div>
        </div>
        <div className="acts" data-b>
          {a.isAtlas ? <Link className="btn lime" href="/app/try" data-cursor="Try it"><span className="roll"><span>Try to scam Atlas</span><span aria-hidden="true">Try to scam Atlas</span></span> <span className="k">→</span></Link>
            : <Link className="btn lime" href={`/app/assistant?wallet=${a.wallet}`} data-cursor="Chat"><span className="roll"><span>Pay by chatting</span><span aria-hidden="true">Pay by chatting</span></span> <span className="k">→</span></Link>}
          <a className="btn" href={`${OKLINK}/address/${a.wallet}`} target="_blank" rel="noreferrer" data-cursor="OKLink"><span className="roll"><span>Open on OKLink</span><span aria-hidden="true">Open on OKLink</span></span> <span className="k">↗</span></a>
          <a className="btn" href={alertsLink(a.wallet)} target="_blank" rel="noreferrer" data-cursor="Telegram" title="A Telegram message for every payment this wallet's agent tries"><span className="roll"><span>Alerts on Telegram</span><span aria-hidden="true">Alerts on Telegram</span></span> <span className="k">↗</span></a>
        </div>
      </section>

      <section className="stats m mute" data-b>
        <div>Spent today<b>{cap ? Number(cap.spentToday).toFixed(2) : "—"}<small>/ {cap?.a ?? "—"}</small></b><div className="meter"><i style={{ transform: `scaleX(${cap ? Math.min(1, Number(cap.spentToday) / cap.a) : 0})` }} /></div></div>
        <div>Decisions<b><Count value={a.counts.decisions} d={0} /></b></div>
        <div>Paid<b className="lime"><Count value={a.counts.allowed} d={0} /></b></div>
        <div>Stopped<b style={{ color: "var(--red)" }}><Count value={a.counts.blocked} d={0} /></b></div>
        <div>Fee balance<b><Count value={Number(a.feeBalance)} d={4} /><small>USD₮0</small></b></div>
        <div>Paid to circuit designers<b><Count value={Number(a.paidToDesigners)} d={4} /><small>USD₮0</small></b></div>
      </section>

      <OwnerConsole data={a} />

      <div className="blockhead" data-b><h2 className="disp">The line</h2><span className="m mute">{a.fuses.length} TapeOut circuits in series · click one to inspect it</span></div>
      <div className="linepanel" data-b>
        <div className="wire-wrap">
          <LineWire fuses={a.fuses.map((x) => ({ name: x.name, meta: `#${x.circuitId} · ${x.gates} gates` })) /* the header says they're TapeOut circuits */} live={live} payee="PAYEES" payeeSub={`${a.payees.length} saved`} selected={sel} onSelect={(i) => setSel(sel === i ? null : i)} />
        </div>
        {f && (
          <div className="detail" ref={detailRef} key={f.slot}>
            <div style={{ gridColumn: "span 2" }}>
              <span className="m lime">Slot {f.slot + 1} · fuse #{f.fuseId}</span>
              <h3>{f.name}</h3>
              <p style={{ color: "var(--soft)", fontSize: 14, lineHeight: 1.5 }}>
                {f.original === false ? `${f.summary ?? "A rival design for this socket."} Settings: ${describe(f.socket, f.a, f.b, f.unit, f.paramLabels)}.${f.latched ? " Blown: it refuses every payment until the owner resets it." : ""}` : <>
                {f.key === "daily-cap" && `No more than ${f.a} USD₮0 a UTC day. ${Number(f.spentToday).toFixed(2)} spent today.`}
                {f.key === "payee-guard" && `Saved payees only. A new payee gets up to ${f.b} USD₮0 until its ${f.a}-hour cooling-off ends.`}
                {f.key === "breaker" && (f.latched ? "Blown: it tripped on a stranger and stays blown until the owner resets it." : "Trips on a payment to a stranger and stays blown until the owner resets it.")}
                {f.key === "approval-2of3" && `Over ${f.a} USD₮0, two of three approvers must sign that exact payment.`}
                </>}
              </p>
            </div>
            <div className="m sch" style={{ gridColumn: "span 2" }}>{layout && <Netlist f={layout} />}<div className="mute" style={{ marginTop: 8 }}>Real netlist · {f.gates} gates{f.nState ? ` · ${f.nState} state bit` : ""}</div></div>
            <div className="m kv" style={{ gridColumn: "span 2" }}>
              <span>TapeOut circuit</span><span><a href={`${OKLINK}/address/${f.processor}`} target="_blank" rel="noreferrer">#{f.circuitId} on TapeOut&apos;s processor {short(f.processor)} ↗</a></span>
              <span>Fee per check</span><span>{fmt(f.fee)} USD₮0</span>
              <span>Decisions</span><span>{f.decisions}</span>
              <span>Earned (claimable)</span><span>{fmt(f.earned)} USD₮0</span>
              <span>Earned (lifetime)</span><span>{fmt(f.lifetimeEarned)} USD₮0</span>
              <span>Designer</span><span><a href={`${OKLINK}/address/${f.designer}`} target="_blank" rel="noreferrer">{short(f.designer)} ↗</a></span>
            </div>
          </div>
        )}
      </div>

      <SpendView wallet={a.wallet} refreshKey={a.counts.decisions} />

      <div className="blockhead" data-b><h2 className="disp">Decisions</h2><span className="m mute">{a.counts.decisions} on-chain · {a.counts.allowed} paid · {a.counts.blocked} stopped</span></div>
      {a.historyLoading && <p className="m mute hist-wait" role="status"><span className="live" />Reading the decision history from X Layer. It fills in on its own.</p>}
      <div data-b><DecisionTools wallet={a.wallet} rows={a.decisions} fresh={fresh} names={a.fuses.map((x) => x.name)} /></div>
      <div data-b><Scope rows={a.decisions} /></div>
      <div className="dtable" style={{ overflowX: "auto" }} data-b tabIndex={0} role="region" aria-label="Decisions table">
        <table className="tbl decisions">
          <thead><tr><th>#</th><th className="hide-s">Time (UTC)</th><th>Result</th><th style={{ textAlign: "right" }}>Amount</th><th>To · what the agent said</th><th>Fuses</th><th className="hide-s" style={{ textAlign: "right" }}>Fees</th><th className="hide-s">Tx</th></tr></thead>
          <tbody>
            {a.decisions.slice(0, tableN).map((r) => (
              <tr key={r.id} className={fresh.has(r.id) ? "new" : ""}>
                <td className="num" style={{ textAlign: "left" }}>{r.id}</td>
                <td className="num hide-s" style={{ textAlign: "left" }}>{new Date(r.time * 1000).toISOString().slice(5, 16).replace("T", " ")}</td>
                <td><span className={`res ${r.allowed ? "ok" : "no"}`}>{r.allowed ? "Paid" : "Stopped"}</span>{!r.allowed && a.fuses.some((x, i) => x.key === "approval-2of3" && r.status[i] === "blew") ? <Link className="m lime" style={{ display: "block", marginTop: 6, fontSize: 10.5 }} href={`/app/approve?wallet=${a.wallet}&to=${r.to}&amount=${r.amount}`}>Approve ↗</Link> : null}</td>
                <td className="num">{fmt(r.amount)}</td>
                <td className="memo">“{readableMemo(r.memo)}”<small>{short(r.to)} · {isPayee(r.to) ? "saved payee" : "stranger"}</small></td>
                <td><span className="sq">{r.status.map((s, i) => <i key={i} className={s} title={`${a.fuses[i]?.name ?? "fuse"}: ${s}`} />)}</span></td>
                <td className="num hide-s">{fmt(r.fee)}</td>
                <td className="hide-s"><a className="tx" href={`${OKLINK}/tx/${r.tx}`} target="_blank" rel="noreferrer">{r.tx.slice(0, 10)}…</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        {older(tableN)}
      </div>
      {/* phones: each decision as a card instead of a squeezed table */}
      <div className="dcards" data-b>
        {a.decisions.slice(0, cardN).map((r) => {
          const needs2of3 = !r.allowed && a.fuses.some((x, i) => x.key === "approval-2of3" && r.status[i] === "blew");
          const blew = a.fuses.filter((_, i) => r.status[i] !== "pass").map((f) => f.name);
          return (
            <div key={r.id} className={`dcard ${r.allowed ? "ok" : "no"}${fresh.has(r.id) ? " new" : ""}`}>
              <div className="dc-top m"><span className="mute">#{r.id} · {new Date(r.time * 1000).toISOString().slice(5, 16).replace("T", " ")} UTC</span><span className={`res ${r.allowed ? "ok" : "no"}`}>{r.allowed ? "Paid" : "Stopped"}</span></div>
              <div className="dc-amt"><b>{fmt(r.amount)}</b><span className="m mute">USD₮0 → {short(r.to)} · {isPayee(r.to) ? "saved payee" : "stranger"}</span></div>
              <p className="dc-memo">“{readableMemo(r.memo)}”</p>
              <div className="dc-foot m">
                <span className="sq">{r.status.map((s, i) => <i key={i} className={s} title={`${a.fuses[i]?.name ?? "fuse"}: ${s}`} />)}</span>
                <span className="mute">{r.allowed ? "All fuses held" : `${blew.join(", ")} blew`}</span>
              </div>
              <div className="dc-links m">
                <a href={`${OKLINK}/tx/${r.tx}`} target="_blank" rel="noreferrer">Transaction ↗</a>
                {needs2of3 && <Link className="lime" href={`/app/approve?wallet=${a.wallet}&to=${r.to}&amount=${r.amount}`}>Approve it →</Link>}
              </div>
            </div>
          );
        })}
        {older(cardN)}
      </div>

      <div className="side2" data-b>
        <div><span className="m mute">Saved payees · Payee Guard lets these through after {a.fuses.find((x) => x.key === "payee-guard")?.a ?? 24} h</span>
          <ul>{a.payees.map((p) => <li key={p.address}>{short(p.address)}<span>since {new Date(p.since * 1000).toISOString().slice(0, 16).replace("T", " ")}</span></li>)}</ul></div>
        <div><span className="m mute">Approvers · two of three sign anything over {a.fuses.find((x) => x.key === "approval-2of3")?.a ?? 20} USD₮0</span>
          <ul>{a.approvers.map((p, i) => <li key={p}>{short(p)}<span>seat {i + 1}</span></li>)}</ul></div>
      </div>
    </div>
  } />;
}
