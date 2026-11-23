"use client";
import Link from "next/link";
import { useState } from "react";
import { OKLINK, fmt, short } from "@/lib/hooks";
import type { Market } from "@/lib/market";
import { useTxQueue } from "@/lib/useTxQueue";
import { useWallet } from "../WalletProvider";
import ConnectChoices from "../ConnectChoices";
import { claimSteps, ManageFuse, useListCircuit } from "../DesignerTools";
import { Glyph, Plate, type GlyphName } from "../Pixel";
import { PageChrome } from "./chrome";
import { MHero, MLabel, MRow, MSeg, MSheet, MSticky } from "./ui";
import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";

const GLYPH: Record<number, GlyphName> = { 1: "mine", 2: "approve", 3: "stop", 4: "x402" };
const STEPS: [string, string][] = [
  ["Design the circuit", "NAND gates, plus latch bits if it needs memory. Fuse Studio builds and proves it for you."],
  ["Tape it out on TapeOut", "One transistor per gate on an X Layer processor. You get the circuit NFT."],
  ["List it here", "The registry checks the processor, the gate budget and the netlist, then wallets can install it."],
  ["Earn on every decision", "Each check pays your fee in USD₮0, the no's included. Sell the NFT and the income moves with it."],
];
const STEPS_ZH: [string, string][] = [
  ["设计电路", "NAND 门，需要记忆时再加锁存位。Fuse Studio 会帮你构建并证明。"],
  ["在 TapeOut 上流片", "在 X Layer 的处理器上每个门对应一个晶体管。你会得到电路 NFT。"],
  ["在这里上架", "注册表检查处理器、门数预算和网表，之后钱包就可以安装。"],
  ["每次决策都有收益", "每次检查都以 USD₮0 支付你的费用，拒绝的也算。卖掉 NFT，收入也随之转移。"],
];

/** Selling on a phone: earnings first with one Claim, your fuses as rows (price and listing in a sheet), list a new one. */
export default function SellMobile({ market }: { market: Market }) {
  const { account, write } = useWallet();
  const { t, zh } = useLang();
  const q = useTxQueue<object>();
  const L = useListCircuit(market);
  const [tab, setTab] = useState<"mine" | "list" | "how">("mine");
  const [open, setOpen] = useState<number | null>(null);
  const share = 100 - market.protocolBps / 100;
  const mine = account ? market.fuses.filter((f) => f.designer.toLowerCase() === account.toLowerCase()) : [];
  const claimable = mine.filter((f) => Number(f.earned) > 0);
  const toClaim = claimable.reduce((a, f) => a + Number(f.earned), 0);
  const claim = (fs: typeof mine) => q.start(claimSteps(fs, account!, write, zh), {});
  const last = q.steps[q.steps.length - 1];
  const status = last && <p className="m mute" role="status">{last.label}{t(": ", "：")}{last.state === "done" ? t("done", "完成") : last.state === "error" ? (zh && last.error ? errZh(last.error) : last.error) : last.state === "skip" ? t("not needed", "无需操作") : last.state === "mine" ? t("confirming…", "确认中…") : t("sign in your wallet…", "请在钱包中签名…")}{last.hash ? <> · <a className="lime" href={`${OKLINK}/tx/${last.hash}`} target="_blank" rel="noreferrer">tx ↗</a></> : null}</p>;
  const f = open !== null ? mine.find((x) => x.fuseId === open) : undefined;
  const designers = new Map<string, { fuses: number; life: number }>();
  market.fuses.forEach((x) => { const d = designers.get(x.designer) ?? { fuses: 0, life: 0 }; d.fuses++; d.life += Number(x.lifetimeEarned); designers.set(x.designer, d); });

  return (
    <div className="mpage">
      <PageChrome title={t("Sell a fuse", "出售保险丝")} sub={t("Earn on every decision", "每次决策都有收益")}
        info={t(<>
          <p>A fuse is a product. Tape out a circuit once, list it, and it pays you {share}% of its fee every time a wallet runs a payment through it. Fusebox keeps {market.protocolBps / 100}%.</p>
          <p>Fees are charged in the same call as each decision, so earnings move the moment a wallet uses your fuse. Claim them any time.</p>
          <p>No toolchain needed: <Link href="/app/studio">build, prove and tape one out in Fuse Studio →</Link></p>
        </>, <>
          <p>保险丝是一件产品。电路流片一次、上架之后，每当钱包有付款经过它，你就能拿到其费用的 {share}%。Fusebox 保留 {market.protocolBps / 100}%。</p>
          <p>费用在每次决策的同一笔调用中收取，所以钱包一用你的保险丝，收益就立刻到账。随时可以领取。</p>
          <p>无需工具链：<Link href="/app/studio">在 Fuse Studio 中构建、证明并流片 →</Link></p>
        </>)} />

      {account && mine.length ? (
        <MHero label={t("Ready to claim", "可领取")} right={t(`${mine.length} fuse${mine.length > 1 ? "s" : ""} listed`, `已上架 ${mine.length} 个保险丝`)} value={toClaim.toFixed(4)} unit="USD₮0"
          foot={<><span>{t(`${mine.reduce((a, x) => a + x.decisions, 0)} decisions · ${share}% to you`, `${mine.reduce((a, x) => a + x.decisions, 0)} 次决策 · ${share}% 归你`)}</span><button className="mh-btn" disabled={q.running || !claimable.length} onClick={() => claim(claimable)}>{claimable.length ? t("Claim all", "全部领取") : t("Nothing yet", "暂无收益")}</button></>} />
      ) : (
        <MHero label={t("Paid to designers so far", "已支付给设计者")} right={t(`${market.fuses.length} fuses listed`, `已上架 ${market.fuses.length} 个保险丝`)} value={Number(market.totalEarned).toFixed(4)} unit="USD₮0"
          foot={<span>{t(`${share}% of every fee goes to the fuse's designer`, `每笔费用的 ${share}% 付给保险丝的设计者`)}</span>} />
      )}
      {status}

      <MSeg label={t("Sell views", "出售视图")} items={[["mine", t("My fuses", "我的保险丝")], ["list", t("List new", "上架新的")], ["how", t("How it works", "运作方式")]]} value={tab} onChange={setTab} />

      {tab === "mine" && (!account ? <>
        <p className="mcap">{t("Connect the wallet that owns your circuit NFTs.", "连接持有你的电路 NFT 的钱包。")}</p>
        <ConnectChoices />
      </> : !mine.length ? <>
        <p className="mcap">{t(`${short(account)} doesn't own a listed fuse yet. Build one in Fuse Studio, or list a circuit you've already taped out.`, `${short(account)} 还没有已上架的保险丝。可以在 Fuse Studio 中构建一个，或上架你已流片的电路。`)}</p>
      </> : <>
        <div className="mrows">
          {mine.map((x) => (
            <MRow key={x.fuseId} onClick={() => setOpen(x.fuseId)} icon={<Glyph name={GLYPH[x.socket] ?? "studio"} size={16} color={x.listed ? "var(--lime)" : "var(--dim)"} />}
              title={x.meta?.name ?? x.name} sub={t(`${x.decisions} decisions · ${fmt(x.fee, 4)} / check${x.listed ? "" : " · delisted"}`, `${x.decisions} 次决策 · ${fmt(x.fee, 4)} / 次检查${x.listed ? "" : " · 已下架"}`)}
              value={Number(x.earned).toFixed(4)} valueSub={t("to claim", "待领取")} chev={false} />
          ))}
        </div>
        <p className="m mute" style={{ textAlign: "center" }}>{t("Tap a fuse to change its price or listing", "点按保险丝即可修改价格或上架状态")}</p>
      </>)}

      {tab === "list" && <>
        <p className="mcap">{t("Enter the circuit you taped out on TapeOut. Fusebox reads it, matches its socket and lists it with your fee.", "输入你在 TapeOut 上流片的电路。Fusebox 会读取它、匹配插槽，并以你设定的费用上架。")}</p>
        <label className="mfield"><span className="m">{t("Circuit id", "电路编号")}</span><input aria-label={t("Circuit id", "电路编号")} value={L.cid} onChange={(e) => L.setCid(e.target.value)} inputMode="numeric" placeholder={t("e.g. 19", "例如 19")} /></label>
        {L.info && <div className="mcard" style={{ padding: 12 }}><div className="mkv">
          <span>{t("Owner", "所有者")}</span><span>{short(L.info.owner)}</span><span>{t("Inputs", "输入")}</span><span>{L.info.nIn}</span><span>{t("Gates", "门")}</span><span>{L.info.gates}{L.info.nState ? t(` + ${L.info.nState} latch`, ` + ${L.info.nState} 锁存器`) : ""}</span><span>{t("Socket", "插槽")}</span><span>{L.socket ? L.socket[1] : t("no match", "无匹配")}</span>
        </div></div>}
        <label className="mfield"><span className="m">{t("Fee per check · USD₮0", "每次检查的费用 · USD₮0")}</span><input aria-label={t("Fee per check, USD₮0", "每次检查的费用，USD₮0")} value={L.fee} onChange={(e) => L.setFee(e.target.value)} inputMode="decimal" /></label>
        <label className="mfield"><span className="m">{t("Name", "名称")}</span><input aria-label={t("Fuse name", "保险丝名称")} value={L.fname} onChange={(e) => L.setFname(e.target.value)} maxLength={60} placeholder={L.socket ? t(`e.g. Strict ${L.socket[1]}`, `例如 Strict ${L.socket[1]}`) : t("e.g. Per-payment cap", "例如 Per-payment cap")} /></label>
        <label className="mfield"><span className="m">{t("One-line summary", "一句话简介")}</span><input aria-label={t("One-line summary", "一句话简介")} value={L.fsum} onChange={(e) => L.setFsum(e.target.value)} maxLength={200} placeholder={t("What it lets through", "它放行什么")} /></label>
        <details className="mdetails"><summary className="m">{t("Processor", "处理器")}</summary><label className="mfield"><span className="m">{t("TapeOut processor", "TapeOut 处理器")}</span><input aria-label={t("Processor", "处理器")} value={L.proc} onChange={(e) => L.setProc(e.target.value)} spellCheck={false} /></label></details>
        {L.problem && <p className="mnote" style={{ color: account ? "var(--red)" : undefined }}>{L.problem}</p>}
        {!account && <ConnectChoices />}
      </>}

      {tab === "how" && <>
        <div className="mrows">
          {(zh ? STEPS_ZH : STEPS).map(([h, s], i) => <MRow key={i} icon={<span className="m lime" style={{ fontSize: 13 }}>0{i + 1}</span>} title={h} sub={s} chev={false} className="tall" />)}
        </div>
        <MLabel right={t(`${share}% to designers`, `${share}% 归设计者`)}>{t("Earnings ledger", "收益账本")}</MLabel>
        <div className="mrows">
          {[...designers].map(([d, v]) => <MRow key={d} icon={<Plate address={d} size={22} />} title={short(d)} sub={t(`${v.fuses} fuse${v.fuses > 1 ? "s" : ""}`, `${v.fuses} 个保险丝`)} value={v.life.toFixed(4)} valueSub={t("earned", "收益")} href={`${OKLINK}/address/${d}`} ext />)}
        </div>
      </>}

      <MSticky>
        {tab === "list"
          ? <button className="btn lime" disabled={q.running || !!L.problem} onClick={() => q.start([{ id: "list", label: t("List the circuit", "上架电路"), run: L.submit }], {})}>{t("List it as a fuse", "作为保险丝上架")} <span className="k">→</span></button>
          : <><Link className="btn" href="/app/studio">Fuse Studio</Link><button className="btn lime" onClick={() => setTab("list")}>{t("List a fuse", "上架保险丝")} <span className="k">→</span></button></>}
      </MSticky>

      <MSheet open={!!f} onClose={() => setOpen(null)} title={f ? f.meta?.name ?? f.name : ""}>
        {f && <>
          <div className="mkv">
            <span>{t("Fuse", "保险丝")}</span><span>#{f.fuseId} · TapeOut #{f.circuitId}</span><span>{t("Decisions", "决策")}</span><span>{f.decisions}</span>
            <span>{t("Earned", "收益")}</span><span>{fmt(f.lifetimeEarned)} USD₮0</span><span>{t("To claim", "待领取")}</span><span>{fmt(f.earned)} USD₮0</span>
          </div>
          <button className="btn lime" style={{ justifyContent: "center", height: 48 }} disabled={q.running || Number(f.earned) <= 0} onClick={() => claim([f])}>{t("Claim", "领取")} {fmt(f.earned, 4)} USD₮0</button>
          {status}
          <ManageFuse f={f} busy={q.running} run={(label, fn) => q.start([{ id: label, label, run: fn }], {})} />
        </>}
      </MSheet>
    </div>
  );
}
