"use client";
import Link from "next/link";
import AcceptOwnership from "./AcceptOwnership";
import { useEffect, useState } from "react";
import { fuseboxWalletAbi } from "@/lib/abi";
import { useTxQueue } from "@/lib/useTxQueue";
import { short, OKLINK } from "@/lib/hooks";
import type { FleetWallet } from "@/app/api/fleet/route";
import { useWallet } from "./WalletProvider";
import ConnectChoices from "./ConnectChoices";
import { Responsive } from "./m/useMobile";
import { PageChrome } from "./m/chrome";
import { MHero, MRow, MStats } from "./m/ui";
import { Glyph, Plate } from "./Pixel";
import Loading from "./Loading";
import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";

const ago = (t: number, zh = false) => { const s = Math.max(0, Date.now() / 1000 - t); return zh ? (s < 90 ? "刚刚" : s < 5400 ? `${Math.round(s / 60)} 分钟前` : s < 129600 ? `${Math.round(s / 3600)} 小时前` : `${Math.round(s / 86400)} 天前`) : s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const STATUS: Record<FleetWallet["status"], [string, string]> = {
  live: ["Live", "lime"], paused: ["Paused", "red"], blown: ["Blown", "red"], "low-fees": ["Low on fees", "amber"], "no-fuses": ["No fuses", "amber"], "no-agent": ["No agent", "amber"],
};
const STATUS_ZH: Record<FleetWallet["status"], string> = { live: "运行中", paused: "已暂停", blown: "已熔断", "low-fees": "费用不足", "no-fuses": "无保险丝", "no-agent": "无智能体" };
const usd = (v: string | number) => { const n = Number(v); return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toFixed(n >= 10 ? 1 : 4); };

/** Every Fusebox wallet the connected address owns, as a fleet: money, fees left, what's blown, today's activity. */
export default function MineView() {
  const { account, write } = useWallet();
  const { t: tr, zh } = useLang();
  const q = useTxQueue<object>();
  const [rows, setRows] = useState<FleetWallet[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!account) { setRows(null); return; }
    let on = true;
    const pull = () => fetch(`/api/fleet?owner=${account}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (!on) return; if (j.wallets) { setRows(j.wallets); setErr(null); } else setErr(j.error ?? "unreachable"); }).catch(() => on && setErr("unreachable"));
    pull(); const id = setInterval(pull, 15000);
    return () => { on = false; clearInterval(id); };
  }, [account, nonce]);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);

  const live = (rows ?? []).filter((r) => !r.paused && !r.blown.length);
  const freezeAll = async () => {
    setArmed(false);
    const ok = await q.start(live.map((r) => ({ id: r.wallet, label: tr(`Freeze ${r.isAtlas ? "Atlas" : short(r.wallet)}`, `冻结 ${r.isAtlas ? "Atlas" : short(r.wallet)}`), run: () => write({ address: r.wallet, abi: fuseboxWalletAbi, functionName: "freeze" }) })), {});
    setNonce((n) => n + 1);
    return ok;
  };
  const cur = q.steps.find((s) => s.state === "sign" || s.state === "mine" || s.state === "error") ?? q.steps[q.steps.length - 1];
  const curText = cur && (cur.state === "done" ? tr("done", "完成") : cur.state === "error" ? (zh && cur.error ? errZh(cur.error) : cur.error) : cur.state === "mine" ? tr("confirming…", "确认中…") : tr("sign in your wallet…", "请在钱包中签名…"));
  const loadErr = zh && err === "unreachable" ? "无法连接" : err;
  const t = rows ? {
    balance: rows.reduce((s, r) => s + Number(r.balance), 0), fees: rows.reduce((s, r) => s + Number(r.feeBalance), 0),
    today: rows.reduce((s, r) => s + r.today.decisions, 0), stopped: rows.reduce((s, r) => s + r.today.stopped, 0),
    alerts: rows.filter((r) => r.status !== "live").length,
  } : null;

  const mobileView = (
    <div className="mpage">
      <PageChrome title={tr("My wallets", "我的钱包")} sub={rows ? tr(`${rows.length} wallet${rows.length === 1 ? "" : "s"} · your fleet`, `${rows.length} 个钱包 · 你的钱包群`) : tr("Your fleet", "你的钱包群")}
        info={<p>{tr(<>Every Fusebox wallet your connected address owns, as one fleet: the money, the fees left, what&apos;s blown and what the agents did today. Read from X Layer; nothing is signed just to look.</>, <>你连接的地址拥有的每个 Fusebox 钱包，汇总成一个钱包群：资金、剩余费用、哪些已熔断，以及智能体今天做了什么。数据从 X Layer 读取；只是查看，无需签名。</>)}</p>} />
      <AcceptOwnership />
      {!account ? <><p className="mcap">{tr("Connect the wallet that owns them. Nothing is signed just to look.", "连接拥有这些钱包的钱包。只是查看，无需签名。")}</p><ConnectChoices /></>
        : !rows ? <Loading label={tr("Finding your wallets in the factory", "正在工厂合约中查找你的钱包")} error={loadErr} /> : <>
          {t && <MHero label={tr("In your wallets", "钱包中的资金")} right={tr(`${rows.length} wallet${rows.length === 1 ? "" : "s"}`, `${rows.length} 个钱包`)} value={usd(t.balance)} unit="USD₮0"
            foot={<><span>{tr("Fees", "费用")} {usd(t.fees)}</span><span>{tr(`${t.today} decisions today`, `今日 ${t.today} 次决策`)}</span></>} tone={t.alerts ? "bad" : undefined} />}
          {t && rows.length > 0 && <MStats items={[[tr("Live", "运行中"), live.length], [tr("Stopped today", "今日拦截"), <span key="s" style={{ color: t.stopped ? "var(--red)" : undefined }}>{t.stopped}</span>], [tr("Need a look", "需关注"), <span key="a" style={{ color: t.alerts ? "#e8b13a" : undefined }}>{t.alerts}</span>]]} />}
          <div className="mrows">
            {rows.map((r) => {
              const label = zh ? STATUS_ZH[r.status] : STATUS[r.status][0];
              return <MRow key={r.wallet} href={r.isAtlas ? "/app" : `/app/w/${r.wallet}`} icon={<Plate address={r.wallet} size={22} />}
                title={r.isAtlas ? "Atlas" : short(r.wallet)} sub={tr(`${label} · ${r.fuses} fuse${r.fuses === 1 ? "" : "s"}${r.blown.length ? ` · ${r.blown.join(", ")} blown` : ""}`, `${label} · ${r.fuses} 个保险丝${r.blown.length ? ` · ${r.blown.join(", ")} 已熔断` : ""}`)}
                value={usd(r.balance)} valueSub={r.covers === null ? "USD₮0" : tr(`fees for ${r.covers}`, `费用够 ${r.covers} 笔`)} />;
            })}
          </div>
          <MRow href="/app/new" className="dashed" icon={<Glyph name="new" size={18} />} title={rows.length ? tr("Wire up another", "再搭建一个") : tr("Wire up your first wallet", "搭建你的第一个钱包")} sub={tr("Give an agent its own wallet with fuses", "给智能体一个带保险丝的专属钱包")} />
          {rows.length > 0 && <button className={`btn danger${armed ? " armed" : ""}`} style={{ justifyContent: "center", height: 48 }} disabled={!live.length || q.running} onClick={() => (armed ? freezeAll() : setArmed(true))}>{armed ? tr(`Freeze all ${live.length}? Tap again`, `冻结全部 ${live.length} 个？再点一次`) : tr("Freeze every agent", "冻结所有智能体")}</button>}
          {cur && <p className={`m ${cur.state === "error" ? "red" : "mute"}`} role="status">{cur.label}{tr(": ", "：")}{curText}</p>}
        </>}
    </div>
  );

  return <Responsive mobile={mobileView} desktop={
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <section className="try-head">
        <h1 className="disp" data-a>{tr(<>My <span className="lime">[wallets]</span>.</>, <>我的<span className="lime">[钱包]</span>。</>)}</h1>
        <p data-a>{tr(<>Every Fusebox wallet your connected address owns, as one fleet: the money, the fees left, what&apos;s blown and what the agents did today. Read from X Layer; nothing is signed just to look.</>, <>你连接的地址拥有的每个 Fusebox 钱包，汇总成一个钱包群：资金、剩余费用、哪些已熔断，以及智能体今天做了什么。数据从 X Layer 读取；只是查看，无需签名。</>)}</p>
      </section>
      <AcceptOwnership />
      <h2 className="sr">{tr("Your wallets", "你的钱包")}</h2>
      {!account ? (
        <div className="empty-card" data-a>
          <div className="m lime">{tr("Not connected", "未连接")}</div>
          <h3>{tr("Connect the wallet that owns them", "连接拥有这些钱包的钱包")}</h3>
          <p>{tr("Fusebox reads every wallet the factory made for your address. Nothing is signed just to look.", "Fusebox 会读取工厂合约为你的地址创建的每个钱包。只是查看，无需签名。")}</p>
          <ConnectChoices />
        </div>
      ) : !rows ? <Loading label={tr("Finding your wallets in the factory", "正在工厂合约中查找你的钱包")} error={loadErr} /> : (
        <>
          {t && rows.length > 0 && (
            <section className="stats m mute fleet-kpi" data-a>
              <div>{tr("Wallets", "钱包")}<b>{rows.length}</b></div>
              <div>{tr("In the wallets", "钱包中的资金")}<b>{usd(t.balance)}<small>USD₮0</small></b></div>
              <div>{tr("Prepaid fees", "预付费用")}<b>{usd(t.fees)}<small>USD₮0</small></b></div>
              <div>{tr("Decisions today", "今日决策")}<b>{t.today}</b></div>
              <div>{tr("Stopped today", "今日拦截")}<b style={{ color: t.stopped ? "var(--red)" : undefined }}>{t.stopped}</b></div>
              <div>{tr("Need a look", "需关注")}<b style={{ color: t.alerts ? "#e8b13a" : undefined }}>{t.alerts}</b></div>
            </section>
          )}
          {rows.length > 0 && (
            <div className="fleet-bar m" data-a>
              <span className="mute">{tr(`${live.length} live · ${rows.length - live.length} paused or blown`, `${live.length} 个运行中 · ${rows.length - live.length} 个已暂停或已熔断`)}</span>
              {cur && <span className={cur.state === "error" ? "red" : "mute"} role="status">{cur.label}{tr(": ", "：")}{curText}</span>}
              <button className={`btn danger${armed ? " armed" : ""}`} disabled={!live.length || q.running} onClick={() => (armed ? freezeAll() : setArmed(true))}>{armed ? tr(`Freeze all ${live.length}? Tap again`, `冻结全部 ${live.length} 个？再点一次`) : tr("Freeze every agent", "冻结所有智能体")}</button>
            </div>
          )}
          <div className="mine-list fleet" data-a>
            {rows.map((r) => {
              const [en, tone] = STATUS[r.status];
              const label = zh ? STATUS_ZH[r.status] : en;
              return (
                <Link key={r.wallet} href={r.isAtlas ? "/app" : `/app/w/${r.wallet}`} className="flt" data-wallet={r.wallet} data-cursor={tr("Open", "打开")}>
                  <div className="flt-id"><span className={`flt-dot ${tone}`} aria-hidden="true" /><div><b>{r.isAtlas ? "Atlas" : short(r.wallet)}</b><span className="m mute">{tr(<>{r.fuses} fuse{r.fuses === 1 ? "" : "s"} · {r.agents} agent{r.agents === 1 ? "" : "s"}{r.approvers ? ` · ${r.approvers} approvers` : ""}</>, <>{r.fuses} 个保险丝 · {r.agents} 个智能体{r.approvers ? ` · ${r.approvers} 位审批人` : ""}</>)}</span></div></div>
                  <div className="flt-c"><span className="m mute">{tr("Balance", "余额")}</span><b>{usd(r.balance)}</b></div>
                  <div className="flt-c"><span className="m mute">{tr("Fees left", "剩余费用")}</span><b className={r.covers !== null && r.covers < 10 ? "amber" : ""}>{usd(r.feeBalance)}</b><small className="m mute">{r.covers === null ? "—" : tr(`≈ ${r.covers} payments`, `≈ ${r.covers} 笔付款`)}</small></div>
                  <div className="flt-c"><span className="m mute">{tr("Today", "今日")}</span><b>{r.today.decisions}</b><small className="m mute">{r.today.stopped ? <span className="red">{tr(`${r.today.stopped} stopped`, `拦截 ${r.today.stopped} 笔`)}</span> : tr("none stopped", "无拦截")}</small></div>
                  <div className="flt-c flt-last"><span className="m mute">{tr("Last decision", "最近决策")}</span>{r.last ? <><b className={r.last.paid ? "" : "red"}>{r.last.paid ? tr("Paid", "已付") : tr("Stopped", "已拦截")} {usd(r.last.amount)}</b><small className="m mute">{ago(r.last.time, zh)}</small></> : <b className="mute">{tr("None yet", "暂无")}</b>}</div>
                  <div className="flt-s m"><span className={`flt-tag ${tone}`}>{label}</span>{r.blown.length ? <small className="red">{r.blown.join(", ")}</small> : null}</div>
                </Link>
              );
            })}
            <div className="flt flt-new">
              <div className="flt-id"><span className="flt-dot" aria-hidden="true" /><div><b>{rows.length ? tr("Wire up another", "再搭建一个") : tr("No wallets yet", "还没有钱包")}</b><span className="m mute">{tr("Give an agent its own wallet with fuses, in a few signatures.", "只需几次签名，就能给智能体一个带保险丝的专属钱包。")}</span></div></div>
              <Link className="btn lime" href="/app/new">{tr("Wire up a wallet", "搭建一个钱包")} <span className="k">→</span></Link>
            </div>
          </div>
          {q.steps.some((s) => s.hash) && <p className="m mute fleet-txs">{q.steps.filter((s) => s.hash).map((s) => <a key={s.id} className="lime" href={`${OKLINK}/tx/${s.hash}`} target="_blank" rel="noreferrer">{s.label} ↗ </a>)}</p>}
        </>
      )}
    </div>
  } />;
}
