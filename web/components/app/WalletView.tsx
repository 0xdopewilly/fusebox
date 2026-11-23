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
import { ChainAlerts } from "./ChainAlerts";
import { useLang } from "@/lib/i18n";
import { settingsZh } from "./m/WalletMobile";

const STATUS_ZH: Record<string, string> = { pass: "通过", blew: "熔断", failed: "失败", untrusted: "未受信" };

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
  const { t } = useLang();
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
            <g key={r.id} onMouseEnter={() => setHover(i)} data-cursor={`#${r.id} · ${up ? t("paid", "已付款") : t("blocked", "已拦截")}`}>
              <rect x={x(i) - 10} y="0" width="20" height={H} fill="transparent" />
              <rect className="tick" data-up={up ? "1" : "0"} x={x(i) - 1.5} y={up ? mid - hh : mid} width="3" height={hh} fill={c} opacity={hover === null || hover === i ? 1 : 0.35} />
              <rect x={x(i) - 3.5} y={(up ? mid - hh : mid + hh) - 3.5} width="7" height="7" fill={c} opacity={hover === i ? 1 : 0} />
              {hover === i && <text x={Math.min(W - 160, x(i) + 10)} y={up ? mid - hh - 8 : mid + hh + 16} fill={c} fontFamily="var(--f-mono)" fontSize="11" letterSpacing=".6">{`#${r.id} ${Number(r.amount).toFixed(2)} USD₮0 · ${up ? t("PAID", "已付款") : t("BLOCKED", "已拦截")}`}</text>}
            </g>
          );
        })}
      </svg>
      <div className="m mute" style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}><span>{t("Up = paid · down = stopped · height = amount", "向上 = 已付款 · 向下 = 已拦截 · 高度 = 金额")}</span><span>{t("Oldest → newest", "最早 → 最新")}</span></div>
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
  const { t, zh } = useLang();

  useGSAP(() => { if (data && root.current && !reduced()) gsap.from(root.current.querySelectorAll("[data-b]"), { y: 26, autoAlpha: 0, duration: 0.9, stagger: 0.08, ease: "snap" }); }, { dependencies: [!!data] });
  useGSAP(() => { if (sel !== null && detailRef.current && !reduced()) gsap.fromTo(detailRef.current, { height: 0, autoAlpha: 0 }, { height: "auto", autoAlpha: 1, duration: 0.6, ease: "snap" }); }, { dependencies: [sel] });

  const live: WireStatus[] = useMemo(() => (data ? data.fuses.map((f) => (f.latched ? "latched" : "pass")) : []), [data]);
  if (!data) return <div className="page"><div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div><Loading label={address ? t("Reading this wallet from X Layer", "正在从 X Layer 读取这个钱包") : t("Reading Atlas from X Layer", "正在从 X Layer 读取 Atlas")} error={error} /></div>;

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
    ? <button className="more-btn m" onClick={() => setMore((m) => m + 20)}>{t(<>Show older decisions <span className="mute">· {Math.min(20, a.decisions.length - n)} of {a.decisions.length - n} more</span></>, <>显示更早的决策 <span className="mute">· 再加载 {Math.min(20, a.decisions.length - n)} 条（还剩 {a.decisions.length - n} 条）</span></>)}</button>
    : a.counts.decisions > a.decisions.length
      ? <p className="more-note m mute">{t(<>The latest {a.decisions.length} of {a.counts.decisions}. Every one is on X Layer: <a href={`${OKLINK}/address/${a.wallet}`} target="_blank" rel="noreferrer">full history on OKLink ↗</a></>, <>最近 {a.decisions.length} 条，共 {a.counts.decisions} 条。每一条都在 X Layer 上：<a href={`${OKLINK}/address/${a.wallet}`} target="_blank" rel="noreferrer">在 OKLink 查看完整历史 ↗</a></>)}</p>
      : null;

  return <Responsive mobile={<WalletMobile a={a} fresh={fresh} />} desktop={
    <div className="page" ref={root}>
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <h1 className="sr">{a.isAtlas ? t("Atlas, the public Fusebox demo wallet", "Atlas，Fusebox 的公开演示钱包") : t(`Fusebox wallet ${short(a.wallet)}`, `Fusebox 钱包 ${short(a.wallet)}`)}</h1>
      {!a.isAtlas && <AcceptOwnership wallet={a.wallet} style={{ marginTop: 32, marginBottom: -16 }} />}
      <section className="w-hero">
        <div className="who" data-b>
          <div className="m">{a.isAtlas ? <><span className="lime">[<Term k="atlas">Atlas</Term>]</span> <span className="mute">{t("a live AI agent's wallet on X Layer · try to trick it into paying a scammer", "X Layer 上一个真实 AI 智能体的钱包 · 试着骗它付钱给骗子")}</span></> : <><span className="lime">{t("[Fusebox wallet]", "[Fusebox 钱包]")}</span> <span className="mute">{t("owner", "所有者")} {short(a.owner)} · {t("agent", "智能体")} {short(a.agent)}</span></>}</div>
          <div className="m addr">{a.wallet}<button onClick={copy} data-cursor={t("Copy", "复制")}>{copied ? t("Copied", "已复制") : t("Copy", "复制")}</button><a href={`${OKLINK}/address/${a.wallet}`} target="_blank" rel="noreferrer" data-cursor="OKLink">↗</a>{a.isAtlas ? <a href={`https://repo.sourcify.dev/196/${a.wallet}`} target="_blank" rel="noreferrer" data-cursor={t("Source", "源码")} style={{ color: "var(--dim)" }}>{t("Verified source ↗", "已验证源码 ↗")}</a> : null}</div>
          <div className="bal"><b><Count value={Number(a.balance)} /></b><span className="m">{t("USD₮0 in the wallet", "USD₮0 钱包余额")}</span></div>
          <div className={`state-line${blown || a.paused ? " bad" : ""}`}>
            <i />{a.paused ? t(<span><b>Paused.</b> The owner froze the wallet; nothing pays until they unfreeze it.</span>, <span><b>已暂停。</b>所有者冻结了钱包；解冻之前不会付出任何款项。</span>)
              : blown ? t(<span><b>{blown.name} blown.</b> Nothing can be paid until the owner resets it.</span>, <span><b>{blown.name} 已熔断。</b>所有者重置之前，任何付款都无法执行。</span>)
              : t(<span><b>{a.fuses.length === 1 ? "Its fuse is holding." : `All ${a.fuses.length} fuses holding.`}</b> A payment reaches the payee only if every <Term k="fuse">fuse</Term> says yes; one no and nothing moves.</span>,
                <span><b>{a.fuses.length === 1 ? "保险丝完好。" : `${a.fuses.length} 个保险丝全部完好。`}</b>只有每个<Term k="fuse">保险丝</Term>都说“是”，付款才会到达收款方；一个“否”，资金就不会移动。</span>)}
          </div>
        </div>
        <div className="acts" data-b>
          {a.isAtlas ? <Link className="btn lime" href="/app/try" data-cursor={t("Try it", "试试")}><span className="roll"><span>{t("Try to scam Atlas", "试着骗 Atlas")}</span><span aria-hidden="true">{t("Try to scam Atlas", "试着骗 Atlas")}</span></span> <span className="k">→</span></Link>
            : <Link className="btn lime" href={`/app/assistant?wallet=${a.wallet}`} data-cursor={t("Chat", "聊天")}><span className="roll"><span>{t("Pay by chatting", "聊天付款")}</span><span aria-hidden="true">{t("Pay by chatting", "聊天付款")}</span></span> <span className="k">→</span></Link>}
          <a className="btn" href={`${OKLINK}/address/${a.wallet}`} target="_blank" rel="noreferrer" data-cursor="OKLink"><span className="roll"><span>{t("Open on OKLink", "在 OKLink 打开")}</span><span aria-hidden="true">{t("Open on OKLink", "在 OKLink 打开")}</span></span> <span className="k">↗</span></a>
          <a className="btn" href={alertsLink(a.wallet)} target="_blank" rel="noreferrer" data-cursor="Telegram" title={t("A Telegram message for every payment this wallet's agent tries", "这个钱包的智能体每尝试一笔付款，就发一条 Telegram 消息")}><span className="roll"><span>{t("Alerts on Telegram", "Telegram 提醒")}</span><span aria-hidden="true">{t("Alerts on Telegram", "Telegram 提醒")}</span></span> <span className="k">↗</span></a>
        </div>
      </section>

      <section className="stats m mute" data-b>
        <div>{t("Spent today", "今日已花费")}<b>{cap ? Number(cap.spentToday).toFixed(2) : "—"}<small>/ {cap?.a ?? "—"}</small></b><div className="meter"><i style={{ transform: `scaleX(${cap ? Math.min(1, Number(cap.spentToday) / cap.a) : 0})` }} /></div></div>
        <div>{t("Decisions", "决策")}<b><Count value={a.counts.decisions} d={0} /></b></div>
        <div>{t("Paid", "已付款")}<b className="lime"><Count value={a.counts.allowed} d={0} /></b></div>
        <div>{t("Stopped", "已拦截")}<b style={{ color: "var(--red)" }}><Count value={a.counts.blocked} d={0} /></b></div>
        <div>{t("Fee balance", "费用余额")}<b><Count value={Number(a.feeBalance)} d={4} /><small>USD₮0</small></b></div>
        <div>{t("Paid to circuit designers", "已付给电路设计者")}<b><Count value={Number(a.paidToDesigners)} d={4} /><small>USD₮0</small></b></div>
      </section>

      <OwnerConsole data={a} />

      <div className="blockhead" data-b><h2 className="disp">{t("The line", "线路")}</h2><span className="m mute">{t(`${a.fuses.length} TapeOut circuits in series · click one to inspect it`, `${a.fuses.length} 个 TapeOut 电路串联 · 点击查看详情`)}</span></div>
      <div className="linepanel" data-b>
        <div className="wire-wrap">
          <LineWire fuses={a.fuses.map((x) => ({ name: x.name, meta: t(`#${x.circuitId} · ${x.gates} gates`, `#${x.circuitId} · ${x.gates} 个门`) })) /* the header says they're TapeOut circuits */} live={live} payee={t("PAYEES", "收款方")} payeeSub={t(`${a.payees.length} saved`, `已保存 ${a.payees.length} 个`)} selected={sel} onSelect={(i) => setSel(sel === i ? null : i)} />
        </div>
        {f && (
          <div className="detail" ref={detailRef} key={f.slot}>
            <div style={{ gridColumn: "span 2" }}>
              <span className="m lime">{t(`Slot ${f.slot + 1} · fuse #${f.fuseId}`, `插槽 ${f.slot + 1} · 保险丝 #${f.fuseId}`)}</span>
              <h3>{f.name}</h3>
              <p style={{ color: "var(--soft)", fontSize: 14, lineHeight: 1.5 }}>
                {f.original === false ? (zh
                  ? `${f.summary ?? "该插槽的另一种竞品设计。"} 设置：${settingsZh(describe(f.socket, f.a, f.b, f.unit, f.paramLabels))}。${f.latched ? "已熔断：所有者重置之前，它会拒绝每一笔付款。" : ""}`
                  : `${f.summary ?? "A rival design for this socket."} Settings: ${describe(f.socket, f.a, f.b, f.unit, f.paramLabels)}.${f.latched ? " Blown: it refuses every payment until the owner resets it." : ""}`) : <>
                {f.key === "daily-cap" && t(`No more than ${f.a} USD₮0 a UTC day. ${Number(f.spentToday).toFixed(2)} spent today.`, `每个 UTC 日不超过 ${f.a} USD₮0。今日已花费 ${Number(f.spentToday).toFixed(2)}。`)}
                {f.key === "payee-guard" && t(`Saved payees only. A new payee gets up to ${f.b} USD₮0 until its ${f.a}-hour cooling-off ends.`, `只付给已保存的收款方。新收款方在 ${f.a} 小时冷静期结束前，最多只能收到 ${f.b} USD₮0。`)}
                {f.key === "breaker" && (f.latched ? t("Blown: it tripped on a stranger and stays blown until the owner resets it.", "已熔断：它因陌生地址而触发，并保持熔断，直到所有者重置。") : t("Trips on a payment to a stranger and stays blown until the owner resets it.", "向陌生地址付款时触发，并保持熔断，直到所有者重置。"))}
                {f.key === "approval-2of3" && t(`Over ${f.a} USD₮0, two of three approvers must sign that exact payment.`, `超过 ${f.a} USD₮0 时，三位审批人中必须有两位签署这笔具体付款。`)}
                </>}
              </p>
            </div>
            <div className="m sch" style={{ gridColumn: "span 2" }}>{layout && <Netlist f={layout} />}<div className="mute" style={{ marginTop: 8 }}>{t(<>Real netlist · {f.gates} gates{f.nState ? ` · ${f.nState} state bit` : ""}</>, <>真实网表 · {f.gates} 个门{f.nState ? ` · ${f.nState} 个状态位` : ""}</>)}</div></div>
            <div className="m kv" style={{ gridColumn: "span 2" }}>
              <span>{t("TapeOut circuit", "TapeOut 电路")}</span><span><a href={`${OKLINK}/address/${f.processor}`} target="_blank" rel="noreferrer">{t(<>#{f.circuitId} on TapeOut&apos;s processor {short(f.processor)} ↗</>, <>TapeOut 处理器 {short(f.processor)} 上的 #{f.circuitId} ↗</>)}</a></span>
              <span>{t("Fee per check", "每次检查费用")}</span><span>{fmt(f.fee)} USD₮0</span>
              <span>{t("Decisions", "决策")}</span><span>{f.decisions}</span>
              <span>{t("Earned (claimable)", "收益（可领取）")}</span><span>{fmt(f.earned)} USD₮0</span>
              <span>{t("Earned (lifetime)", "收益（累计）")}</span><span>{fmt(f.lifetimeEarned)} USD₮0</span>
              <span>{t("Designer", "设计者")}</span><span><a href={`${OKLINK}/address/${f.designer}`} target="_blank" rel="noreferrer">{short(f.designer)} ↗</a></span>
            </div>
          </div>
        )}
      </div>

      <SpendView wallet={a.wallet} refreshKey={a.counts.decisions} />

      <div className="blockhead" data-b><h2 className="disp">{t("Decisions", "决策")}</h2><span className="m mute">{t(`${a.counts.decisions} on-chain · ${a.counts.allowed} paid · ${a.counts.blocked} stopped`, `链上 ${a.counts.decisions} 条 · 已付款 ${a.counts.allowed} · 已拦截 ${a.counts.blocked}`)}</span></div>
      {a.historyLoading && <p className="m mute hist-wait" role="status"><span className="live" />{t("Reading the decision history from X Layer. It fills in on its own.", "正在从 X Layer 读取决策历史，读完会自动补全。")}</p>}
      <div data-b><DecisionTools wallet={a.wallet} rows={a.decisions} fresh={fresh} names={a.fuses.map((x) => x.name)} /></div>
      <div data-b><Scope rows={a.decisions} /></div>
      <div className="dtable" style={{ overflowX: "auto" }} data-b tabIndex={0} role="region" aria-label={t("Decisions table", "决策表")}>
        <table className="tbl decisions">
          <thead><tr><th>#</th><th className="hide-s">{t("Time (UTC)", "时间（UTC）")}</th><th>{t("Result", "结果")}</th><th style={{ textAlign: "right" }}>{t("Amount", "金额")}</th><th>{t("To · what the agent said", "收款方 · 智能体的说明")}</th><th>{t("Fuses", "保险丝")}</th><th className="hide-s" style={{ textAlign: "right" }}>{t("Fees", "费用")}</th><th className="hide-s">{t("Tx", "交易")}</th></tr></thead>
          <tbody>
            {a.decisions.slice(0, tableN).map((r) => (
              <tr key={r.id} className={fresh.has(r.id) ? "new" : ""}>
                <td className="num" style={{ textAlign: "left" }}>{r.id}</td>
                <td className="num hide-s" style={{ textAlign: "left" }}>{new Date(r.time * 1000).toISOString().slice(5, 16).replace("T", " ")}</td>
                <td><span className={`res ${r.allowed ? "ok" : "no"}`}>{r.allowed ? t("Paid", "已付款") : t("Stopped", "已拦截")}</span>{!r.allowed && a.fuses.some((x, i) => x.key === "approval-2of3" && r.status[i] === "blew") ? <Link className="m lime" style={{ display: "block", marginTop: 6, fontSize: 10.5 }} href={`/app/approve?wallet=${a.wallet}&to=${r.to}&amount=${r.amount}`}>{t("Approve ↗", "审批 ↗")}</Link> : null}</td>
                <td className="num">{fmt(r.amount)}</td>
                <td className="memo">“{readableMemo(r.memo, zh)}”<small>{short(r.to)} · {isPayee(r.to) ? t("saved payee", "已保存的收款方") : t("stranger", "陌生地址")}</small></td>
                <td><span className="sq">{r.status.map((s, i) => <i key={i} className={s} title={zh ? `${a.fuses[i]?.name ?? "保险丝"}：${STATUS_ZH[s] ?? s}` : `${a.fuses[i]?.name ?? "fuse"}: ${s}`} />)}</span></td>
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
              <div className="dc-top m"><span className="mute">#{r.id} · {new Date(r.time * 1000).toISOString().slice(5, 16).replace("T", " ")} UTC</span><span className={`res ${r.allowed ? "ok" : "no"}`}>{r.allowed ? t("Paid", "已付款") : t("Stopped", "已拦截")}</span></div>
              <div className="dc-amt"><b>{fmt(r.amount)}</b><span className="m mute">USD₮0 → {short(r.to)} · {isPayee(r.to) ? t("saved payee", "已保存的收款方") : t("stranger", "陌生地址")}</span></div>
              <p className="dc-memo">“{readableMemo(r.memo, zh)}”</p>
              <div className="dc-foot m">
                <span className="sq">{r.status.map((s, i) => <i key={i} className={s} title={zh ? `${a.fuses[i]?.name ?? "保险丝"}：${STATUS_ZH[s] ?? s}` : `${a.fuses[i]?.name ?? "fuse"}: ${s}`} />)}</span>
                <span className="mute">{r.allowed ? t("All fuses held", "所有保险丝通过") : t(`${blew.join(", ")} blew`, `${blew.join(", ")} 熔断`)}</span>
              </div>
              <div className="dc-links m">
                <a href={`${OKLINK}/tx/${r.tx}`} target="_blank" rel="noreferrer">{t("Transaction ↗", "交易 ↗")}</a>
                {needs2of3 && <Link className="lime" href={`/app/approve?wallet=${a.wallet}&to=${r.to}&amount=${r.amount}`}>{t("Approve it →", "去审批 →")}</Link>}
              </div>
            </div>
          );
        })}
        {older(cardN)}
      </div>

      <ChainAlerts wallet={a.wallet} refreshKey={a.counts.blocked} />

      <div className="side2" data-b>
        <div><span className="m mute">{t(<>Saved payees · Payee Guard lets these through after {a.fuses.find((x) => x.key === "payee-guard")?.a ?? 24} h</>, <>已保存的收款方 · {a.fuses.find((x) => x.key === "payee-guard")?.a ?? 24} 小时后 Payee Guard 放行</>)}</span>
          <ul>{a.payees.map((p) => <li key={p.address}>{short(p.address)}<span>{t("since", "自")} {new Date(p.since * 1000).toISOString().slice(0, 16).replace("T", " ")}</span></li>)}</ul></div>
        <div><span className="m mute">{t(<>Approvers · two of three sign anything over {a.fuses.find((x) => x.key === "approval-2of3")?.a ?? 20} USD₮0</>, <>审批人 · 超过 {a.fuses.find((x) => x.key === "approval-2of3")?.a ?? 20} USD₮0 需三人中两人签署</>)}</span>
          <ul>{a.approvers.map((p, i) => <li key={p}>{short(p)}<span>{t(`seat ${i + 1}`, `席位 ${i + 1}`)}</span></li>)}</ul></div>
      </div>
    </div>
  } />;
}
