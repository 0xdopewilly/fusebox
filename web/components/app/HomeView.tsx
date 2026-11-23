"use client";
import Link from "next/link";
import { DEP } from "@/lib/client-chain";
import { useMarket } from "@/lib/useMarket";
import { Glyph, type GlyphName } from "./Pixel";
import { Responsive } from "./m/useMobile";
import { PageChrome } from "./m/chrome";
import { useLang } from "@/lib/i18n";

/** Atlas, the public demo wallet, has its own page like any other wallet. */
export const ATLAS_PATH = `/app/w/${DEP.atlas}`;

interface DoorText { who: string; title: string; body: string; gets: string[]; cta: string; more: string[] }
interface Door { n: string; who: string; g: GlyphName; title: string; body: string; gets: string[]; cta: [string, string]; more: [string, string][]; zh: DoorText }
const DOORS: Door[] = [
  {
    n: "01", who: "For agent owners", g: "mine", title: "Protect an agent's money",
    body: "Give your AI agent a wallet it can only pay from through your rules. A scam message, a fake invoice or a bad prompt can't talk its way past them.",
    gets: ["Set up in three taps", "A daily cap, saved payees, a breaker, approvals, no double-paid invoices", "A Telegram message for every payment"],
    cta: ["/app/new", "Wire up a wallet"], more: [["/app/mine", "My wallets"], ["/app/assistant", "Pay by chatting"], ["/app/approve", "Approvals"]],
    zh: {
      who: "给智能体所有者", title: "守护智能体的钱",
      body: "给你的 AI 智能体一个钱包，它只能按你的规则付款。诈骗消息、假发票或恶意提示词，都没法说服它绕过这些规则。",
      gets: ["三步完成设置", "每日限额、已保存的收款方、Breaker、审批，发票不会被重复支付", "每笔付款都会发一条 Telegram 消息"],
      cta: "搭建一个钱包", more: ["我的钱包", "聊天付款", "审批"],
    },
  },
  {
    n: "02", who: "For builders", g: "studio", title: "Build a rule. No code.",
    body: "Pick conditions and combine them with all, any, at least or none. Fusebox turns the rule into TapeOut gates, trims what it doesn't need and checks it against your rule before it goes on-chain.",
    gets: ["Taped out from your own wallet", "Guards real payments in Fusebox wallets", "You earn a fee every time it decides"],
    cta: ["/app/studio", "Open Fuse Studio"], more: [["/app/market", "Fuse market"], ["/app/designers", "Sell a fuse"], ["/app/simulate", "Line simulator"]],
    zh: {
      who: "给开发者", title: "零代码搭建规则。",
      body: "选好条件，用“全部”“任一”“至少”或“都不”把它们组合起来。Fusebox 把规则转换成 TapeOut 门电路，去掉用不到的部分，并在上链前对照你的规则做核验。",
      gets: ["从你自己的钱包流片", "守护 Fusebox 钱包中的真实付款", "它每做一次决策，你都能赚一笔费用"],
      cta: "打开 Fuse Studio", more: ["保险丝市场", "出售保险丝", "线路模拟器"],
    },
  },
  {
    n: "03", who: "Just looking", g: "rob", title: "Try to scam an AI agent",
    body: "Atlas is a live AI agent with real money on X Layer. Pick a scam and watch its fuses decide in seconds. No wallet needed, and nothing moves.",
    gets: ["Free, takes a minute", "Every answer comes from TapeOut circuits on mainnet", "See exactly which fuse said no, and why"],
    cta: ["/app/try", "Try to scam it"], more: [[ATLAS_PATH, "Watch Atlas live"], ["/app/rob", "Talk an AI into it"], ["/app/x402", "Pay per call"]],
    zh: {
      who: "随便看看", title: "试着骗一个 AI 智能体",
      body: "Atlas 是 X Layer 上一个持有真实资金、正在运行的 AI 智能体。挑一种骗局，几秒内看它的保险丝做出决策。无需钱包，资金不会移动。",
      gets: ["免费，一分钟搞定", "每个答案都来自主网上的 TapeOut 电路", "清楚看到是哪个保险丝说了“不”，以及原因"],
      cta: "试着骗它", more: ["实时观看 Atlas", "用话术说服 AI", "按次付费"],
    },
  },
];

function Stats() {
  const { data } = useMarket();
  const { t } = useLang();
  if (!data) return null;
  const listed = data.fuses.filter((f) => f.listed).length;
  return (
    <div className="hm-stats m">
      <span><span className="live" />{t("Live on X Layer mainnet", "已在 X Layer 主网上线")}</span>
      <span>{t(<><b>{listed}</b> fuses in the market</>, <>市场中有 <b>{listed}</b> 个保险丝</>)}</span>
      <span>{t(<><b>{data.totalDecisions.toLocaleString("en-US")}</b> decisions by TapeOut circuits</>, <>TapeOut 电路已做出 <b>{data.totalDecisions.toLocaleString("en-US")}</b> 次决策</>)}</span>
      <span>{t(<><b>{Number(data.totalEarned).toFixed(4)}</b> USD₮0 paid to designers</>, <>已向设计者支付 <b>{Number(data.totalEarned).toFixed(4)}</b> USD₮0</>)}</span>
    </div>
  );
}

function DoorCard({ d }: { d: Door }) {
  const { zh } = useLang();
  const x: DoorText = zh ? d.zh : { who: d.who, title: d.title, body: d.body, gets: d.gets, cta: d.cta[1], more: d.more.map(([, t]) => t) };
  return (
    <article className="door" data-a>
      <div className="door-top m"><span className="lime">{d.n}</span><span className="mute">{x.who}</span><Glyph name={d.g} size={20} /></div>
      <h2 className="door-t disp">{x.title}</h2>
      <p className="door-b">{x.body}</p>
      <ul className="door-l">{x.gets.map((g) => <li key={g}>{g}</li>)}</ul>
      <Link className="btn lime door-cta" href={d.cta[0]}>{x.cta} <span className="k">→</span></Link>
      <div className="door-more m">{d.more.map(([h], i) => <Link key={h} href={h}>{x.more[i]}</Link>)}</div>
    </article>
  );
}

/** The app's front door: three ways in, by what you came to do. */
export default function HomeView() {
  const { t } = useLang();
  const doors = <div className="doors">{DOORS.map((d) => <DoorCard key={d.n} d={d} />)}</div>;
  return (
    <Responsive
      mobile={
        <div className="mpage">
          <PageChrome title="Fusebox" sub={t("Pick a way in", "选择入口")} info={<p>{t("Fusebox wallets let an AI agent pay only through fuses: TapeOut circuits on X Layer that check every payment. One no, and nothing moves. Pick what you came to do.", "Fusebox 钱包让 AI 智能体只能通过保险丝付款：保险丝是 X Layer 上的 TapeOut 电路，检查每一笔付款。只要一个说“不”，资金就不会移动。选择你想做的事。")}</p>} />
          <p className="mcap">{t("What did you come to do?", "你来这里想做什么？")}</p>
          {doors}
          <Stats />
        </div>
      }
      desktop={
        <div className="page">
          <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <section className="try-head hm-head">
            <h1 className="disp" data-a>{t(<>What did you <span className="lime">[come to do]</span>?</>, <>你想<span className="lime">[做什么]</span>？</>)}</h1>
            <p data-a>{t("Fusebox wallets let an AI agent pay only through fuses: TapeOut circuits on X Layer that check every payment. One no, and nothing moves.", "Fusebox 钱包让 AI 智能体只能通过保险丝付款：保险丝是 X Layer 上的 TapeOut 电路，检查每一笔付款。只要一个说“不”，资金就不会移动。")}</p>
          </section>
          {doors}
          <Stats />
        </div>
      }
    />
  );
}
