"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";

// Paid / stopped marks. Validated on the #0b0b0b panel with the dataviz palette checks: lightness band, chroma,
// CVD separation (ΔE 11.4 deutan), normal vision (27.8) and contrast all pass. Text never wears these colors.
const PAID = "#7aa61d", STOP = "#c23a22";

interface Row { id: number; t: number; to: string; a: number; ok: boolean; s: number[]; f: number }
interface Hist { names: string[]; saved: string[]; rows: Row[] }
type Range = "7" | "30" | "all";
type Tip = { x: number; y: number; lines: [string, string][] } | null;

const usd = (v: number) => (v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v >= 10 ? v.toFixed(1) : v.toFixed(v >= 1 ? 2 : 4));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const dayLabel = (d: number) => new Date(d * 86400_000).toISOString().slice(5, 10).replace("-", "/");
/** The largest round tick (1, 2 or 5 × 10^n) that still fits under v, so the axis always labels a real height. */
const nice = (v: number) => { if (v <= 0) return 0; const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p; };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width))); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}

/** A bar with a 4px rounded data end; square at the baseline. dir: up, down or right. */
function bar(x: number, y: number, w: number, h: number, dir: "up" | "down" | "right") {
  const r = Math.min(4, dir === "right" ? w / 2 : h / 2, dir === "right" ? h / 2 : w / 2);
  if (dir === "up") return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  if (dir === "down") return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

/** Paid above the baseline, stopped below it, per day (per week past 60 days); one shared USD₮0 scale. */
function DaysChart({ days, onTip }: { days: { d: number; label: string; paid: number; stopped: number; nP: number; nS: number }[]; onTip: (t: Tip) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 220, top = 18, bottom = 30, left = 46;
  const maxP = Math.max(0, ...days.map((d) => d.paid)), maxS = Math.max(0, ...days.map((d) => d.stopped));
  const total = maxP + maxS || 1;
  const plotH = H - top - bottom;
  const y0 = top + plotH * (maxP / total || 0.5); // the baseline splits the height in proportion, so one scale serves both sides
  const k = plotH / total;
  const slot = days.length ? (W - left) / days.length : 0;
  const bw = Math.max(2, Math.min(24, slot * 0.62));
  const tickP = maxP ? nice(maxP) : 0, tickS = maxS ? nice(maxS) : 0;
  return (
    <div ref={ref} className="spend-svg" onPointerLeave={() => onTip(null)}>
      {W > 0 && (
        <svg width={W} height={H} role="img" aria-label={`Paid and stopped USD₮0 per ${days.length > 0 && days[0].label.includes("wk") ? "week" : "day"}, ${days.length} periods`}>
          {tickP > 0 && <g><line x1={left} x2={W} y1={y0 - tickP * k} y2={y0 - tickP * k} className="sv-grid" /><text x={left - 8} y={y0 - tickP * k + 4} className="sv-tick" textAnchor="end">{usd(tickP)}</text></g>}
          {tickS > 0 && <g><line x1={left} x2={W} y1={y0 + tickS * k} y2={y0 + tickS * k} className="sv-grid" /><text x={left - 8} y={y0 + tickS * k + 4} className="sv-tick" textAnchor="end">{usd(tickS)}</text></g>}
          <line x1={left} x2={W} y1={y0} y2={y0} className="sv-base" />
          <text x={left - 8} y={y0 + 4} className="sv-tick" textAnchor="end">0</text>
          {days.map((d, i) => {
            const cx = left + slot * i + slot / 2, x = cx - bw / 2;
            const hp = d.paid * k, hs = d.stopped * k;
            const show = (e: React.PointerEvent | React.FocusEvent) => {
              const r = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
              onTip({ x: r.left + cx, y: r.top + y0 - hp - 8, lines: [[d.label, ""], [`${usd(d.paid)} USD₮0`, `paid · ${d.nP}`], [`${usd(d.stopped)} USD₮0`, `stopped · ${d.nS}`]] });
            };
            return (
              <g key={d.d}>
                {hp > 0 && <path d={bar(x, y0 - 1 - Math.max(hp, 1.5), bw, Math.max(hp, 1.5), "up")} fill={PAID} />}
                {hs > 0 && <path d={bar(x, y0 + 1, bw, Math.max(hs, 1.5), "down")} fill={STOP} />}
                <rect x={left + slot * i} y={0} width={slot} height={H - bottom} fill="transparent" onPointerMove={show} onPointerEnter={show} />
              </g>
            );
          })}
          {days.length > 0 && [0, Math.floor((days.length - 1) / 2), days.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
            <text key={i} x={Math.min(W - 4, Math.max(left + 14, left + slot * i + slot / 2))} y={H - 10} className="sv-tick" textAnchor="middle">{days[i].label}</text>
          ))}
        </svg>
      )}
    </div>
  );
}

/** Ranked horizontal bars, one hue, the value at each tip. */
function RankBars({ rows, color, unit, onTip }: { rows: { label: string; sub?: string; v: number; tip: [string, string][] }[]; color: string; unit: string; onTip: (t: Tip) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const max = Math.max(0, ...rows.map((r) => r.v)) || 1;
  const labelW = Math.min(170, Math.max(110, W * 0.36)), valW = 92, rowH = 34, bh = 12;
  const span = Math.max(20, W - labelW - valW);
  return (
    <div ref={ref} className="spend-svg" onPointerLeave={() => onTip(null)}>
      {W > 0 && (
        <svg width={W} height={rows.length * rowH + 4} role="img" aria-label={rows.map((r) => `${r.label}: ${usd(r.v)} ${unit}`).join("; ")}>
          {rows.map((r, i) => {
            const y = i * rowH + 4, w = Math.max(2, (r.v / max) * span);
            const show = (e: React.PointerEvent) => { const b = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect(); onTip({ x: b.left + labelW + w, y: b.top + y, lines: r.tip }); };
            return (
              <g key={r.label + i}>
                <text x={0} y={y + 13} className="sv-lab">{r.label}</text>
                {r.sub && <text x={0} y={y + 26} className="sv-sub">{r.sub}</text>}
                <path d={bar(labelW, y + 4, w, bh, "right")} fill={color} />
                <text x={labelW + w + 8} y={y + 14} className="sv-val">{unit === "USD₮0" ? usd(r.v) : r.v}<tspan className="sv-sub"> {unit}</tspan></text>
                <rect x={0} y={y - 2} width={W} height={rowH} fill="transparent" onPointerMove={show} onPointerEnter={show} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Where the money went and what the fuses stopped, from the wallet's whole decision history on X Layer. */
export default function SpendView({ wallet, refreshKey }: { wallet: Address; refreshKey: number }) {
  const box = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [h, setH] = useState<Hist | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("30");
  const [tip, setTip] = useState<Tip>(null);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: "700px" });
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!near) return;
    let on = true;
    fetch(`/api/wallet/${wallet}/history`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (!on) return; if (j.rows) { setH(j); setErr(null); } else setErr(j.error ?? "unreachable"); }).catch(() => on && setErr("unreachable"));
    return () => { on = false; };
  }, [near, wallet, refreshKey]);

  const v = useMemo(() => {
    if (!h) return null;
    const ts = h.rows.map((r) => r.t);
    const end = Math.max(Date.now() / 1000, ...ts);
    const start = range === "all" ? Math.min(end, ...ts) : end - Number(range) * 86400;
    const rows = h.rows.filter((r) => r.t >= start && r.t <= end);
    const paid = rows.filter((r) => r.ok), stopped = rows.filter((r) => !r.ok);
    const sum = (xs: Row[], k: "a" | "f" = "a") => xs.reduce((t, r) => t + r[k], 0);
    // periods: days, or weeks once the range passes 60 days
    const d0 = Math.floor(start / 86400), d1 = Math.floor(end / 86400), step = d1 - d0 + 1 > 60 ? 7 : 1;
    const days: { d: number; label: string; paid: number; stopped: number; nP: number; nS: number }[] = [];
    for (let d = d0; d <= d1; d += step) days.push({ d, label: step === 7 ? `wk ${dayLabel(d)}` : dayLabel(d), paid: 0, stopped: 0, nP: 0, nS: 0 });
    for (const r of rows) { const b = days[Math.min(days.length - 1, Math.floor((Math.floor(r.t / 86400) - d0) / step))]; if (!b) continue; if (r.ok) { b.paid += r.a; b.nP++; } else { b.stopped += r.a; b.nS++; } }
    const saved = new Set(h.saved.map((a) => a.toLowerCase()));
    const by = new Map<string, { v: number; n: number }>();
    for (const r of paid) { const k = r.to.toLowerCase(); const x = by.get(k) ?? { v: 0, n: 0 }; x.v += r.a; x.n++; by.set(k, x); }
    const ranked = [...by.entries()].sort((a, b) => b[1].v - a[1].v);
    const top = ranked.slice(0, 6), rest = ranked.slice(6);
    const payees = top.map(([a, x]) => ({ label: short(a), sub: saved.has(a) ? "saved payee" : "not saved now", v: x.v, tip: [[`${usd(x.v)} USD₮0`, "paid"], [`${x.n}`, `payment${x.n === 1 ? "" : "s"}`], [a, ""]] as [string, string][] }));
    if (rest.length) { const o = rest.reduce((t, [, x]) => ({ v: t.v + x.v, n: t.n + x.n }), { v: 0, n: 0 }); payees.push({ label: `${rest.length} others`, sub: "", v: o.v, tip: [[`${usd(o.v)} USD₮0`, "paid"], [`${o.n}`, "payments"]] }); }
    // what each fuse stopped: a decision counts for every fuse that blew on it (one stopped payment can trip several)
    const line = stopped.filter((r) => r.s.length === h.names.length);
    const fuses = h.names.map((name, i) => {
      const hit = line.filter((r) => r.s[i] === 1);
      const sole = hit.filter((r) => r.s.filter((x) => x === 1).length === 1).length;
      return { label: name, v: hit.length, value: sum(hit), sole };
    }).filter((f) => f.v > 0).sort((a, b) => b.v - a.v).map((f) => ({ label: f.label, sub: `${usd(f.value)} USD₮0 refused`, v: f.v, tip: [[`${f.v}`, `payment${f.v === 1 ? "" : "s"} refused`], [`${usd(f.value)} USD₮0`, "refused value"], [`${f.sole}`, "it alone said no"]] as [string, string][] }));
    return { rows, paid, stopped, days, payees, fuses, totals: { paid: sum(paid), stopped: sum(stopped), fees: sum(rows, "f"), payees: by.size }, earlier: stopped.length - line.length };
  }, [h, range]);

  return (
    <section className="spend" ref={box} data-b aria-label="Spending">
      <div className="blockhead"><h2 className="disp">Spending</h2>
        <div className="spend-range m" role="group" aria-label="Range">
          {([["7", "7 days"], ["30", "30 days"], ["all", "All time"]] as [Range, string][]).map(([k, l]) => <button key={k} className={range === k ? "on" : ""} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>)}
        </div>
      </div>
      {!v ? <p className="m mute spend-wait">{err ? `Couldn't read the history just now (${err}).` : "Reading every decision from X Layer…"}</p> : !v.rows.length ? <p className="m mute spend-wait">No decisions in this range.</p> : (
        <>
          <div className="stats m mute spend-kpi">
            <div>Paid<b>{usd(v.totals.paid)}<small>USD₮0</small></b><span>{v.paid.length} payment{v.paid.length === 1 ? "" : "s"}</span></div>
            <div>Stopped<b>{usd(v.totals.stopped)}<small>USD₮0</small></b><span>{v.stopped.length} refused before anything moved</span></div>
            <div>Payees paid<b>{v.totals.payees}</b><span>distinct addresses</span></div>
            <div>Fees<b>{usd(v.totals.fees)}<small>USD₮0</small></b><span>to fuse designers</span></div>
          </div>
          <div className="spend-grid">
            <div className="spend-card spend-wide">
              <div className="spend-h m"><span>Per {v.days.length && v.days[0].label.startsWith("wk") ? "week" : "day"}, USD₮0</span>
                <span className="spend-legend"><i style={{ background: PAID }} />Paid (up)<i style={{ background: STOP }} />Stopped (down)</span></div>
              <DaysChart days={v.days} onTip={setTip} />
            </div>
            <div className="spend-card">
              <div className="spend-h m"><span>Where it went · top payees</span></div>
              {v.payees.length ? <RankBars rows={v.payees} color={PAID} unit="USD₮0" onTip={setTip} /> : <p className="m mute">Nothing paid in this range.</p>}
            </div>
            <div className="spend-card">
              <div className="spend-h m"><span>What the fuses stopped</span></div>
              {v.fuses.length ? <RankBars rows={v.fuses} color={STOP} unit="refused" onTip={setTip} /> : <p className="m mute">Nothing stopped in this range.</p>}
              {v.earlier > 0 && <p className="m mute spend-note">{v.earlier} stopped under an earlier line of fuses aren&apos;t split by fuse.</p>}
            </div>
          </div>
          <details className="spend-table m">
            <summary>Show the numbers</summary>
            <table><caption className="sr">Paid and stopped per period</caption><thead><tr><th>Period</th><th>Paid USD₮0</th><th>Payments</th><th>Stopped USD₮0</th><th>Refused</th></tr></thead>
              <tbody>{v.days.filter((d) => d.nP || d.nS).map((d) => <tr key={d.d}><td>{d.label}</td><td>{usd(d.paid)}</td><td>{d.nP}</td><td>{usd(d.stopped)}</td><td>{d.nS}</td></tr>)}</tbody></table>
            <table><caption className="sr">Top payees</caption><thead><tr><th>Payee</th><th>Paid USD₮0</th></tr></thead><tbody>{v.payees.map((p) => <tr key={p.label}><td>{p.label} {p.sub}</td><td>{usd(p.v)}</td></tr>)}</tbody></table>
            <table><caption className="sr">Refusals per fuse</caption><thead><tr><th>Fuse</th><th>Refused</th><th>Value</th></tr></thead><tbody>{v.fuses.map((f) => <tr key={f.label}><td>{f.label}</td><td>{f.v}</td><td>{f.sub}</td></tr>)}</tbody></table>
          </details>
        </>
      )}
      {tip && (
        <div className="spend-tip m" style={{ left: tip.x, top: tip.y }} role="presentation">
          {tip.lines.map(([a, b], i) => <div key={i}><b>{a}</b>{b ? <span> {b}</span> : null}</div>)}
        </div>
      )}
    </section>
  );
}
