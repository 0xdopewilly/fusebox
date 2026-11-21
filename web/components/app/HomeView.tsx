"use client";
import Link from "next/link";
import { DEP } from "@/lib/client-chain";
import { useMarket } from "@/lib/useMarket";
import { Glyph, type GlyphName } from "./Pixel";
import { Responsive } from "./m/useMobile";
import { PageChrome } from "./m/chrome";

/** Atlas, the public demo wallet, has its own page like any other wallet. */
export const ATLAS_PATH = `/app/w/${DEP.atlas}`;

interface Door { n: string; who: string; g: GlyphName; title: string; body: string; gets: string[]; cta: [string, string]; more: [string, string][] }
const DOORS: Door[] = [
  {
    n: "01", who: "For agent owners", g: "mine", title: "Protect an agent's money",
    body: "Give your AI agent a wallet it can only pay from through your rules. A scam message, a fake invoice or a bad prompt can't talk its way past them.",
    gets: ["Set up in three taps", "A daily cap, saved payees, a breaker, approvals, no double-paid invoices", "A Telegram message for every payment"],
    cta: ["/app/new", "Wire up a wallet"], more: [["/app/mine", "My wallets"], ["/app/assistant", "Pay by chatting"], ["/app/approve", "Approvals"]],
  },
  {
    n: "02", who: "For builders", g: "studio", title: "Build a rule. No code.",
    body: "Pick conditions and combine them with all, any, at least or none. Fusebox turns the rule into TapeOut gates, trims what it doesn't need and checks it against your rule before it goes on-chain.",
    gets: ["Taped out from your own wallet", "Guards real payments in Fusebox wallets", "You earn a fee every time it decides"],
    cta: ["/app/studio", "Open Fuse Studio"], more: [["/app/market", "Fuse market"], ["/app/designers", "Sell a fuse"], ["/app/simulate", "Line simulator"]],
  },
  {
    n: "03", who: "Just looking", g: "rob", title: "Try to scam an AI agent",
    body: "Atlas is a live AI agent with real money on X Layer. Pick a scam and watch its fuses decide in seconds. No wallet needed, and nothing moves.",
    gets: ["Free, takes a minute", "Every answer comes from TapeOut circuits on mainnet", "See exactly which fuse said no, and why"],
    cta: ["/app/try", "Try to scam it"], more: [[ATLAS_PATH, "Watch Atlas live"], ["/app/rob", "Talk an AI into it"], ["/app/x402", "Pay per call"]],
  },
];

function Stats() {
  const { data } = useMarket();
  if (!data) return null;
  const listed = data.fuses.filter((f) => f.listed).length;
  return (
    <div className="hm-stats m">
      <span><span className="live" />Live on X Layer mainnet</span>
      <span><b>{listed}</b> fuses in the market</span>
      <span><b>{data.totalDecisions.toLocaleString("en-US")}</b> decisions by TapeOut circuits</span>
      <span><b>{Number(data.totalEarned).toFixed(4)}</b> USD₮0 paid to designers</span>
    </div>
  );
}

function DoorCard({ d }: { d: Door }) {
  return (
    <article className="door" data-a>
      <div className="door-top m"><span className="lime">{d.n}</span><span className="mute">{d.who}</span><Glyph name={d.g} size={20} /></div>
      <h2 className="door-t disp">{d.title}</h2>
      <p className="door-b">{d.body}</p>
      <ul className="door-l">{d.gets.map((x) => <li key={x}>{x}</li>)}</ul>
      <Link className="btn lime door-cta" href={d.cta[0]}>{d.cta[1]} <span className="k">→</span></Link>
      <div className="door-more m">{d.more.map(([h, t]) => <Link key={h} href={h}>{t}</Link>)}</div>
    </article>
  );
}

/** The app's front door: three ways in, by what you came to do. */
export default function HomeView() {
  const doors = <div className="doors">{DOORS.map((d) => <DoorCard key={d.n} d={d} />)}</div>;
  return (
    <Responsive
      mobile={
        <div className="mpage">
          <PageChrome title="Fusebox" sub="Pick a way in" info={<p>Fusebox wallets let an AI agent pay only through fuses: TapeOut circuits on X Layer that check every payment. One no, and nothing moves. Pick what you came to do.</p>} />
          <p className="mcap">What did you come to do?</p>
          {doors}
          <Stats />
        </div>
      }
      desktop={
        <div className="page">
          <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <section className="try-head hm-head">
            <h1 className="disp" data-a>What did you <span className="lime">[come to do]</span>?</h1>
            <p data-a>Fusebox wallets let an AI agent pay only through fuses: TapeOut circuits on X Layer that check every payment. One no, and nothing moves.</p>
          </section>
          {doors}
          <Stats />
        </div>
      }
    />
  );
}
