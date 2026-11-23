"use client";
import Link from "next/link";
import { useState } from "react";
import type { Proposal } from "@/lib/guardrails";
import { useLang } from "@/lib/i18n";

const EXAMPLES = [
  "It pays our three cotton suppliers. Never more than 80 a day, and anything over 30 needs me and my partner to sign off. New vendors wait 2 days before real money.",
  "It handles refunds for customers, so it pays new people all the time. Keep it under 150 a day and get approval for anything above 25.",
  "A new experimental agent. Tiny budget, a few dollars a day, and it should only ever pay addresses I've saved.",
];
const EXAMPLES_ZH = [
  "它给我们的三家棉花供应商付款。每天绝不超过 80，超过 30 的付款需要我和合伙人一起批准。新供应商要等 2 天才能收到真金白银。",
  "它负责给客户退款，所以经常付款给新的人。每天控制在 150 以内，超过 25 的付款需要审批。",
  "一个新的实验性智能体。预算很小，每天几美元，而且只能付款给我保存过的地址。",
];
const CHIPS = ["Supplier agent", "Refund desk", "Tiny budget"], CHIPS_ZH = ["供应商智能体", "退款台", "小额预算"];
const TO_ZH: Record<string, string> = { saved: "已保存的", new: "新", stranger: "陌生" };
/** The /api/guardrails error lines, in Chinese at display time. */
const API_ERR_ZH: Record<string, string> = {
  "Tell it a little more: what the agent pays for, roughly how much, and who should sign off big payments.": "请再多说一点：智能体为什么付款、大概多少，以及大额付款由谁批准。",
  "Keep it under 1,500 characters.": "请控制在 1,500 个字符以内。",
  "A few proposals a minute is plenty. Try again shortly.": "每分钟几次方案就够了，请稍后再试。",
};
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
  const { t, zh } = useLang();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [p, setP] = useState<(Proposal & { fellBack?: boolean }) | null>(null);
  const [applied, setApplied] = useState(false);
  const go = async () => {
    setBusy(true); setErr(null); setApplied(false);
    try {
      const r = await fetch("/api/guardrails", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: text }) });
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? t("Couldn't propose a line.", "无法给出线路方案。")); else setP(j);
    } catch { setErr(t("Couldn't reach the server. Try again.", "无法连接服务器，请重试。")); } finally { setBusy(false); }
  };
  const rows: [string, boolean, string, string][] = p ? [
    ["Daily Cap", p.line.dailyCap.on, p.line.dailyCap.on ? t(`${p.line.dailyCap.cap} USD₮0 a day`, `每天 ${p.line.dailyCap.cap} USD₮0`) : t("off", "关闭"), p.reasons.dailyCap],
    ["Payee Guard", p.line.payeeGuard.on, p.line.payeeGuard.on ? t(`${p.line.payeeGuard.coolingHours} h cooling-off · ${p.line.payeeGuard.trial} USD₮0 trial`, `${p.line.payeeGuard.coolingHours} 小时冷静期 · 试付额度 ${p.line.payeeGuard.trial} USD₮0`) : t("off", "关闭"), p.reasons.payeeGuard],
    ["Breaker", p.line.breaker.on, p.line.breaker.on ? t("on", "开启") : t("off", "关闭"), p.reasons.breaker],
    ["Two of Three", p.line.twoOfThree.on, p.line.twoOfThree.on ? t(`approvals above ${p.line.twoOfThree.threshold} USD₮0`, `超过 ${p.line.twoOfThree.threshold} USD₮0 需审批`) : t("off", "关闭"), p.reasons.twoOfThree],
  ] : [];
  return (
    <section className="gr" aria-label={t("Describe your agent", "描述你的智能体")}>
      <div className="gr-h"><b>{t("Describe your agent", "描述你的智能体")}</b><span className="m mute">{t("and get a line of fuses, with reasons", "得到一条保险丝线路，并附上理由")}</span></div>
      <label className="sr" htmlFor="gr-text">{t("What does your agent pay for, how much, and who signs off big payments?", "你的智能体为什么付款、付多少、大额付款由谁批准？")}</label>
      <textarea id="gr-text" className="gr-text" rows={3} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("It pays our suppliers. Never more than 80 a day; anything over 30 needs me and my partner.", "它给我们的供应商付款。每天绝不超过 80；超过 30 的付款需要我和合伙人批准。")} />
      <div className="gr-ex m">{(zh ? EXAMPLES_ZH : EXAMPLES).map((x, i) => <button key={i} className="gr-chip" onClick={() => { setText(x); setP(null); }}>{(zh ? CHIPS_ZH : CHIPS)[i]}</button>)}</div>
      <div className="gr-go">
        <button className="btn lime" onClick={go} disabled={busy || text.trim().length < 12}>{busy ? t("Working it out…", "正在分析…") : <>{t("Propose a line", "给出线路方案")} <span className="k">→</span></>}</button>
        {err && <span className="err m" role="alert">{zh ? (API_ERR_ZH[err] ?? err) : err}</span>}
      </div>
      {p && (
        <div className="gr-out" aria-live="polite">
          <div className="gr-src m mute">{zh
            ? `${p.source === "ai" ? `由 NEAR AI Cloud 上的 ${p.model?.replace(/^.*\//, "").replace("claude-haiku-5-5", "Claude Haiku 5.5") ?? "模型"} 给出` : p.fellBack ? "模型暂不可用，此方案由 Fusebox 的规则解析器给出" : "由 Fusebox 的规则解析器给出"} · 签名前请核对每个数字`
            : <>{p.source === "ai" ? `Proposed by ${p.model?.replace(/^.*\//, "").replace("claude-haiku-5-5", "Claude Haiku 5.5") ?? "the model"} on NEAR AI Cloud` : p.fellBack ? "The model was unavailable, so Fusebox's rule reader proposed this" : "Proposed by Fusebox's rule reader"} · check every number before you sign</>}</div>
          <ul className="gr-rows">
            {rows.map(([name, on, val, why]) => (
              <li key={name} className={on ? "on" : "off"}>
                <span className="gr-dot" aria-hidden="true" /><b>{name}</b><span className="m">{val}</span><p>{why}</p>
              </li>
            ))}
          </ul>
          {(p.payees.length > 0 || p.approvers.length > 0) && <p className="gr-note m mute">{zh
            ? `你描述中的${p.payees.length ? ` ${p.payees.length} 个收款方地址` : ""}${p.payees.length && p.approvers.length ? "和" : ""}${p.approvers.length ? ` ${p.approvers.length} 个审批人地址` : ""}会填到下面。`
            : <>{p.payees.length ? `${p.payees.length} payee address${p.payees.length > 1 ? "es" : ""}` : ""}{p.payees.length && p.approvers.length ? " and " : ""}{p.approvers.length ? `${p.approvers.length} approver address${p.approvers.length > 1 ? "es" : ""}` : ""} from your description will be filled in below.</>}</p>}
          {p.summary && <p className="gr-sum">{p.summary}</p>}
          {p.tests.length > 0 && <p className="gr-tests m mute">{zh
            ? `测试付款：${p.tests.map((x) => `向${TO_ZH[x.to] ?? x.to}收款方付 ${x.amount} USD₮0${x.approvals ? `（${x.approvals} 人已签）` : ""}：应${x.expect === "stop" ? "拦截" : "通过"}`).join(" · ")}`
            : <>Test payments: {p.tests.map((t) => `${t.amount} USD₮0 to a ${t.to} payee${t.approvals ? ` (${t.approvals} signed)` : ""}: should ${t.expect}`).join(" · ")}</>}</p>}
          <div className="gr-act">
            <button className="btn lime" onClick={() => { onApply(p); setApplied(true); }}>{applied ? t("Applied to the wizard ✓", "已填入向导 ✓") : <>{t("Use this line", "使用这条线路")} <span className="k">→</span></>}</button>
            <Link className="btn" href={simLinkFor(p)}>{t("Test it on TapeOut's circuits", "在 TapeOut 电路上测试")} <span className="k">↗</span></Link>
          </div>
        </div>
      )}
    </section>
  );
}
