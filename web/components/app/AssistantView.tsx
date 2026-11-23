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
import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";
import Loading from "./Loading";
import { Glyph, Plate } from "./Pixel";
import { PageChrome } from "./m/chrome";
import { MChips, MRow, MSheet } from "./m/ui";

interface Proposal { to: Address; amount: string; memo: string; check?: CheckView; result?: PayResult; error?: string; state: "checking" | "ready" | "paying" | "done" | "cancelled" }

/** Why a fuse says no to a proposed payment, and the one fix only the owner can make. Nothing in the chat overrides it. */
function stopWhy(f: FuseSlot, st: CheckView["status"][number], amount: string, saved: boolean, zh = false): string {
  if (zh) {
    if (st === "failed") return "电路调用失败，保险丝按安全原则拒绝。";
    if (st === "untrusted") return "TapeOut 处理器代码已变更且未经确认，保险丝按安全原则拒绝。";
    if (f.key === "daily-cap") return `${amount} USD₮0 会让今天的付款超过 ${f.a} USD₮0 的限额（已花费 ${Number(f.spentToday).toFixed(2)}）。限额在 00:00 UTC 重置。`;
    if (f.key === "payee-guard") return saved ? `最近才保存，仍在冷静期（${f.a} 小时），且 ${amount} USD₮0 超过 ${f.b} USD₮0 的试付额度。` : "不是已保存的收款方。只有所有者能在“所有者”标签页中保存它，保存后先按试付额度付款。";
    if (f.key === "breaker") return f.latched ? "已经熔断。所有者重置之前，任何付款都不会执行。" : "向陌生地址付款会让它熔断，并一直保持熔断，直到所有者重置。";
    if (f.key === "approval-2of3") return `超过 ${f.a} USD₮0，需要三位审批人中的两位先为这笔付款签名。`;
    if (f.key === "repeat-guard") return `过去 ${f.a} 小时内已向这个收款方付过同样的 ${amount} USD₮0，看起来是同一张发票付了两次。如果确实是第二笔付款，只有所有者能在“所有者”标签页中放行一次。`;
    return "拒绝。";
  }
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

/** lib/agentPay's error lines in Chinese; anything else goes through errZh. */
const PAY_ERR_ZH: Record<string, string> = {
  "This key isn't an agent of that wallet.": "这个密钥不是该钱包的智能体。",
  "The wallet is frozen. The owner can unfreeze it.": "钱包已冻结，所有者可以解冻。",
  "The wallet's daily decision limit is reached.": "钱包今天的决策次数已达上限。",
  "Too many stopped payments today: the wallet stopped taking more.": "今天被拦截的付款太多：钱包已不再接受新的付款。",
  "The agent has no OKB for gas. Send it a little first.": "智能体没有 OKB 支付 gas，请先给它转一点。",
  "The transaction landed but recorded no decision.": "交易已上链，但没有记录任何决策。",
};
/** /api/assistant's error lines in Chinese. */
const ASK_ERR_ZH: Record<string, string> = {
  "That's a lot of messages in a minute. Give it a moment.": "一分钟内消息太多了，请稍等片刻。",
  "Say who to pay and how much.": "请说明付给谁、付多少。",
  "Keep it under 1,000 characters.": "请控制在 1,000 个字符以内。",
  "Pick a wallet first.": "请先选择一个钱包。",
};
function payErrZh(msg: string): string {
  if (PAY_ERR_ZH[msg]) return PAY_ERR_ZH[msg];
  const refused = /^The wallet refused: (.+)\.$/.exec(msg);
  if (refused) return `钱包拒绝了：${refused[1]}。`;
  const gas = /^Your agent needs a little more OKB for gas: it holds (\S+), a payment needs about (\S+) up front\.$/.exec(msg);
  if (gas) return `你的智能体需要多一点 OKB 来支付 gas：目前持有 ${gas[1]}，每笔付款预先需要约 ${gas[2]}。`;
  return errZh(msg);
}

/** Pay by chatting. The model only proposes; the wallet's real fuses are checked, you tap Pay, and the agent key in
 *  this browser signs. It never leaves the device and can only pay through the fuses. */
export default function AssistantView() {
  const { t, zh } = useLang();
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
      if (!r.ok) { setErr(j.error != null ? (zh ? ASK_ERR_ZH[j.error] ?? j.error : j.error) : t("The assistant couldn't answer.", "助手无法回答。")); return; }
      const idx = msgs.length + 1; // the assistant's message lands after the user's
      setMsgs((m) => [...m, { role: "assistant", text: j.reply, pay: j.pay ? { ...j.pay, state: "checking" } : undefined }]);
      if (j.pay) {
        try { patch(idx, { check: await checkFor(wallet, j.pay.to, j.pay.amount), state: "ready" }); }
        catch { patch(idx, { state: "ready", error: t("Couldn't ask the fuses just now.", "暂时无法询问保险丝。") }); }
      }
    } catch { setErr(t("Couldn't reach the server. Try again.", "无法连接服务器，请重试。")); } finally { setBusy(false); }
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
      <PageChrome title={t("Assistant", "助手")} sub={t("Pay by chatting", "聊天付款")} info={<p>{t(<>The Fusebox assistant pays for you from your own wallet: you say who and how much, your wallet&apos;s fuses are checked, and you tap to pay. It signs with your agent key, kept in this browser.</>, <>Fusebox 助手从你自己的钱包替你付款：你说付给谁、付多少，钱包的保险丝先检查，你点一下就能付款。它用保存在这个浏览器里的智能体密钥签名。</>)}</p>} />
      <div className="mtitle">{t("Pay by chatting", "聊天付款")}</div>
      <p className="mcap">{t(<>Say &ldquo;pay Kano Cotton 2&rdquo; and the assistant lines it up. Your wallet&apos;s fuses check it, you tap Pay. It needs your wallet&apos;s agent key in this browser.</>, <>说一句“给 Kano Cotton 付 2”，助手就会准备好这笔付款。钱包的保险丝检查后，你点“付款”即可。需要这个浏览器里有你钱包的智能体密钥。</>)}</p>
      <div className="mrows">
        <MRow href="/app/new" icon={<Glyph name="new" size={16} />} title={t("Wire up a wallet", "搭建一个钱包")} sub={t("Fusebox makes the agent key for you", "Fusebox 会为你生成智能体密钥")} />
      </div>
      <div className="mcard mpay">
        <span className="m mute">{t("Already have a wallet? Add its agent key", "已有钱包？添加它的智能体密钥")}</span>
        <label className="mfield"><span className="m">{t("Fusebox wallet", "Fusebox 钱包")}</span><input aria-label={t("Fusebox wallet address", "Fusebox 钱包地址")} value={impWallet} onChange={(e) => setImpWallet(e.target.value)} placeholder="0x…" spellCheck={false} /></label>
        <label className="mfield"><span className="m">{t("Agent private key", "智能体私钥")}</span><input aria-label={t("Agent private key", "智能体私钥")} type="password" value={imp} onChange={(e) => setImp(e.target.value)} placeholder={t("0x… (64 hex characters)", "0x…（64 位十六进制字符）")} spellCheck={false} /></label>
        <button className="btn lime" style={{ justifyContent: "center", height: 48 }} disabled={!isAddress(impWallet.trim(), { strict: false }) || !keyFrom(imp)} onClick={() => { const w = getAddress(impWallet.trim().toLowerCase()); const k = keyFrom(imp)!; saveAgentKey(w, k); setKey(k); setWallet(w); setChoices((c) => [...new Set([w, ...c])]); setImp(""); }}>{t("Use this wallet", "使用这个钱包")}</button>
        <p className="mnote">{t("The key stays in this browser. It can only ask the wallet to pay, through every fuse.", "密钥只保存在这个浏览器中。它只能请求钱包付款，并且要经过每个保险丝。")}</p>
      </div>
    </div>
  );
  if (!a || a.isAtlas) return <div className="mpage asst"><PageChrome title={t("Assistant", "助手")} sub={short(wallet)} /><Loading label={t("Reading your wallet from X Layer", "正在从 X Layer 读取你的钱包")} error={error} /></div>;

  const isAgent = agentOk ?? (a.agents ?? []).some((x) => x.toLowerCase() === key.address.toLowerCase());
  const perPay = a.fuses.reduce((t, f) => t + Number(f.fee), 0);
  const first = a.payees[0];
  const chips: [string, string][] = zh ? [
    ...(first ? [[`给 ${labels[first.address.toLowerCase()] ?? first.address} 付 0.01`, `给 ${nameOf(first.address)} 付 0.01`] as [string, string]] : []),
    ["我的余额是多少？", "余额"], ["我可以付给谁？", "我可以付给谁？"],
  ] : [
    ...(first ? [[`pay ${labels[first.address.toLowerCase()] ?? first.address} 0.01`, `Pay ${nameOf(first.address)} 0.01`] as [string, string]] : []),
    ["What's my balance?", "Balance"], ["Who can I pay?", "Who can I pay?"],
  ];
  return (
    <div className="mpage asst">
      <PageChrome title={t("Assistant", "助手")} sub={t(`Wallet ${short(wallet)}`, `钱包 ${short(wallet)}`)} info={t(<><p>Say who to pay and how much. The assistant ({mode ?? "…"}) only lines payments up: your wallet&apos;s fuses check each one on X Layer, you tap Pay, and the agent key in this browser signs.</p><p>It only pays your saved payees, or an address you type in full. Name your payees so you can say &ldquo;pay Kano Cotton 2&rdquo;.</p></>,
        <><p>告诉它付给谁、付多少。助手（{mode ?? "…"}）只负责准备付款：钱包的保险丝在 X Layer 上逐笔检查，你点“付款”，再由这个浏览器里的智能体密钥签名。</p><p>它只付给你已保存的收款方，或你完整输入的地址。给收款方起个名字，就可以说“给 Kano Cotton 付 2”。</p></>)} />
      <div className="asst-top mcard">
        <span className="asst-w"><Plate address={wallet} size={22} /><span><b>{Number(a.balance).toFixed(4)} USD₮0</b><small className="m">{feeRunway(Number(a.feeBalance), perPay, zh)}{t(" · agent gas ", " · 智能体 gas ")}{gas === null ? "…" : (Number(gas) / 1e18).toFixed(5)} OKB</small></span></span>
        <span className="asst-btns">
          {choices.length > 1 && <select aria-label={t("Wallet", "钱包")} value={wallet} onChange={(e) => { setWallet(getAddress(e.target.value)); setMsgs([]); }}>{choices.map((w) => <option key={w} value={w}>{short(w)}</option>)}</select>}
          <button className="btn" onClick={() => setNames(true)}>{t("Name payees", "命名收款方")}</button>
        </span>
      </div>
      {agentOk === false && <p className="mnote" style={{ color: "var(--red)" }}>{t(<>This key ({short(key.address)}) isn&apos;t an agent of this wallet, so payments would be refused. The owner can add it in the Owner tab.</>, <>这个密钥（{short(key.address)}）不是这个钱包的智能体，付款会被拒绝。所有者可以在“所有者”标签页中添加它。</>)}</p>}
      {gas !== null && need !== null && gas < need && <p className="mnote" style={{ color: "var(--red)" }}>{t(<>Your agent needs a little more OKB for gas ({(Number(need) / 1e18).toFixed(5)} per payment, up front). </>, <>你的智能体需要多一点 OKB 来支付 gas（每笔付款预先需要 {(Number(need) / 1e18).toFixed(5)}）。</>)}<Link className="lime" href={`/app/first?wallet=${wallet}`}>{t("Send it some →", "给它转一些 →")}</Link></p>}

      <div className="asst-log" aria-live="polite">
        {!msgs.length && <div className="asst-empty"><Glyph name="rob" size={28} /><p>{t(<>Tell me who to pay and how much. I&apos;ll line it up, your fuses check it, and you tap Pay.</>, <>告诉我付给谁、付多少。我来准备，你的保险丝来检查，你点“付款”。</>)}</p></div>}
        {msgs.map((m, i) => (
          <div key={i} className={`asst-msg ${m.role}`}>
            <p>{m.text}</p>
            {m.pay && (
              <div className={`asst-pay${m.pay.state === "done" ? (m.pay.result?.allowed ? " ok" : " no") : ""}`}>
                <div className="asst-pay-h"><b>{m.pay.amount} USD₮0</b><span className="m">{t("to", "付给")} {nameOf(m.pay.to)}</span></div>
                {m.pay.state === "checking" && <p className="m mute">{t("Asking your fuses…", "正在询问你的保险丝…")}</p>}
                {m.pay.check && m.pay.state !== "done" && (
                  <div className="asst-fz">{a.fuses.map((f, k) => <span key={f.slot} className={`mtag ${m.pay!.check!.status[k] === "pass" ? "ok" : "no"}`}>{f.name} · {m.pay!.check!.status[k] === "pass" ? t("passes", "通过") : t("says no", "拒绝")}</span>)}</div>
                )}
                {m.pay.check && !m.pay.check.allowed && m.pay.state !== "done" && (
                  <ul className="asst-why">{a.fuses.map((f, k) => m.pay!.check!.status[k] === "pass" ? null : <li key={f.slot}><b>{f.name}</b> {stopWhy(f, m.pay!.check!.status[k], m.pay!.amount, a.payees.some((p) => p.address.toLowerCase() === m.pay!.to.toLowerCase()), zh)}</li>)}</ul>
                )}
                {m.pay.result && (
                  <div className="asst-fz">{a.fuses.map((f, k) => <span key={f.slot} className={`mtag ${m.pay!.result!.status[k] === "pass" ? "ok" : "no"}`}>{f.name} · {m.pay!.result!.status[k] === "pass" ? t("passed", "已通过") : t("stopped", "已拦截")}</span>)}</div>
                )}
                {m.pay.state === "done" && m.pay.result && <p className="m">{m.pay.result.allowed ? t("Paid", "已付款") : t("Stopped", "已拦截")} · {t("payment", "付款")} #{m.pay.result.decisionId} · <a className="lime" href={`${OKLINK}/tx/${m.pay.result.hash}`} target="_blank" rel="noreferrer">{t("transaction ↗", "交易 ↗")}</a></p>}
                {m.pay.error && <p className="mnote" style={{ color: "var(--red)" }}>{zh ? payErrZh(m.pay.error) : m.pay.error}</p>}
                {(m.pay.state === "ready" || m.pay.state === "paying") && (
                  <div className="asst-act">
                    {m.pay.check?.allowed
                      ? <button className="btn lime" disabled={m.pay.state === "paying" || !isAgent} onClick={() => pay(i, m.pay!)}>{m.pay.state === "paying" ? t("Your fuses are deciding…", "保险丝正在判定…") : t("Pay as your agent", "以智能体身份付款")}</button>
                      : <span className="mnote">{m.pay.check ? t("Your fuses would stop this, so there's nothing to sign, and nothing in this chat can change that.", "你的保险丝会拦截这笔付款，所以无需签名，聊天里说什么也改变不了。") : ""}</span>}
                    {m.pay.state === "ready" && <button className="btn" onClick={() => patch(i, { state: "cancelled" })}>{t("Cancel", "取消")}</button>}
                  </div>
                )}
                {m.pay.state === "cancelled" && <p className="m mute">{t("Cancelled. Nothing was sent.", "已取消，什么都没有发送。")}</p>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="asst-msg assistant"><p className="m mute">{t("Thinking…", "思考中…")}</p></div>}
        <div ref={end} />
      </div>
      {err && <p className="mnote" style={{ color: "var(--red)" }} role="alert">{err}</p>}
      <MChips label={t("Suggestions", "建议")} items={chips} value={null} onChange={(v) => ask(v)} />
      <form className="asst-in" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <label className="sr" htmlFor="asst-text">{t("Message the assistant", "给助手发消息")}</label>
        <input id="asst-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Pay Kano Cotton 2", "给 Kano Cotton 付 2")} autoComplete="off" maxLength={1000} />
        <button className="btn lime" disabled={busy || !text.trim()} aria-label={t("Send", "发送")}>→</button>
      </form>

      <MSheet open={names} onClose={() => setNames(false)} title={t("Name your payees", "给收款方命名")}>
        <p className="mnote">{t(<>Names live in this browser, so you can say &ldquo;pay Kano Cotton 2&rdquo;.</>, <>名字保存在这个浏览器中，这样你就可以说“给 Kano Cotton 付 2”。</>)}</p>
        {a.payees.length ? a.payees.map((p) => (
          <label key={p.address} className="mfield"><span className="m">{p.address}</span>
            <input aria-label={t(`Name for ${p.address}`, `${p.address} 的名字`)} defaultValue={labels[p.address.toLowerCase()] ?? ""} placeholder={t("e.g. Kano Cotton", "例如 Kano Cotton")} maxLength={40} onBlur={(e) => setLabels(saveLabel(wallet, p.address, e.target.value))} /></label>
        )) : <p className="mcap">{t(<>No saved payees yet. The owner saves them in the wallet&apos;s Owner tab.</>, <>还没有已保存的收款方。所有者可以在钱包的“所有者”标签页中保存。</>)}</p>}
      </MSheet>
    </div>
  );
}
