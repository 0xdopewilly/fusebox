"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMarket } from "@/lib/useMarket";
import { fieldsFor, readField, SOCKETS } from "@/lib/sockets";
import { runLine, type Payee, type SimFuse, type SimPayment, type SimStep } from "@/lib/simulate";
import { pub } from "@/lib/client-chain";
import { gsap, reduced } from "@/lib/gsap";
import Loading from "./Loading";
import { compile, decodeDraft, paramLabels } from "@/lib/studio";
import { load } from "@/lib/circuits/tap02";
import type { MarketFuse } from "@/lib/market";
import { PageChrome } from "./m/chrome";

type Row = SimPayment & { key: number };
let k = 0;
const row = (memo: string, to: Payee, amount: string, seats: [boolean, boolean, boolean] = [false, false, false]): Row => ({ key: ++k, memo, to, amount, seats });
const PRESETS: Record<string, { label: string; rows: () => Row[] }> = {
  scam: { label: "A scam morning", rows: () => [
    row("Invoice INV-7790, Kano Cotton", "saved", "0.5"),
    row("We moved banks: pay INV-7791 to our new account", "stranger", "2.5"),
    row("Invoice INV-7792, revised total for the Q4 order", "saved", "60"),
    row("URGENT from the CEO: wire this before 5pm", "stranger", "25"),
    row("Invoice INV-7793, Kano Cotton", "saved", "0.5"),
    row("Q4 bulk order, signed off by finance and ops", "saved", "30", [true, true, false]),
  ] },
  normal: { label: "A normal day", rows: () => [
    row("Invoice INV-8001, Kano Cotton", "saved", "4"),
    row("Courier, same-day delivery", "saved", "1.5"),
    row("First order from a new supplier", "new", "1.5"),
    row("Same supplier, full invoice", "new", "12"),
    row("Monthly tooling licence", "saved", "18"),
    row("Quarterly stock order, two approvals", "saved", "40", [true, false, true]),
  ] },
};
const TO: Record<Payee, string> = { saved: "Saved payee", new: "Saved today", stranger: "Stranger" };
const okAmt = (s: string) => /^\d+(\.\d{1,6})?$/.test(s.trim());

/** Pick fuses and settings, line up payments, and run them through TapeOut's real circuits on X Layer. */
export default function SimulateView() {
  const { data: market, error } = useMarket();
  // a Fuse Studio draft (?draft=…) joins the list as fuse -1, evaluated in the browser from its own TAP-02 bytes
  const [draft, setDraft] = useState<{ fuse: MarketFuse; circuit: ReturnType<typeof load>; code: string } | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("draft"); if (!code) return;
    const d = decodeDraft(code); if (!d) return;
    const c = compile(d.rule);
    const name = `Draft · ${d.name || "untitled"}`;
    setDraft({ code, circuit: load(c.net.bytes, c.nIn, 1), fuse: { fuseId: -1, key: "draft", name, processor: "0x0000000000000000000000000000000000000000", circuitId: 0, designer: "0x0000000000000000000000000000000000000000", socket: d.rule.socket, gates: c.net.gates, nState: c.nState, fee: "0", listed: true, decisions: 0, earned: "0", lifetimeEarned: "0", metadataURI: "", onAtlas: false, netlistHash: c.net.keccak as `0x${string}`, nIn: c.nIn, listedAt: 0, original: false, meta: { name, params: paramLabels(d.rule) } } });
  }, []);
  const listed = useMemo(() => [...(draft ? [draft.fuse] : []), ...(market?.fuses ?? []).filter((f) => f.listed).sort((a, b) => a.fuseId - b.fuseId)], [market, draft]);
  const [sel, setSel] = useState<Record<number, { on: boolean; v: Record<string, string> }>>({});
  const [rows, setRows] = useState<Row[]>(PRESETS.scam.rows);
  // ?rows= (from plain-English guardrails): the proposal's own test payments, [memo, to, amount, approvals][]
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("rows"); if (!r) return;
    try {
      const arr = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(r.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)))) as [string, Payee, string, number][];
      const ok = arr.filter((x) => Array.isArray(x) && ["saved", "new", "stranger"].includes(x[1]) && /^\d{1,9}(\.\d{1,6})?$/.test(String(x[2]))).slice(0, 12)
        .map(([m, t, a, n]) => row(String(m).slice(0, 80), t, String(a), [n > 0, n > 1, n > 2]));
      if (ok.length) setRows(ok);
    } catch { /* a bad link keeps the default payments */ }
  }, []);
  const [spent, setSpent] = useState("0"); const [hours, setHours] = useState("2");
  const [res, setRes] = useState<(SimStep | null)[]>([]);
  const [ran, setRan] = useState<{ fuses: SimFuse[]; rows: Row[]; block: bigint } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const out = useRef<HTMLDivElement>(null);

  // the line starts as the four shipped fuses (or what ?f=id:a:b,… asks for)
  useEffect(() => {
    // set up every listed fuse not set up yet: the draft can arrive before the market does, and vice versa
    const missing = listed.filter((f) => !sel[f.fuseId]);
    if (!missing.length) return;
    // read in the browser, like the approve page (a Suspense boundary would hold back the page's reveal)
    const ask = new Map((new URLSearchParams(window.location.search).get("f") ?? "").split(",").filter(Boolean).map((t) => { const [id, a, b] = t.split(":"); return [Number(id), { a, b }] as const; }));
    const next: typeof sel = { ...sel };
    for (const f of missing) {
      const fields = fieldsFor(f.socket, f.original ? undefined : f.meta?.params);
      const want = ask.get(f.fuseId);
      // with a draft, it stands in for the shipped fuse of its socket
      const on = f.fuseId === -1 ? true : ask.size ? !!want : f.original && !(draft && draft.fuse.socket === f.socket);
      next[f.fuseId] = { on, v: Object.fromEntries(fields.map((x) => [x.k, (x.k === "a" ? want?.a : want?.b) ?? String(x.def)])) };
    }
    setSel(next);
  }, [listed, sel, draft]);

  const line = listed.filter((f) => sel[f.fuseId]?.on);
  const problems: string[] = [];
  const simFuses: SimFuse[] = line.map((f) => {
    const fields = fieldsFor(f.socket, f.original ? undefined : f.meta?.params);
    const v: { a: number; b: number } = { a: 0, b: 0 };
    for (const x of fields) { const r = readField(x, sel[f.fuseId].v[x.k] ?? ""); if ("error" in r) problems.push(`${f.meta?.name ?? f.name}: ${r.error}`); else v[x.k] = r.n; }
    return { fuseId: f.fuseId, name: f.meta?.name ?? f.name, socket: f.socket, processor: f.processor, circuitId: f.circuitId, nState: f.nState, ...v, local: f.fuseId === -1 ? draft?.circuit : undefined };
  });
  if (!line.length) problems.push("Splice in at least one fuse");
  if (!rows.length) problems.push("Add a payment");
  rows.forEach((r, i) => { if (!okAmt(r.amount)) problems.push(`Payment ${i + 1}: an amount in USD₮0`); });
  if (!okAmt(spent)) problems.push("Spent today: an amount in USD₮0");
  if (!/^\d+$/.test(hours.trim())) problems.push("Hours since today's payee was saved: a whole number");

  const run = async () => {
    setBusy(true); setErr(null); setRes(rows.map(() => null));
    const snapshot = { fuses: simFuses, rows: rows.map((r) => ({ ...r })), block: 0n };
    try {
      snapshot.block = await pub.getBlockNumber();
      setRan(snapshot);
      setTimeout(() => out.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }), 60);
      await runLine(snapshot.fuses, snapshot.rows, { spentToday: spent, newPayeeHours: Number(hours) }, (i, s) => setRes((prev) => { const n = [...prev]; n[i] = s; return n; }));
    } catch (e) { setErr((e as Error).message?.slice(0, 140) || "X Layer didn't answer"); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (reduced()) return;
    const last = res.reduce((a, s, i) => (s ? i : a), -1);
    if (last < 0) return;
    gsap.fromTo(`[data-simrow="${last}"] .sim-cell`, { scale: 0.4, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.35, stagger: 0.06, ease: "back.out(2.4)" });
  }, [res]);

  const upd = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const grid = <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>;
  if (!market) return <div className="page">{grid}<Loading label="Reading the fuse registry" error={error} /></div>;
  const done = res.filter(Boolean) as SimStep[];
  const stopped = done.filter((s) => !s.allowed).length;
  const calls = rows.length * line.length + rows.length * line.filter((f) => f.nState > 0).length;

  return (
    <div className="page">
      {grid}
      <PageChrome title="Line simulator" sub="Real eval() on X Layer · free" info={<p>Pick fuses and their limits, line up the payments an agent might be asked to make, and run them through TapeOut&apos;s circuits. Every verdict is a real eval call on X Layer: free, no wallet, and nothing moves.</p>} />
      <section className="try-head m-hide">
        <h1 className="disp" data-a>Test a <span className="lime">[line]</span>.</h1>
        <p data-a>Pick fuses and their limits, line up the payments an agent might be asked to make, and run them through TapeOut&apos;s circuits. Every verdict is a real <span className="m lime">eval</span> call on X Layer: free, no wallet, and nothing moves.</p>
      </section>
      <h2 className="sr">Set up the test</h2>
      <section className="sim" data-a>
        <div className="sim-col">
          <div className="sim-h m"><span className="lime">01</span> The line · {line.length} fuse{line.length === 1 ? "" : "s"}</div>
          {Object.entries(listed.reduce<Record<number, typeof listed>>((g, f) => { (g[f.socket] ??= []).push(f); return g; }, {})).map(([sock, fs]) => (
            <div key={sock} className="sim-sock">
              <div className="m mute sim-sock-h">{SOCKETS[Number(sock)]?.name ?? `Socket ${sock}`} socket</div>
              {fs.map((f) => {
                const s = sel[f.fuseId]; const on = !!s?.on;
                const fields = fieldsFor(f.socket, f.original ? undefined : f.meta?.params);
                return (
                  <div key={f.fuseId} className={`sim-fuse${on ? " on" : ""}`}>
                    <label className="sim-fuse-top">
                      <input type="checkbox" checked={on} onChange={() => setSel({ ...sel, [f.fuseId]: { ...s, on: !on } })} aria-label={`Splice in ${f.meta?.name ?? f.name}`} />
                      <span className="sim-box" aria-hidden="true" />
                      <b>{f.meta?.name ?? f.name}</b>
                      <span className="m mute">#{f.fuseId} · {f.gates} gates{f.nState ? ` · ${f.nState} latch` : ""}</span>
                    </label>
                    {on && fields.length > 0 && (
                      <div className="sim-fields">
                        {fields.map((x) => <label key={x.k} className="m"><span>{x.label} ({x.suffix})</span><input aria-label={`${f.meta?.name ?? f.name}: ${x.label}`} value={s.v[x.k] ?? ""} onChange={(e) => setSel({ ...sel, [f.fuseId]: { ...s, v: { ...s.v, [x.k]: e.target.value } } })} inputMode="numeric" /></label>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="sim-ctx">
            <label className="m"><span>Already spent today (USD₮0)</span><input aria-label="Already spent today in USD₮0" value={spent} onChange={(e) => setSpent(e.target.value)} inputMode="decimal" /></label>
            <label className="m"><span>Today&apos;s new payee, saved (hours ago)</span><input aria-label="Hours since today's new payee was saved" value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" /></label>
          </div>
        </div>

        <div className="sim-col">
          <div className="sim-h m"><span className="lime">02</span> The payments · in order
            <span className="sim-presets">{Object.entries(PRESETS).map(([id, p]) => <button key={id} className="dt-btn" onClick={() => { setRows(p.rows()); setRes([]); setRan(null); }}>{p.label}</button>)}</span>
          </div>
          <ol className="sim-pays">
            {rows.map((r, i) => (
              <li key={r.key}>
                <span className="m mute sim-n">{String(i + 1).padStart(2, "0")}</span>
                <div className="sim-pay">
                  <input aria-label={`Payment ${i + 1}: what the agent was told`} value={r.memo} onChange={(e) => upd(i, { memo: e.target.value })} placeholder="What the agent was told" />
                  <div className="sim-pay-row">
                    <select aria-label={`Payment ${i + 1}: who it goes to`} value={r.to} onChange={(e) => upd(i, { to: e.target.value as Payee })}>{(Object.keys(TO) as Payee[]).map((t) => <option key={t} value={t}>{TO[t]}</option>)}</select>
                    <label className="sim-amt"><input aria-label={`Payment ${i + 1}: amount in USD₮0`} value={r.amount} onChange={(e) => upd(i, { amount: e.target.value })} inputMode="decimal" /><span className="m mute">USD₮0</span></label>
                    <span className="sim-seats m" role="group" aria-label={`Payment ${i + 1}: approvals`}>
                      {r.seats.map((on, s) => <button key={s} className={on ? "on" : ""} aria-pressed={on} title={`Approver seat ${s + 1} signed`} onClick={() => upd(i, { seats: r.seats.map((x, j) => (j === s ? !x : x)) as [boolean, boolean, boolean] })}>S{s + 1}</button>)}
                    </span>
                    <button className="sim-x" aria-label={`Remove payment ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <button className="dt-btn sim-add" onClick={() => setRows([...rows, row("", "saved", "1")])} disabled={rows.length >= 12}>+ Add a payment</button>
        </div>
      </section>

      <div className="sim-go" data-a>
        <button className="btn lime" disabled={busy || problems.length > 0} onClick={run}><span>{busy ? "Running on X Layer…" : "Run it on X Layer"}</span> <span className="k">→</span></button>
        <span className="m mute">{problems[0] ?? `${rows.length} payment${rows.length === 1 ? "" : "s"} × ${line.length} fuse${line.length === 1 ? "" : "s"} · ${calls} circuit calls on TapeOut's processor`}</span>
      </div>

      {ran && (
        <section className="sim-out" ref={out} aria-live="polite">
          <div className="blockhead"><h2 className="disp">The verdicts</h2><span className="m mute">{done.length < ran.rows.length ? `deciding ${done.length + 1} of ${ran.rows.length}…` : `${ran.rows.length - stopped} paid · ${stopped} stopped`} · X Layer block {ran.block.toString()}</span></div>
          {err && <p className="m red">{err}</p>}
          <div className="sim-table" role="table" aria-label="Verdicts">
            <div className="sim-tr sim-th m" role="row" style={{ gridTemplateColumns: `minmax(0, 2.4fr) repeat(${ran.fuses.length}, minmax(64px, 1fr)) 110px` }}>
              <span role="columnheader">Payment</span>{ran.fuses.map((f) => <span key={f.fuseId} role="columnheader" title={f.name}>{f.name}</span>)}<span role="columnheader">Verdict</span>
            </div>
            {ran.rows.map((r, i) => {
              const s = res[i];
              return (
                <div key={r.key} className={`sim-tr${s ? (s.allowed ? " ok" : " no") : ""}`} role="row" data-simrow={i} style={{ gridTemplateColumns: `minmax(0, 2.4fr) repeat(${ran.fuses.length}, minmax(64px, 1fr)) 110px` }}>
                  <span role="cell" className="sim-what"><b>{r.amount} USD₮0</b> → {TO[r.to].toLowerCase()}{r.seats.some(Boolean) ? ` · signed ${r.seats.map((x, j) => (x ? `S${j + 1}` : "")).filter(Boolean).join("+")}` : ""}<small>“{r.memo || "no memo"}”</small></span>
                  {ran.fuses.map((f, j) => (
                    <span key={f.fuseId} role="cell" className="sim-c" data-name={f.name}>
                      {s ? <i className={`sim-cell ${s.verdicts[j]}`} title={`${f.name}: ${s.verdicts[j]}${s.latchedAfter[j] ? " · blown from here" : ""}`}>{s.verdicts[j] === "pass" ? "✓" : s.verdicts[j] === "blew" ? "✕" : "?"}</i> : <i className="sim-cell wait" />}
                      {s?.latchedAfter[j] && f.nState > 0 ? <em className="m red">blown</em> : null}
                    </span>
                  ))}
                  <span role="cell" className={`m sim-v ${s ? (s.allowed ? "lime" : "red") : "mute"}`}>{s ? (s.allowed ? "Paid" : "Stopped") : "…"}</span>
                </div>
              );
            })}
          </div>
          {done.length === ran.rows.length && (
            <p className="sim-sum">
              {stopped === 0 ? "Every payment went through: this line didn't stop anything here." : `${stopped} of ${ran.rows.length} stopped before a cent moved.`}{" "}
              Each check costs the fuse&apos;s fee on a real wallet ({ran.fuses.reduce((t, f) => t + Number(market.fuses.find((x) => x.fuseId === f.fuseId)?.fee ?? 0), 0).toFixed(4)} USD₮0 a decision for this line).{" "}
              {ran.fuses.some((f) => f.fuseId === -1)
                ? <Link className="lime" href={`/app/studio?draft=${draft?.code ?? ""}`}>Back to the Studio to tape it out →</Link>
                : <Link className="lime" href={`/app/new?f=${ran.fuses.map((f) => [f.fuseId, f.a, f.b].join(":")).join(",")}`}>Wire up a wallet with this line →</Link>}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
