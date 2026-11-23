"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { parseUnits, type Address } from "viem";
import { fuseboxWalletAbi } from "@/lib/abi";
import { DEP } from "@/lib/client-chain";
import { useTxQueue } from "@/lib/useTxQueue";
import { short, OKLINK } from "@/lib/hooks";
import type { Inbox, Request } from "@/lib/approvals";
import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";
import { useWallet } from "./WalletProvider";

const ago = (t: number, zh = false) => { const s = Math.max(0, Date.now() / 1000 - t); return zh ? (s < 90 ? "刚刚" : s < 5400 ? `${Math.round(s / 60)} 分钟前` : s < 129600 ? `${Math.round(s / 3600)} 小时前` : `${Math.round(s / 86400)} 天前`) : s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const signed = (m: number) => [0, 1, 2].filter((i) => (m >> i) & 1).length;

/** Every payment waiting on the connected approver, across all the wallets where they hold a seat. */
export default function ApprovalInbox({ account, onPick }: { account: Address; onPick: (r: Request) => void }) {
  const { write } = useWallet();
  const { t, zh } = useLang();
  const q = useTxQueue<object>();
  const [box, setBox] = useState<Inbox | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let on = true;
    const pull = () => fetch(`/api/approvals?approver=${account}${nonce ? "&fresh=1" : ""}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (!on) return; if (j.open) { setBox(j); setErr(null); } else setErr(j.error ?? "unreachable"); }).catch(() => on && setErr("unreachable"));
    pull(); const id = setInterval(pull, 12000);
    return () => { on = false; clearInterval(id); };
  }, [account, nonce]);
  const act = async (r: Request, fn: "approvePayment" | "revokeApproval") => {
    const ok = await q.start([{ id: fn, label: fn === "approvePayment" ? t(`Approve ${r.amount} USD₮0 to ${short(r.to)}`, `批准付给 ${short(r.to)} 的 ${r.amount} USD₮0`) : t(`Revoke your approval of ${r.amount} USD₮0 to ${short(r.to)}`, `撤回对付给 ${short(r.to)} 的 ${r.amount} USD₮0 的批准`), run: () => write({ address: r.wallet, abi: fuseboxWalletAbi, functionName: fn, args: [DEP.usdt0 as Address, r.to, parseUnits(r.amount, 6)] }) }], {});
    if (ok) setNonce((n) => n + 1);
  };
  const last = q.steps[q.steps.length - 1];
  const feed = `/api/approvals/feed?approver=${account}`;

  return (
    <section className="inbox" data-a aria-label={t("Approvals waiting for you", "等你审批的付款")}>
      <div className="blockhead"><h2 className="disp">{t(<>Waiting for <span className="lime">you</span></>, <>等<span className="lime">你</span>审批</>)}</h2>
        <span className="m mute">{box ? t(`${box.open.length} open · seats in ${box.seated} of ${box.wallets} wallets`, `${box.open.length} 笔待审批 · ${box.wallets} 个钱包中有 ${box.seated} 个有你的席位`) : err ? t(`couldn't read X Layer (${err})`, `无法读取 X Layer（${err === "unreachable" ? "无法连接" : err === "Couldn't reach X Layer just now." ? "暂时无法连接" : err}）`) : t("reading every wallet where you hold a seat…", "正在读取你有席位的每个钱包…")}</span></div>
      {last && <p className={`m ${last.state === "error" ? "red" : "mute"} inbox-status`} role="status">{zh ? <>{last.label}：{last.state === "done" ? "完成" : last.state === "error" ? errZh(last.error ?? "") : last.state === "mine" ? "正在 X Layer 上确认…" : "请在钱包中签名…"}</> : <>{last.label}: {last.state === "done" ? "done" : last.state === "error" ? last.error : last.state === "mine" ? "confirming on X Layer…" : "sign in your wallet…"}</>}{last.hash ? <> · <a className="lime" href={`${OKLINK}/tx/${last.hash}`} target="_blank" rel="noreferrer">tx ↗</a></> : null}</p>}
      {box && box.open.length === 0 && (
        <div className="inbox-empty m mute">{zh ? (box.seated ? `没有等 ${short(account)} 审批的付款。你的 ${box.seated} 个钱包中，智能体一旦因超过阈值被拦截，付款就会出现在这里。` : `${short(account)} 还不是任何 Fusebox 钱包的审批人。所有者可以在钱包的控制台里设置审批人。`)
          : box.seated ? `Nothing is waiting on ${short(account)}. When an agent is stopped above a threshold in one of your ${box.seated} wallet${box.seated > 1 ? "s" : ""}, it lands here.` : `${short(account)} isn't an approver on any Fusebox wallet yet. An owner seats approvers from their wallet's console.`}</div>
      )}
      <div className="inbox-list">
        {box?.open.map((r) => {
          const n = signed(r.mask), mine = r.mySeat >= 0 && ((r.mask >> r.mySeat) & 1) === 1;
          return (
            <article key={`${r.wallet}-${r.to}-${r.amount}`} className={`ibx${n >= 2 ? " clear" : ""}`}>
              <div className="ibx-top">
                <div><b>{r.amount} USD₮0</b><span className="m mute"> → {short(r.to)} · {r.saved ? t("saved payee", "已保存的收款方") : t("not a saved payee", "不是已保存的收款方")}</span></div>
                <span className="m mute">{ago(r.last, zh)}{r.attempts > 1 ? t(` · ${r.attempts} attempts`, ` · 尝试 ${r.attempts} 次`) : ""}</span>
              </div>
              <p className="ibx-memo">“{r.memo}”</p>
              <div className="ibx-row m">
                <span className="ibx-seats" aria-label={t(`${n} of 2 approvals`, `已获 ${n} / 2 个批准`)}>
                  {r.seats.map((s, i) => <span key={i} className={(r.mask >> i) & 1 ? "on" : ""} title={s}>{(r.mask >> i) & 1 ? "✓ " : ""}S{i + 1}{i === r.mySeat ? t(" · you", " · 你") : ""}</span>)}
                </span>
                <span className={n >= 2 ? "lime" : "mute"}>{n >= 2 ? t("Cleared: the agent's retry passes this fuse", "已放行：智能体重试时会通过这个保险丝") : t(`${n} of 2 signed${r.threshold !== null ? ` · over ${r.threshold} USD₮0` : ""}`, `已签 ${n} / 2${r.threshold !== null ? ` · 超过 ${r.threshold} USD₮0` : ""}`)}</span>
              </div>
              <div className="ibx-act">
                <Link className="m mute" href={r.isAtlas ? "/app" : `/app/w/${r.wallet}`}>{r.isAtlas ? "Atlas" : t(`Wallet ${short(r.wallet)}`, `钱包 ${short(r.wallet)}`)} ↗</Link>
                <button className="dt-btn" onClick={() => onPick(r)}>{t("Details", "详情")}</button>
                {mine ? <button className="btn" disabled={q.running} onClick={() => act(r, "revokeApproval")}>{t("Revoke mine", "撤回我的")}</button>
                  : <button className="btn lime" disabled={q.running || r.mySeat < 0} onClick={() => act(r, "approvePayment")}>{t(`Approve as seat ${r.mySeat + 1}`, `以席位 ${r.mySeat + 1} 批准`)}</button>}
              </div>
            </article>
          );
        })}
      </div>
      {box && box.recent.length > 0 && (
        <details className="inbox-recent m"><summary>{t("Paid after approval", "审批后已付款")} · {box.recent.length}</summary>
          <ul>{box.recent.map((r) => <li key={`${r.wallet}-${r.to}-${r.amount}-${r.paid}`}><span>{r.amount} USD₮0 → {short(r.to)}</span><span className="mute">{r.isAtlas ? "Atlas" : short(r.wallet)} · {zh ? `${ago(r.paid!, zh)}付款` : `paid ${ago(r.paid!)}`}</span></li>)}</ul>
        </details>
      )}
      <div className="inbox-feed m">
        <button className="dt-btn" onClick={() => { navigator.clipboard?.writeText(`${location.origin}${feed}`); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? t("Feed URL copied", "已复制订阅链接") : t("Copy my approvals feed", "复制我的审批订阅源")}</button>
        <span className="mute">{t("Subscribe in Slack (/feed subscribe), an email digest or any reader to hear about new requests.", "可在 Slack（/feed subscribe）、邮件摘要或任意阅读器中订阅，第一时间获知新请求。")}</span>
      </div>
    </section>
  );
}
