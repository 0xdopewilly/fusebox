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
import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";

/** `en`/`zh`: a preset's memo in both languages, so an untouched memo follows the visitor's language. */
type Row = SimPayment & { key: number; en?: string; zh?: string };
let k = 0;
const row = (memo: string | [string, string], to: Payee, amount: string, seats: [boolean, boolean, boolean] = [false, false, false]): Row =>
  typeof memo === "string" ? { key: ++k, memo, to, amount, seats } : { key: ++k, memo: memo[0], en: memo[0], zh: memo[1], to, amount, seats };
const inLang = (rs: Row[], zh: boolean) => rs.map((r) => (r.en && r.zh ? { ...r, memo: zh ? r.zh : r.en } : r));
const PRESETS: Record<string, { label: string; labelZh: string; rows: () => Row[] }> = {
  scam: { label: "A scam morning", labelZh: "诈骗的早晨", rows: () => [
    row(["Invoice INV-7790, Kano Cotton", "发票 INV-7790，Kano Cotton"], "saved", "0.5"),
    row(["We moved banks: pay INV-7791 to our new account", "我们换了银行：请把 INV-7791 付到新账户"], "stranger", "2.5"),
    row(["Invoice INV-7792, revised total for the Q4 order", "发票 INV-7792，Q4 订单的修订总额"], "saved", "60"),
    row(["URGENT from the CEO: wire this before 5pm", "CEO 紧急指示：下午 5 点前转账"], "stranger", "25"),
    row(["Invoice INV-7790 again: the supplier's system sent it twice", "又是发票 INV-7790：供应商的系统发了两次"], "saved", "0.5"),
    row(["Q4 bulk order, signed off by finance and ops", "Q4 批量订单，财务和运营已签字"], "saved", "30", [true, true, false]),
  ] },
  normal: { label: "A normal day", labelZh: "平常的一天", rows: () => [
    row(["Invoice INV-8001, Kano Cotton", "发票 INV-8001，Kano Cotton"], "saved", "4"),
    row(["Courier, same-day delivery", "快递，当日送达"], "saved", "1.5"),
    row(["First order from a new supplier", "向新供应商下的第一笔订单"], "new", "1.5"),
    row(["Same supplier, full invoice", "同一供应商，完整发票"], "new", "12"),
    row(["Monthly tooling licence", "每月工具授权费"], "saved", "18"),
    row(["Quarterly stock order, two approvals", "季度备货订单，两人审批"], "saved", "40", [true, false, true]),
  ] },
  twice: { label: "Sent twice", labelZh: "重复发送", rows: () => [
    row(["Invoice INV-8101, Kano Cotton", "发票 INV-8101，Kano Cotton"], "saved", "3"),
    row(["Courier, same-day delivery", "快递，当日送达"], "saved", "1.5"),
    row(["Invoice INV-8101 (the email came in twice)", "发票 INV-8101（邮件来了两次）"], "saved", "3"),
    row(["Courier again: the agent retried after a timeout", "又是快递：智能体超时后重试了"], "saved", "1.5"),
    row(["Invoice INV-8102, Kano Cotton", "发票 INV-8102，Kano Cotton"], "saved", "3.5"),
  ] },
};
const TO: Record<Payee, string> = { saved: "Saved payee", new: "Saved today", stranger: "Stranger" };
const TO_ZH: Record<Payee, string> = { saved: "已保存的收款方", new: "今天保存的", stranger: "陌生地址" };
/** The install form's setting labels (lib/sockets, Fuse Studio's `uses`) in Chinese; a designer's own label stays as written. */
const FIELD_ZH: Record<string, string> = {
  "Cap per UTC day": "每个 UTC 日上限", "Cooling-off": "冷静期", "Trial amount": "试付额度", "Approvals above": "超过此额需审批", "Window": "窗口",
  "Largest single payment": "单笔上限", "Cap (one payment ≤ half)": "上限（单笔 ≤ 一半）",
};
const SUFFIX_ZH: Record<string, string> = { hours: "小时" };
const VERDICT_ZH: Record<string, string> = { pass: "通过", blew: "熔断", error: "出错" };
const okAmt = (s: string) => /^\d+(\.\d{1,6})?$/.test(s.trim());

/** Pick fuses and settings, line up payments, and run them through TapeOut's real circuits on X Layer. */
export default function SimulateView() {
  const { data: market, error } = useMarket();
  const { t: tr, zh } = useLang();
  // a Fuse Studio draft (?draft=…) joins the list as fuse -1, evaluated in the browser from its own TAP-02 bytes
  const [draft, setDraft] = useState<{ fuse: MarketFuse; circuit: ReturnType<typeof load>; code: string } | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("draft"); if (!code) return;
    const d = decodeDraft(code); if (!d) return;
    const c = compile(d.rule);
    const name = `Draft · ${d.name || "untitled"}`;
    setDraft({ code, circuit: load(c.net.bytes, c.nIn, 1), fuse: { fuseId: -1, key: "draft", name, processor: "0x0000000000000000000000000000000000000000", circuitId: 0, designer: "0x0000000000000000000000000000000000000000", socket: d.rule.socket, gates: c.net.gates, nState: c.nState, fee: "0", listed: true, decisions: 0, earned: "0", lifetimeEarned: "0", metadataURI: "", onAtlas: false, netlistHash: c.net.keccak as `0x${string}`, nIn: c.nIn, listedAt: 0, original: false, claims: [], meta: { name, params: paramLabels(d.rule) } } });
  }, []);
  const listed = useMemo(() => [...(draft ? [draft.fuse] : []), ...(market?.fuses ?? []).filter((f) => f.listed).sort((a, b) => a.fuseId - b.fuseId)], [market, draft]);
  const [sel, setSel] = useState<Record<number, { on: boolean; v: Record<string, string> }>>({});
  const [rows, setRows] = useState<Row[]>(PRESETS.scam.rows);
  // untouched preset memos follow the language
  useEffect(() => { setRows((rs) => rs.map((r) => (r.en && r.zh && r.memo === (zh ? r.en : r.zh) ? { ...r, memo: zh ? r.zh : r.en } : r))); }, [zh]);
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

  // display only: fuse names stay English, a Studio draft's "Draft · " prefix and setting labels follow the language
  const nm = (name: string) => (zh ? name.replace(/^Draft · untitled$/, "草稿 · 未命名").replace(/^Draft · /, "草稿 · ") : name);
  const lbl = (label: string) => (zh ? FIELD_ZH[label] ?? label : label);
  const suf = (suffix: string) => (zh ? SUFFIX_ZH[suffix] ?? suffix : suffix);
  const line = listed.filter((f) => sel[f.fuseId]?.on);
  const problems: string[] = [];
  const simFuses: SimFuse[] = line.map((f) => {
    const fields = fieldsFor(f.socket, f.original ? undefined : f.meta?.params);
    const v: { a: number; b: number } = { a: 0, b: 0 };
    for (const x of fields) {
      const raw = sel[f.fuseId].v[x.k] ?? "", r = readField(x, raw);
      if ("error" in r) problems.push(zh ? `${nm(f.meta?.name ?? f.name)}：${lbl(x.label)}：${/^\d+$/.test(raw.trim()) ? `最多 ${x.max} ${suf(x.suffix)}` : `须为整数（${suf(x.suffix)}）`}` : `${f.meta?.name ?? f.name}: ${r.error}`); else v[x.k] = r.n;
    }
    return { fuseId: f.fuseId, name: f.meta?.name ?? f.name, socket: f.socket, processor: f.processor, circuitId: f.circuitId, nState: f.nState, ...v, local: f.fuseId === -1 ? draft?.circuit : undefined };
  });
  if (!line.length) problems.push(tr("Splice in at least one fuse", "至少接入一个保险丝"));
  if (!rows.length) problems.push(tr("Add a payment", "添加一笔付款"));
  rows.forEach((r, i) => { if (!okAmt(r.amount)) problems.push(tr(`Payment ${i + 1}: an amount in USD₮0`, `付款 ${i + 1}：请填写 USD₮0 金额`)); });
  if (!okAmt(spent)) problems.push(tr("Spent today: an amount in USD₮0", "今日已花费：请填写 USD₮0 金额"));
  if (!/^\d+$/.test(hours.trim())) problems.push(tr("Hours since today's payee was saved: a whole number", "今天的收款方保存了几小时：须为整数"));

  const run = async () => {
    setBusy(true); setErr(null); setRes(rows.map(() => null));
    const snapshot = { fuses: simFuses, rows: rows.map((r) => ({ ...r })), block: 0n };
    try {
      snapshot.block = await pub.getBlockNumber();
      setRan(snapshot);
      setTimeout(() => out.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }), 60);
      await runLine(snapshot.fuses, snapshot.rows, { spentToday: spent, newPayeeHours: Number(hours) }, (i, s) => setRes((prev) => { const n = [...prev]; n[i] = s; return n; }));
    } catch (e) { setErr((e as Error).message?.slice(0, 140) || tr("X Layer didn't answer", "X Layer 没有响应")); }
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
  if (!market) return <div className="page">{grid}<Loading label={tr("Reading the fuse registry", "正在读取保险丝注册表")} error={error} /></div>;
  const done = res.filter(Boolean) as SimStep[];
  const stopped = done.filter((s) => !s.allowed).length;
  const calls = rows.length * line.length + rows.length * line.filter((f) => f.nState > 0).length;

  return (
    <div className="page">
      {grid}
      <PageChrome title={tr("Line simulator", "线路模拟器")} sub={tr("Real eval() on X Layer · free", "X Layer 上真实的 eval() · 免费")} info={tr(
        <p>Pick fuses and their limits, line up the payments an agent might be asked to make, and run them through TapeOut&apos;s circuits. Every verdict is a real eval call on X Layer: free, no wallet, and nothing moves.</p>,
        <p>选好保险丝和它们的限额，排好智能体可能被要求支付的付款，然后让它们逐一经过 TapeOut 的电路。每个结论都来自 X Layer 上一次真实的 eval 调用：免费、无需钱包，资金不会移动。</p>,
      )} />
      <section className="try-head m-hide">
        <h1 className="disp" data-a>{tr(<>Test a <span className="lime">[line]</span>.</>, <>测试一条 <span className="lime">[线路]</span>。</>)}</h1>
        <p data-a>{tr(
          <>Pick fuses and their limits, line up the payments an agent might be asked to make, and run them through TapeOut&apos;s circuits. Every verdict is a real <span className="m lime">eval</span> call on X Layer: free, no wallet, and nothing moves.</>,
          <>选好保险丝和它们的限额，排好智能体可能被要求支付的付款，然后让它们逐一经过 TapeOut 的电路。每个结论都来自 X Layer 上一次真实的 <span className="m lime">eval</span> 调用：免费、无需钱包，资金不会移动。</>,
        )}</p>
      </section>
      <h2 className="sr">{tr("Set up the test", "设置测试")}</h2>
      <section className="sim" data-a>
        <div className="sim-col">
          <div className="sim-h m"><span className="lime">01</span> {zh ? `线路 · ${line.length} 个保险丝` : <>The line · {line.length} fuse{line.length === 1 ? "" : "s"}</>}</div>
          {Object.entries(listed.reduce<Record<number, typeof listed>>((g, f) => { (g[f.socket] ??= []).push(f); return g; }, {})).map(([sock, fs]) => (
            <div key={sock} className="sim-sock">
              <div className="m mute sim-sock-h">{zh ? `${SOCKETS[Number(sock)]?.name ?? `插槽 ${sock}`} 插槽` : <>{SOCKETS[Number(sock)]?.name ?? `Socket ${sock}`} socket</>}</div>
              {fs.map((f) => {
                const s = sel[f.fuseId]; const on = !!s?.on;
                const fields = fieldsFor(f.socket, f.original ? undefined : f.meta?.params);
                return (
                  <div key={f.fuseId} className={`sim-fuse${on ? " on" : ""}`}>
                    <label className="sim-fuse-top">
                      <input type="checkbox" checked={on} onChange={() => setSel({ ...sel, [f.fuseId]: { ...s, on: !on } })} aria-label={tr(`Splice in ${f.meta?.name ?? f.name}`, `接入 ${nm(f.meta?.name ?? f.name)}`)} />
                      <span className="sim-box" aria-hidden="true" />
                      <b>{nm(f.meta?.name ?? f.name)}</b>
                      <span className="m mute">{zh ? `#${f.fuseId} · ${f.gates} 个门${f.nState ? ` · ${f.nState} 个锁存器` : ""}` : <>#{f.fuseId} · {f.gates} gates{f.nState ? ` · ${f.nState} latch` : ""}</>}</span>
                    </label>
                    {on && fields.length > 0 && (
                      <div className="sim-fields">
                        {fields.map((x) => <label key={x.k} className="m"><span>{lbl(x.label)} ({suf(x.suffix)})</span><input aria-label={`${nm(f.meta?.name ?? f.name)}: ${lbl(x.label)}`} value={s.v[x.k] ?? ""} onChange={(e) => setSel({ ...sel, [f.fuseId]: { ...s, v: { ...s.v, [x.k]: e.target.value } } })} inputMode="numeric" /></label>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="sim-ctx">
            <label className="m"><span>{tr("Already spent today (USD₮0)", "今日已花费（USD₮0）")}</span><input aria-label={tr("Already spent today in USD₮0", "今日已花费，单位 USD₮0")} value={spent} onChange={(e) => setSpent(e.target.value)} inputMode="decimal" /></label>
            <label className="m"><span>{tr(<>Today&apos;s new payee, saved (hours ago)</>, <>今天的新收款方，保存于（几小时前）</>)}</span><input aria-label={tr("Hours since today's new payee was saved", "今天的新收款方已保存的小时数")} value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" /></label>
          </div>
        </div>

        <div className="sim-col">
          <div className="sim-h m"><span className="lime">02</span> {tr("The payments · in order", "付款 · 按顺序")}
            <span className="sim-presets">{Object.entries(PRESETS).map(([id, p]) => <button key={id} className="dt-btn" onClick={() => { setRows(inLang(p.rows(), zh)); setRes([]); setRan(null); }}>{zh ? p.labelZh : p.label}</button>)}</span>
          </div>
          <ol className="sim-pays">
            {rows.map((r, i) => (
              <li key={r.key}>
                <span className="m mute sim-n">{String(i + 1).padStart(2, "0")}</span>
                <div className="sim-pay">
                  <input aria-label={tr(`Payment ${i + 1}: what the agent was told`, `付款 ${i + 1}：智能体收到的话`)} value={r.memo} onChange={(e) => upd(i, { memo: e.target.value })} placeholder={tr("What the agent was told", "智能体收到的话")} />
                  <div className="sim-pay-row">
                    <select aria-label={tr(`Payment ${i + 1}: who it goes to`, `付款 ${i + 1}：付给谁`)} value={r.to} onChange={(e) => upd(i, { to: e.target.value as Payee })}>{(Object.keys(TO) as Payee[]).map((t) => <option key={t} value={t}>{(zh ? TO_ZH : TO)[t]}</option>)}</select>
                    <label className="sim-amt"><input aria-label={tr(`Payment ${i + 1}: amount in USD₮0`, `付款 ${i + 1}：金额，单位 USD₮0`)} value={r.amount} onChange={(e) => upd(i, { amount: e.target.value })} inputMode="decimal" /><span className="m mute">USD₮0</span></label>
                    <span className="sim-seats m" role="group" aria-label={tr(`Payment ${i + 1}: approvals`, `付款 ${i + 1}：审批`)}>
                      {r.seats.map((on, s) => <button key={s} className={on ? "on" : ""} aria-pressed={on} title={tr(`Approver seat ${s + 1} signed`, `审批人席位 ${s + 1} 已签名`)} onClick={() => upd(i, { seats: r.seats.map((x, j) => (j === s ? !x : x)) as [boolean, boolean, boolean] })}>S{s + 1}</button>)}
                    </span>
                    <button className="sim-x" aria-label={tr(`Remove payment ${i + 1}`, `删除付款 ${i + 1}`)} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <button className="dt-btn sim-add" onClick={() => setRows([...rows, row("", "saved", "1")])} disabled={rows.length >= 12}>{tr("+ Add a payment", "+ 添加付款")}</button>
        </div>
      </section>

      <div className="sim-go" data-a>
        <button className="btn lime" disabled={busy || problems.length > 0} onClick={run}><span>{busy ? tr("Running on X Layer…", "正在 X Layer 上运行…") : tr("Run it on X Layer", "在 X Layer 上运行")}</span> <span className="k">→</span></button>
        <span className="m mute">{problems[0] ?? tr(`${rows.length} payment${rows.length === 1 ? "" : "s"} × ${line.length} fuse${line.length === 1 ? "" : "s"} · ${calls} circuit calls on TapeOut's processor`, `${rows.length} 笔付款 × ${line.length} 个保险丝 · 在 TapeOut 处理器上调用 ${calls} 次电路`)}</span>
      </div>

      {ran && (
        <section className="sim-out" ref={out} aria-live="polite">
          <div className="blockhead"><h2 className="disp">{tr("The verdicts", "结论")}</h2><span className="m mute">{zh
            ? `${done.length < ran.rows.length ? `正在判定第 ${done.length + 1} / ${ran.rows.length} 笔…` : `${ran.rows.length - stopped} 笔已付 · ${stopped} 笔已拦截`} · X Layer 区块 ${ran.block.toString()}`
            : <>{done.length < ran.rows.length ? `deciding ${done.length + 1} of ${ran.rows.length}…` : `${ran.rows.length - stopped} paid · ${stopped} stopped`} · X Layer block {ran.block.toString()}</>}</span></div>
          {err && <p className="m red">{zh ? errZh(err) : err}</p>}
          <div className="sim-table" role="table" aria-label={tr("Verdicts", "结论")}>
            <div className="sim-tr sim-th m" role="row" style={{ gridTemplateColumns: `minmax(0, 2.4fr) repeat(${ran.fuses.length}, minmax(64px, 1fr)) 110px` }}>
              <span role="columnheader">{tr("Payment", "付款")}</span>{ran.fuses.map((f) => <span key={f.fuseId} role="columnheader" title={nm(f.name)}>{nm(f.name)}</span>)}<span role="columnheader">{tr("Verdict", "结论")}</span>
            </div>
            {ran.rows.map((r, i) => {
              const s = res[i];
              return (
                <div key={r.key} className={`sim-tr${s ? (s.allowed ? " ok" : " no") : ""}`} role="row" data-simrow={i} style={{ gridTemplateColumns: `minmax(0, 2.4fr) repeat(${ran.fuses.length}, minmax(64px, 1fr)) 110px` }}>
                  <span role="cell" className="sim-what"><b>{r.amount} USD₮0</b> → {zh ? TO_ZH[r.to] : TO[r.to].toLowerCase()}{r.seats.some(Boolean) ? `${tr(" · signed ", " · 已签名 ")}${r.seats.map((x, j) => (x ? `S${j + 1}` : "")).filter(Boolean).join("+")}` : ""}<small>“{r.memo || tr("no memo", "无备注")}”</small></span>
                  {ran.fuses.map((f, j) => (
                    <span key={f.fuseId} role="cell" className="sim-c" data-name={nm(f.name)}>
                      {s ? <i className={`sim-cell ${s.verdicts[j]}`} title={zh ? `${nm(f.name)}：${VERDICT_ZH[s.verdicts[j]] ?? s.verdicts[j]}${s.latchedAfter[j] ? " · 从这里起熔断" : ""}` : `${f.name}: ${s.verdicts[j]}${s.latchedAfter[j] ? " · blown from here" : ""}`}>{s.verdicts[j] === "pass" ? "✓" : s.verdicts[j] === "blew" ? "✕" : "?"}</i> : <i className="sim-cell wait" />}
                      {s?.latchedAfter[j] && f.nState > 0 ? <em className="m red">{tr("blown", "已熔断")}</em> : null}
                    </span>
                  ))}
                  <span role="cell" className={`m sim-v ${s ? (s.allowed ? "lime" : "red") : "mute"}`}>{s ? (s.allowed ? tr("Paid", "已付") : tr("Stopped", "拦截")) : "…"}</span>
                </div>
              );
            })}
          </div>
          {done.length === ran.rows.length && (() => {
            const fee = ran.fuses.reduce((t, f) => t + Number(market.fuses.find((x) => x.fuseId === f.fuseId)?.fee ?? 0), 0).toFixed(4);
            const next = ran.fuses.some((f) => f.fuseId === -1)
              ? <Link className="lime" href={`/app/studio?draft=${draft?.code ?? ""}`}>{tr("Back to the Studio to tape it out →", "回到 Studio 去流片 →")}</Link>
              : <Link className="lime" href={`/app/new?f=${ran.fuses.map((f) => [f.fuseId, f.a, f.b].join(":")).join(",")}`}>{tr("Wire up a wallet with this line →", "用这条线路搭建一个钱包 →")}</Link>;
            return zh ? (
              <p className="sim-sum">
                {stopped === 0 ? "每笔付款都通过了：这条线路在这里什么都没拦住。" : `${ran.rows.length} 笔中有 ${stopped} 笔在资金移动前被拦截。`}{" "}
                在真实钱包上，每次检查都要付保险丝的费用（这条线路每次决策 {fee} USD₮0）。{" "}
                {next}
              </p>
            ) : (
              <p className="sim-sum">
                {stopped === 0 ? "Every payment went through: this line didn't stop anything here." : `${stopped} of ${ran.rows.length} stopped before a cent moved.`}{" "}
                Each check costs the fuse&apos;s fee on a real wallet ({fee} USD₮0 a decision for this line).{" "}
                {next}
              </p>
            );
          })()}
        </section>
      )}
    </div>
  );
}
