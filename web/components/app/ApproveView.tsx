"use client";
import { useCallback, useEffect, useState } from "react";
import { getAddress, isAddress, parseUnits, type Address } from "viem";
import { fuseboxWalletAbi } from "@/lib/abi";
import { DEP, pub } from "@/lib/client-chain";
import { useAtlas, short, fmt, OKLINK } from "@/lib/hooks";
import { useTxQueue } from "@/lib/useTxQueue";
import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";
import { useWallet } from "./WalletProvider";
import ConnectChoices from "./ConnectChoices";
import { Responsive } from "./m/useMobile";
import { PageChrome } from "./m/chrome";
import { MLabel, MRow, MSticky } from "./m/ui";
import { Glyph, Plate } from "./Pixel";
import ApprovalInbox from "./ApprovalInbox";
import ApproverAlerts from "./ApproverAlerts";

/** Two of Three: approvers sign off one exact payment (token, payee, amount) so the agent's retry can pass. */
export default function ApproveView() {
  const { account, write } = useWallet();
  const { t, zh } = useLang();
  const q = useTxQueue<object>();
  const [wallet, setWallet] = useState<string>(DEP.atlas);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  // Deep links (?wallet=&to=&amount=) are read after mount, so the page hydrates with the template's reveal intact.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("wallet")) setWallet(sp.get("wallet")!);
    if (sp.get("to")) setTo(sp.get("to")!);
    if (sp.get("amount")) setAmount(sp.get("amount")!);
  }, []);
  const [seats, setSeats] = useState<Address[] | null>(null);
  const [mask, setMask] = useState(0);
  const [ttl, setTtl] = useState(86400);
  const valid = isAddress(wallet, { strict: false });
  const { data } = useAtlas(8000, valid ? (wallet.toLowerCase() === DEP.atlas.toLowerCase() ? "/api/atlas" : `/api/wallet/${wallet}`) : "/api/atlas");
  const amt = (() => { try { return Number(amount) > 0 ? parseUnits(amount, 6) : null; } catch { return null; } })();
  const payee = isAddress(to, { strict: false }) ? getAddress(to.toLowerCase()) : null;

  const read = useCallback(async () => {
    if (!valid) return;
    const W = { address: getAddress(wallet.toLowerCase()), abi: fuseboxWalletAbi } as const;
    try {
      const [s, t] = await Promise.all([pub.readContract({ ...W, functionName: "approvers" }), pub.readContract({ ...W, functionName: "approvalTtl" })]);
      setSeats([...s]); setTtl(Number(t));
      setMask(payee && amt ? Number(await pub.readContract({ ...W, functionName: "approvalMaskOf", args: [DEP.usdt0 as Address, payee, amt] })) : 0);
    } catch { setSeats(null); }
  }, [wallet, valid, payee, amt]);
  useEffect(() => { read(); const id = setInterval(read, 6000); return () => clearInterval(id); }, [read]);

  const two = data?.fuses.findIndex((f) => f.key === "approval-2of3") ?? -1;
  const threshold = two >= 0 ? data!.fuses[two].a : null;
  const waiting = two >= 0 ? (data?.decisions ?? []).filter((d) => !d.allowed && d.status[two] === "blew") : [];
  // a link can prefill any payee and amount: say so when no agent of this wallet has tried exactly this payment
  const unasked = !!data && two >= 0 && !!payee && !!amt && threshold !== null && Number(amount) > threshold && !waiting.some((d) => d.to.toLowerCase() === payee.toLowerCase() && Number(d.amount) === Number(amount));
  const UNASKED = t("No agent of this wallet has tried this exact payment yet. Approve only a payment you expect; if a link sent you here, check with the wallet's owner first.", "这个钱包的智能体还没有尝试过这笔付款。只批准你预期中的付款；如果是别人发链接让你来的，请先和钱包所有者确认。");
  const mySeat = account && seats ? seats.findIndex((s) => s.toLowerCase() === account.toLowerCase()) : -1;
  const approvedByMe = mySeat >= 0 && ((mask >> mySeat) & 1) === 1;
  const count = [0, 1, 2].filter((b) => (mask >> b) & 1).length;
  const act = async (fn: "approvePayment" | "revokeApproval") => {
    await q.start([{ id: fn, label: fn === "approvePayment" ? t("Approve this payment", "批准这笔付款") : t("Revoke your approval", "撤回你的批准"), run: () => write({ address: getAddress(wallet.toLowerCase()), abi: fuseboxWalletAbi, functionName: fn, args: [DEP.usdt0 as Address, payee!, amt!] }) }], {});
    read();
  };
  const last = q.steps[q.steps.length - 1];

  const mobileView = (
    <div className="mpage">
      <PageChrome title={t("Approvals", "审批")} sub={t("Two of three sign big payments", "大额付款需三人中两人签名")}
        info={<p>{t(<>Above its threshold, a wallet with the Two of Three fuse pays only what two of its three approvers have signed off: this exact payee, this exact amount. Approvals expire {Math.round(ttl / 3600)} hours after the first one.</>, <>超过阈值时，装有 Two of Three 保险丝的钱包只支付三位审批人中两位签过名的付款：收款方和金额都必须完全一致。审批在第一个签名后 {Math.round(ttl / 3600)} 小时过期。</>)}</p>} />
      {account && <ApproverAlerts account={account} />}
      {account && <ApprovalInbox account={account} onPick={(r) => { setWallet(r.wallet); setTo(r.to); setAmount(r.amount); setTimeout(() => document.getElementById("m-approve")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />}
      <MLabel>{t("Approve a payment", "批准付款")}</MLabel>
      <div id="m-approve" />
      {waiting.length > 0 && <div className="mrows">
        {waiting.slice(0, 6).map((d) => <MRow key={d.id} onClick={() => { setTo(d.to); setAmount(d.amount); }} className={payee?.toLowerCase() === d.to.toLowerCase() && amount === d.amount ? "sel" : ""}
          icon={<Glyph name="stop" size={16} color="var(--red)" />} title={d.memo || t("No memo", "无备注")} sub={t(`#${d.id} · to ${short(d.to)}`, `#${d.id} · 付给 ${short(d.to)}`)} value={fmt(d.amount, 2)} valueSub="USD₮0" chev={false} />)}
      </div>}
      <div className="mcard mpay">
        <label className="mfield"><span className="m">{t("Pay to", "付给")}</span><input aria-label={t("Pay to", "付给")} value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" spellCheck={false} /></label>
        <label className="mfield"><span className="m">{t("Amount · USD₮0", "金额 · USD₮0")}</span><input aria-label={t("Amount, USD₮0", "金额，USD₮0")} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
        <details className="mdetails"><summary className="m">{t("Wallet", "钱包")} · {valid ? short(wallet) : "—"}</summary><label className="mfield"><span className="sr">{t("Wallet", "钱包")}</span><input aria-label={t("Wallet", "钱包")} value={wallet} onChange={(e) => setWallet(e.target.value)} spellCheck={false} /></label></details>
        {threshold !== null && amt && Number(amount) <= threshold && <p className="mnote">{t(<>{amount} USD₮0 is under the {threshold} USD₮0 threshold, so Two of Three already lets it through.</>, <>{amount} USD₮0 低于 {threshold} USD₮0 的阈值，Two of Three 本来就会放行。</>)}</p>}
        {unasked && <p className="mnote red" role="note">{UNASKED}</p>}
        {two < 0 && data && <p className="mnote">{t("This wallet has no Two of Three fuse.", "这个钱包没有安装 Two of Three 保险丝。")}</p>}
      </div>
      <MLabel right={<span className={count >= 2 ? "lime" : ""}>{t(`${count} of 2 needed`, `已签 ${count} / 2`)}</span>}>{t("Approvers", "审批人")}</MLabel>
      <div className="mrows">
        {(seats ?? [null, null, null]).map((s, i) => <MRow key={i} icon={s ? <Plate address={s} size={22} /> : <span />} title={s ? short(s) : "—"} sub={t(`Seat ${i + 1}${mySeat === i ? " · you" : ""}`, `席位 ${i + 1}${mySeat === i ? " · 你" : ""}`)}
          value={<span className={`mtag ${(mask >> i) & 1 ? "ok" : "dim"}`}>{(mask >> i) & 1 ? t("Signed", "已签名") : t("Not yet", "未签名")}</span>} chev={false} />)}
      </div>
      {count >= 2 && <div className="mverdict ok"><b>{t("Cleared", "已放行")}</b><p className="mcap">{t("Two approvers signed this exact payment. When the agent retries it, Two of Three holds.", "两位审批人已为这笔付款签名。智能体重试时，Two of Three 会通过。")}</p></div>}
      {last && <p className="m mute" role="status">{zh ? <>{last.label}：{last.state === "done" ? "完成" : last.state === "error" ? errZh(last.error ?? "") : "请在钱包中签名…"}</> : <>{last.label}: {last.state === "done" ? "done" : last.state === "error" ? last.error : "sign in your wallet…"}</>}{last.hash ? <> · <a className="lime" href={`${OKLINK}/tx/${last.hash}`} target="_blank" rel="noreferrer">tx ↗</a></> : null}</p>}
      {!account ? <ConnectChoices />
        : mySeat < 0 ? <p className="mnote">{t(<>Your connected wallet {short(account)} isn&apos;t one of this wallet&apos;s approvers.</>, <>你连接的钱包 {short(account)} 不是这个钱包的审批人。</>)}</p>
        : !payee || !amt ? <p className="mnote">{t("Pick a stopped payment, or enter the payee and amount.", "选择一笔被拦截的付款，或输入收款方和金额。")}</p>
        : <MSticky>{approvedByMe ? <button className="btn" disabled={q.running} onClick={() => act("revokeApproval")}>{t("Revoke my approval", "撤回我的批准")}</button> : <button className="btn lime" disabled={q.running} onClick={() => act("approvePayment")}>{t(`Approve as seat ${mySeat + 1}`, `以席位 ${mySeat + 1} 批准`)} <span className="k">→</span></button>}</MSticky>}
    </div>
  );

  return <Responsive mobile={mobileView} desktop={
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <section className="try-head">
        <h1 className="disp" data-a>{t(<>Two of <span className="lime">[three]</span>.</>, <>三选<span className="lime">[二]</span>。</>)}</h1>
        <p data-a>{t(<>Above its threshold, a wallet with the Two of Three fuse pays only what two of its three approvers have signed off: this exact payee, this exact amount. Approvals expire {Math.round(ttl / 3600)} hours after the first one. Connect as an approver to see everything waiting on you, across every wallet where you hold a seat.</>, <>超过阈值时，装有 Two of Three 保险丝的钱包只支付三位审批人中两位签过名的付款：收款方和金额都必须完全一致。审批在第一个签名后 {Math.round(ttl / 3600)} 小时过期。以审批人身份连接钱包，就能看到你有席位的每个钱包里等你审批的付款。</>)}</p>
      </section>
      {account && <ApproverAlerts account={account} />}
      {account && <ApprovalInbox account={account} onPick={(r) => { setWallet(r.wallet); setTo(r.to); setAmount(r.amount); setTimeout(() => document.getElementById("approve-one")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />}
      <h2 className="sr" id="approve-one">{t("Approve a payment", "批准付款")}</h2>
      <section className="wz">
        <div className="wz-main" data-a>
          <div className="wz-sec">
            <div className="ix">01</div>
            <div>
              <h3>{t("The payment", "这笔付款")}</h3>
              <p className="lead">{t("Pick one the agent was stopped on, or type it in.", "选择一笔智能体被拦截的付款，或手动输入。")}</p>
              {waiting.length > 0 && (
                <div className="tricks" style={{ marginBottom: 20 }}>
                  {waiting.slice(0, 6).map((d) => (
                    <button key={d.id} className={`trick${payee?.toLowerCase() === d.to.toLowerCase() && amount === d.amount ? " on" : ""}`} onClick={() => { setTo(d.to); setAmount(d.amount); }} data-cursor={t("Load", "载入")}>
                      <span className="n">#{d.id}</span><span>{fmt(d.amount, 2)} USD₮0 → {short(d.to)} · “{d.memo.slice(0, 48)}”</span><span className="go">{t("Load", "载入")}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="fields m" style={{ marginTop: 0 }}>
                <div className="field"><label>{t("Wallet", "钱包")}</label><input aria-label={t("Wallet", "钱包")} value={wallet} onChange={(e) => setWallet(e.target.value)} spellCheck={false} /></div>
                <div className="prow">
                  <div className="field" style={{ flex: 2 }}><label>{t("Pay to", "付给")}</label><input aria-label={t("Pay to", "付给")} value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" spellCheck={false} /></div>
                  <div className="field"><label>{t("Amount, USD₮0", "金额，USD₮0")}</label><input aria-label={t("Amount, USD₮0", "金额，USD₮0")} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></div>
                </div>
                {threshold !== null && amt && Number(amount) <= threshold && <div className="hint2">{t(<>{amount} USD₮0 is under this wallet&apos;s {threshold} USD₮0 threshold, so Two of Three already lets it through.</>, <>{amount} USD₮0 低于这个钱包 {threshold} USD₮0 的阈值，Two of Three 本来就会放行。</>)}</div>}
                {unasked && <div className="hint2 red" role="note">{UNASKED}</div>}
                {two < 0 && data && <div className="hint2">{t("This wallet has no Two of Three fuse.", "这个钱包没有安装 Two of Three 保险丝。")}</div>}
              </div>
            </div>
          </div>
        </div>
        <div className="wz-side" data-a>
          <div className="summary">
            <div className="sh2 m"><span className="mute">{t("Approvals", "审批")}</span><span className={count >= 2 ? "lime" : "mute"}>{t(`${count} of 2 needed`, `已签 ${count} / 2`)}</span></div>
            <div className="rows">
              {(seats ?? [null, null, null]).map((s, i) => (
                <div key={i}><span>{t("Seat", "席位")} {i + 1}{mySeat === i ? t(" · you", " · 你") : ""}</span><span style={{ color: (mask >> i) & 1 ? "var(--lime)" : "var(--dim)" }}>{s ? short(s) : "—"} {(mask >> i) & 1 ? t("✓ signed", "✓ 已签名") : t("· not yet", "· 未签名")}</span></div>
              ))}
            </div>
            <div className="go">
              {!account ? <ConnectChoices />
                : mySeat < 0 ? <div className="warn2">{t(<>Your connected wallet {short(account)} isn&apos;t one of this wallet&apos;s approvers.</>, <>你连接的钱包 {short(account)} 不是这个钱包的审批人。</>)}</div>
                : !payee || !amt ? <div className="warn2">{t("Enter the payee and amount to approve.", "输入要批准的收款方和金额。")}</div>
                : approvedByMe ? <button className="btn" disabled={q.running} onClick={() => act("revokeApproval")}>{t("Revoke my approval", "撤回我的批准")}</button>
                : <button className="btn lime" disabled={q.running} onClick={() => act("approvePayment")} data-cursor={t("Approve", "批准")}><span className="roll"><span>{t(`Approve as seat ${mySeat + 1}`, `以席位 ${mySeat + 1} 批准`)}</span><span aria-hidden="true">{t(`Approve as seat ${mySeat + 1}`, `以席位 ${mySeat + 1} 批准`)}</span></span> <span className="k">✓</span></button>}
              {last && <p className="m mute" style={{ marginTop: 10 }}>{zh ? <>{last.label}：{last.state === "done" ? "完成" : last.state === "error" ? errZh(last.error ?? "") : "请在钱包中签名…"}</> : <>{last.label}: {last.state === "done" ? "done" : last.state === "error" ? last.error : "sign in your wallet…"}</>}{last.hash ? <> · <a className="lime" href={`${OKLINK}/tx/${last.hash}`} target="_blank" rel="noreferrer">tx ↗</a></> : null}</p>}
              {count >= 2 && <div className="done-card"><h4>{t("Cleared.", "已放行。")}</h4><p style={{ color: "var(--soft)", fontSize: 14, lineHeight: 1.5 }}>{t("Two approvers signed this exact payment. When the agent retries it, Two of Three holds, and the other fuses still decide.", "两位审批人已为这笔付款签名。智能体重试时 Two of Three 会通过，其他保险丝照常判定。")}</p></div>}
            </div>
          </div>
        </div>
      </section>
    </div>
  } />;
}
