"use client";
import Link from "next/link";
import { alertsLink } from "@/lib/alerts";
import AcceptOwnership from "../AcceptOwnership";
import { useState } from "react";
import type { Atlas, DecisionRow, FuseSlot } from "@/lib/atlas";
import { LAYERS } from "@/lib/fuses";
import { describe } from "@/lib/sockets";
import { OKLINK, fmt, short } from "@/lib/hooks";
import Netlist from "@/components/landing/Netlist";
import { useWallet } from "../WalletProvider";
import OwnerConsole from "../OwnerConsole";
import SpendView from "../SpendView";
import DecisionTools from "../DecisionTools";
import { Glyph, Plate } from "../Pixel";
import { PageChrome } from "./chrome";
import { MActions, MHero, MLabel, MRow, MSeg, MSheet, MStats, type Action } from "./ui";
import Term from "./Term";
import { feeRunway, readableMemo } from "@/lib/plain";
import { ChainAlertsMobile } from "../ChainAlerts";
import { useLang } from "@/lib/i18n";

const GLOSS: Record<string, string> = { "daily-cap": "A limit on spending per day", "payee-guard": "Known payees only", breaker: "Trips on a stranger", "approval-2of3": "Big payments need 2 signers" };
const GLOSS_ZH: Record<string, string> = { "daily-cap": "每日支出限额", "payee-guard": "只付已知收款方", breaker: "遇陌生地址触发", "approval-2of3": "大额付款需 2 人签名" };
const when = (t: number, zh = false) => {
  const s = Date.now() / 1000 - t;
  if (zh) return s < 3600 ? `${Math.max(1, Math.round(s / 60))} 分钟前` : s < 86400 ? `${Math.round(s / 3600)} 小时前` : new Date(t * 1000).toISOString().slice(5, 10).replace("-", "/");
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t * 1000).toISOString().slice(5, 10).replace("-", "/");
};
const verdict = (s: string, zh = false) => (s === "pass" ? <span className="mtag ok">{zh ? "通过" : "Passed"}</span> : <span className="mtag no">{s === "blew" ? (zh ? "已拦截" : "Stopped") : s === "untrusted" ? (zh ? "未受信" : "Untrusted") : zh ? "失败" : "Failed"}</span>);

/** lib/sockets describe() in Chinese, for rival fuses' settings line. A designer's own labels stay as they wrote them. */
export const settingsZh = (s: string) => s
  .replace(/^No settings$/, "无设置")
  .replace(/^(.+) a UTC day$/, "每个 UTC 日 $1")
  .replace(/^(\d+) h cooling-off · (.+) trial$/, "$1 小时冷静期 · 试付额度 $2")
  .replace(/^Trips on strangers$/, "遇陌生地址即触发")
  .replace(/^Approvals above (.+)$/, "超过 $1 需审批")
  .replace(/^Same payment once per (\d+) h$/, "同一笔付款每 $1 小时只付一次")
  .replace(/ hours\b/g, " 小时");

function fuseText(f: FuseSlot, zh = false) {
  if (zh) {
    if (f.original === false) return `${f.summary ?? "该插槽的另一种竞品设计。"} 设置：${settingsZh(describe(f.socket, f.a, f.b, f.unit, f.paramLabels))}。`;
    if (f.key === "daily-cap") return `每个 UTC 日不超过 ${f.a} USD₮0。今日已花费 ${Number(f.spentToday).toFixed(2)}。`;
    if (f.key === "payee-guard") return `只付给已保存的收款方。新收款方在 ${f.a} 小时冷静期结束前，最多只能收到 ${f.b} USD₮0。`;
    if (f.key === "breaker") return f.latched ? "已熔断：它因陌生地址而触发，并保持熔断，直到所有者重置。" : "向陌生地址付款时触发，并保持熔断，直到所有者重置。";
    if (f.key === "approval-2of3") return `超过 ${f.a} USD₮0 时，三位审批人中必须有两位签署这笔具体付款。`;
    return "";
  }
  if (f.original === false) return `${f.summary ?? "A rival design for this socket."} Settings: ${describe(f.socket, f.a, f.b, f.unit, f.paramLabels)}.`;
  if (f.key === "daily-cap") return `No more than ${f.a} USD₮0 a UTC day. ${Number(f.spentToday).toFixed(2)} spent today.`;
  if (f.key === "payee-guard") return `Saved payees only. A new payee gets up to ${f.b} USD₮0 until its ${f.a}-hour cooling-off ends.`;
  if (f.key === "breaker") return f.latched ? "Blown: it tripped on a stranger and stays blown until the owner resets it." : "Trips on a payment to a stranger and stays blown until the owner resets it.";
  if (f.key === "approval-2of3") return `Over ${f.a} USD₮0, two of three approvers must sign that exact payment.`;
  return "";
}

/** The wallet on a phone: the balance, the few things you do, then Activity / Fuses / Spend / Owner. */
export default function WalletMobile({ a, fresh }: { a: Atlas; fresh: Set<number> }) {
  const { account } = useWallet();
  const { t, zh } = useLang();
  const owner = !!account && account.toLowerCase() === a.owner.toLowerCase();
  const [tab, setTab] = useState<"act" | "fuses" | "spend" | "owner">("act");
  const [dec, setDec] = useState<DecisionRow | null>(null);
  const [fuse, setFuse] = useState<FuseSlot | null>(null);
  const [tools, setTools] = useState(false);
  const [shown, setShown] = useState(12);
  const [copied, setCopied] = useState(false);

  const cap = a.fuses.find((f) => f.key === "daily-cap" && f.original !== false) ?? a.fuses.find((f) => f.key === "daily-cap");
  const blown = a.fuses.find((f) => f.latched);
  const perDecision = a.fuses.reduce((t, f) => t + Number(f.fee), 0);
  const left = perDecision > 0 ? Math.floor(Number(a.feeBalance) / perDecision) : null;
  const isPayee = (addr: string) => a.payees.some((p) => p.address.toLowerCase() === addr.toLowerCase());
  const copy = () => { navigator.clipboard?.writeText(a.wallet); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  const actions: Action[] = a.isAtlas
    ? [{ icon: "rob", label: t("AI reads a scam", "AI 读骗局"), href: "/app/rob" }, { icon: "sim", label: t("Test a line", "测试线路"), href: "/app/simulate" }, { icon: "copy", label: copied ? t("Copied", "已复制") : t("Copy", "复制"), onClick: copy }, { icon: "ext", label: "OKLink", href: `${OKLINK}/address/${a.wallet}`, ext: true }]
    : [{ icon: "rob", label: t("Assistant", "助手"), href: `/app/assistant?wallet=${a.wallet}` }, { icon: "coin", label: t("First payment", "首笔付款"), href: `/app/first?wallet=${a.wallet}` }, { icon: "copy", label: copied ? t("Copied", "已复制") : t("Copy", "复制"), onClick: copy }, { icon: "bell", label: t("Alerts", "提醒"), href: alertsLink(a.wallet), ext: true }];
  const tabs = [["act", t("Activity", "动态")], ["fuses", t("Fuses", "保险丝")], ["spend", t("Spend", "支出")], ...(owner ? [["owner", t("Owner", "所有者")] as const] : [])] as const;

  return (
    <div className="mpage">
      <PageChrome
        title={a.isAtlas ? "Atlas" : t("Wallet", "钱包")}
        sub={a.isAtlas ? t("Live demo wallet", "实时演示钱包") : short(a.wallet)}
        info={zh ? <>
          <p>{a.isAtlas ? "Atlas 是 X Layer 上一个对所有人开放的实时 AI 智能体钱包。它的智能体只能通过线路上的保险丝付款。" : "X Layer 上的一个 Fusebox 钱包。它的智能体只能通过线路上的保险丝付款。"}</p>
          <p>每个保险丝都是在 TapeOut 上流片的电路。只有 {a.fuses.length} 个保险丝全部说“是”，付款才会到达收款方；一个“否”，资金就不会移动。</p>
          <p>钱包 <span className="m">{a.wallet}</span> · 所有者 {short(a.owner)}。{a.isAtlas && <> <a href={`https://repo.sourcify.dev/196/${a.wallet}`} target="_blank" rel="noreferrer">已验证源码 ↗</a></>}</p>
        </> : <>
          <p>{a.isAtlas ? "Atlas is a live AI-agent wallet on X Layer, open to everyone. Its agent can only pay through the fuses on its line." : "A Fusebox wallet on X Layer. Its agent can only pay through the fuses on its line."}</p>
          <p>Every fuse is a circuit taped out on TapeOut. A payment reaches the payee only if all {a.fuses.length} say yes; one no and nothing moves.</p>
          <p>Wallet <span className="m">{a.wallet}</span> · owner {short(a.owner)}.{a.isAtlas && <> <a href={`https://repo.sourcify.dev/196/${a.wallet}`} target="_blank" rel="noreferrer">Verified source ↗</a></>}</p>
        </>}
      />
      {!a.isAtlas && <AcceptOwnership wallet={a.wallet} />}
      <MHero
        label={t("In the wallet", "钱包余额")}
        right={a.paused ? t("Paused", "已暂停") : blown ? t(`${blown.name} blown`, `${blown.name} 已熔断`) : <><i className="kc-live" />{a.fuses.length === 1 ? t("Its fuse is holding", "保险丝完好") : t(`All ${a.fuses.length} fuses holding`, `${a.fuses.length} 个保险丝全部完好`)}</>}
        tone={a.paused || blown ? "bad" : undefined}
        value={Number(a.balance).toFixed(4)} unit={<Term k="usdt0" />}
        foot={<><span>{cap ? t(`Spent today ${Number(cap.spentToday).toFixed(2)} of ${cap.a}`, `今日已花费 ${Number(cap.spentToday).toFixed(2)} / ${cap.a}`) : t(`${a.counts.decisions} payments`, `${a.counts.decisions} 笔付款`)}</span><span>{left !== null ? <Term k="fees">{feeRunway(Number(a.feeBalance), perDecision, zh)}</Term> : ""}</span></>}
      />
      {a.isAtlas && (
        <div className="mcallout">
          <p>{t(<>This is <Term k="atlas">Atlas</Term>, a live AI agent&apos;s wallet on X Layer. Try to trick it into paying a scammer: it&apos;s free, and nothing moves.</>, <>这是 <Term k="atlas">Atlas</Term>，X Layer 上一个真实 AI 智能体的钱包。试着骗它付钱给骗子：免费，资金也不会移动。</>)}</p>
          <Link className="btn lime" href="/app/try">{t("Try to scam Atlas", "试着骗 Atlas")} <span className="k">→</span></Link>
        </div>
      )}
      {(a.paused || blown) && <p className="mnote">{a.paused ? t("The owner froze this wallet; nothing pays until they unfreeze it.", "所有者冻结了这个钱包；解冻之前不会付出任何款项。") : t(`${blown!.name} is blown. Nothing can be paid until the owner resets it.`, `${blown!.name} 已熔断。所有者重置之前，任何付款都无法执行。`)}</p>}
      <MActions items={actions} />
      <MSeg label={t("Wallet views", "钱包视图")} items={tabs} value={tab} onChange={setTab} />

      {tab === "act" && <>
        <MStats items={[[t("Payments", "付款"), a.counts.decisions], [t("Paid", "已付款"), <span key="p" className="lime">{a.counts.allowed}</span>], [t("Stopped", "已拦截"), <span key="s" style={{ color: "var(--red)" }}>{a.counts.blocked}</span>]]} />
        {a.historyLoading && <p className="m mute" role="status"><span className="live" />{t("Reading the history from X Layer…", "正在从 X Layer 读取历史…")}</p>}
        <div className="mrows">
          {a.decisions.slice(0, shown).map((r) => {
            const blew = a.fuses.filter((_, i) => r.status[i] !== "pass").map((f) => f.name);
            return (
              <MRow key={r.id} className={fresh.has(r.id) ? "new" : ""} onClick={() => setDec(r)}
                icon={<Glyph name={r.allowed ? "approve" : "stop"} size={16} color={r.allowed ? "var(--lime)" : "var(--red)"} />}
                title={readableMemo(r.memo, zh) || t("No note", "无备注")}
                sub={zh
                  ? `#${r.id} · ${r.allowed ? (isPayee(r.to) ? "付给已保存的收款方" : "已付款") : blew.length ? `被 ${blew[0]} 拦截` : "已拦截"} · ${when(r.time, zh)}`
                  : `#${r.id} · ${r.allowed ? (isPayee(r.to) ? "to a saved payee" : "paid") : blew.length ? `stopped by ${blew[0]}` : "stopped"} · ${when(r.time)}`}
                value={Number(r.amount).toFixed(2)}
                valueSub={<span className={`mtag ${r.allowed ? "ok" : "no"}`}>{r.allowed ? t("Paid", "已付款") : t("Stopped", "已拦截")}</span>} chev={false} />
            );
          })}
        </div>
        {shown < a.decisions.length && <button className="btn" style={{ justifyContent: "center" }} onClick={() => setShown((n) => n + 20)}>{t(<>Show older · {a.decisions.length - shown} more</>, <>显示更早 · 还有 {a.decisions.length - shown} 条</>)}</button>}
        {!a.decisions.length && !a.historyLoading && <p className="mnote">{t("No payments yet. Every payment the agent tries lands here, paid or stopped.", "还没有付款。智能体尝试的每一笔付款都会出现在这里，无论已付款还是被拦截。")}</p>}
        <MRow icon={<Glyph name="docs" size={16} />} title={t("Export, feed and badge", "导出、订阅源和徽章")} sub={t("CSV · JSON feed · status badge", "CSV · JSON 订阅源 · 状态徽章")} onClick={() => setTools(true)} />
        <ChainAlertsMobile wallet={a.wallet} refreshKey={a.counts.blocked} />
      </>}

      {tab === "fuses" && <>
        <MLabel right={t(`${a.fuses.length} in a row`, `${a.fuses.length} 个串联`)}>{t(<>Every payment must pass all of these <Term k="fuse">fuses</Term></>, <>每笔付款都必须通过以下所有<Term k="fuse">保险丝</Term></>)}</MLabel>
        <div className="mrows">
          {a.fuses.map((f) => (
            <MRow key={f.slot} onClick={() => setFuse(f)} icon={<Glyph name={f.key === "daily-cap" ? "mine" : f.key === "payee-guard" ? "approve" : f.key === "breaker" ? "stop" : "x402"} size={16} color={f.latched ? "var(--red)" : "var(--lime)"} />}
              title={f.name} sub={((zh ? GLOSS_ZH : GLOSS)[f.key] ?? `TapeOut #${f.circuitId}`)} value={fmt(f.fee, 4)} valueSub={f.latched ? <span className="mtag no">{t("Blown", "已熔断")}</span> : <span className="mtag ok">{t("On", "启用")}</span>} chev={false} />
          ))}
        </div>
        <MLabel right={a.payees.length}>{t("Saved payees", "已保存的收款方")}</MLabel>
        <div className="mrows">
          {a.payees.length ? a.payees.map((p) => <MRow key={p.address} icon={<Plate address={p.address} size={22} />} title={short(p.address)} sub={t(`since ${new Date(p.since * 1000).toISOString().slice(0, 10)}`, `自 ${new Date(p.since * 1000).toISOString().slice(0, 10)}`)} href={`${OKLINK}/address/${p.address}`} ext />)
            : <p className="mnote" style={{ padding: "12px 0" }}>{t("None yet. Payee Guard lets saved payees through.", "暂无。Payee Guard 会放行已保存的收款方。")}</p>}
        </div>
        <MLabel right={t("2 of 3 sign", "3 人中 2 人签")}>{t("Approvers", "审批人")}</MLabel>
        <div className="mrows">
          {a.approvers.filter((p) => !/^0x0{40}$/i.test(p)).map((p, i) => <MRow key={p} icon={<Plate address={p} size={22} />} title={short(p)} sub={t(`Seat ${i + 1}`, `席位 ${i + 1}`)} href={`${OKLINK}/address/${p}`} ext />)}
        </div>
      </>}

      {tab === "spend" && <SpendView wallet={a.wallet} refreshKey={a.counts.decisions} />}
      {tab === "owner" && owner && <OwnerConsole data={a} />}

      <MSheet open={!!dec} onClose={() => setDec(null)} title={dec ? t(`Payment #${dec.id}`, `付款 #${dec.id}`) : ""}>
        {dec && <>
          <MHero label={dec.allowed ? t("Paid", "已付款") : t("Stopped", "已拦截")} right={when(dec.time, zh)} value={Number(dec.amount).toFixed(4)} unit="USD₮0" tone={dec.allowed ? undefined : "bad"}
            foot={<span>{t("To", "付给")} {short(dec.to)} · {isPayee(dec.to) ? t("saved payee", "已保存的收款方") : t("stranger", "陌生地址")}</span>} />
          <p className="mcap">“{readableMemo(dec.memo, zh)}”</p>
          <p className="mnote">{t(`Each fuse checked this payment on X Layer. ${dec.allowed ? "All said yes, so it was paid." : "One no is enough: nothing moved."}`, `每个保险丝都在 X Layer 上检查了这笔付款。${dec.allowed ? "全部说“是”，所以已付款。" : "一个“否”就够了：资金没有移动。"}`)}</p>
          <div className="mrows">{a.fuses.map((f, i) => <MRow key={f.slot} title={f.name} sub={`TapeOut #${f.circuitId}`} value={verdict(dec.status[i], zh)} chev={false} />)}</div>
          <div className="mkv">
            <span>{t("Time", "时间")}</span><span>{new Date(dec.time * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
            <span>{t("Block", "区块")}</span><span>{dec.block.toLocaleString("en-US")}</span>
            <span>{t("Fees", "费用")}</span><span>{fmt(dec.fee)} USD₮0</span>
            <span>{t("Payee", "收款方")}</span><span><a href={`${OKLINK}/address/${dec.to}`} target="_blank" rel="noreferrer">{short(dec.to)} ↗</a></span>
          </div>
          <div className="mbtns">
            <a className="btn" href={`${OKLINK}/tx/${dec.tx}`} target="_blank" rel="noreferrer">{t("Transaction ↗", "交易 ↗")}</a>
            {!dec.allowed && a.fuses.some((x, i) => x.key === "approval-2of3" && dec.status[i] === "blew")
              ? <Link className="btn lime" href={`/app/approve?wallet=${a.wallet}&to=${dec.to}&amount=${dec.amount}`}>{t("Approve it →", "去审批 →")}</Link>
              : <Link className="btn" href={`/app/simulate`}>{t("Test a line →", "测试线路 →")}</Link>}
          </div>
        </>}
      </MSheet>

      <MSheet open={!!fuse} onClose={() => setFuse(null)} title={fuse?.name}>
        {fuse && (() => { const layout = fuse.original ? LAYERS.find((l) => l.key === fuse.key) : null; return <>
          <p className="mcap">{fuseText(fuse, zh)}</p>
          {layout && <div className="mcard" style={{ padding: 12 }}><Netlist f={layout} /><div className="m mute" style={{ marginTop: 8 }}>{t(<>Real netlist · {fuse.gates} gates{fuse.nState ? ` · ${fuse.nState} state bit` : ""}</>, <>真实网表 · {fuse.gates} 个门{fuse.nState ? ` · ${fuse.nState} 个状态位` : ""}</>)}</div></div>}
          <div className="mkv">
            <span>{t("TapeOut circuit", "TapeOut 电路")}</span><span><a href={`${OKLINK}/address/${fuse.processor}`} target="_blank" rel="noreferrer">#{fuse.circuitId} ↗</a></span>
            <span>{t("Fee per check", "每次检查费用")}</span><span>{fmt(fuse.fee)} USD₮0</span>
            <span>{t("Decisions", "决策")}</span><span>{fuse.decisions}</span>
            <span>{t("Earned", "收益")}</span><span>{fmt(fuse.lifetimeEarned)} USD₮0</span>
            <span>{t("Designer", "设计者")}</span><span><a href={`${OKLINK}/address/${fuse.designer}`} target="_blank" rel="noreferrer">{short(fuse.designer)} ↗</a></span>
          </div>
          <Link className="btn" style={{ justifyContent: "center" }} href={`/app/fuse/${fuse.fuseId}`}>{t("Open in the market →", "在市场中打开 →")}</Link>
        </>; })()}
      </MSheet>

      <MSheet open={tools} onClose={() => setTools(false)} title={t("Export and share", "导出与分享")}>
        <DecisionTools wallet={a.wallet} rows={a.decisions} fresh={fresh} names={a.fuses.map((x) => x.name)} />
      </MSheet>
    </div>
  );
}
