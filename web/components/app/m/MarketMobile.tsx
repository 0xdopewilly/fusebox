"use client";
import Link from "next/link";
import { ATLAS_PATH } from "../HomeView";
import { useState } from "react";
import { LAYERS } from "@/lib/fuses";
import { SOCKETS } from "@/lib/sockets";
import { metaSource } from "@/lib/fuseMeta";
import { OKLINK, fmt, short } from "@/lib/hooks";
import type { useMarket } from "@/lib/useMarket";
import Netlist from "@/components/landing/Netlist";
import ChainNetlist from "../ChainNetlist";
import MarketInstall from "../MarketInstall";
import { Glyph, type GlyphName } from "../Pixel";
import { PageChrome } from "./chrome";
import { MChips, MHero, MLabel, MRow, MSheet, MStats } from "./ui";

type Market = NonNullable<ReturnType<typeof useMarket>["data"]>;
type Fuse = Market["fuses"][number];
const GLYPH: Record<number, GlyphName> = { 1: "mine", 2: "approve", 3: "stop", 4: "x402" };
const KINDS = [["all", "All"], ["1", "Daily caps"], ["2", "Payees"], ["3", "Breakers"], ["4", "Approvals"]] as const;

/** A fuse's thumbnail: its real schematic for the four shipped fuses, its socket's mark for the rest. */
function Thumb({ f }: { f: Fuse }) {
  const layout = f.original ? LAYERS.find((l) => l.key === f.key) : undefined;
  return layout ? <span className="mr-net"><Netlist f={layout} /></span> : <Glyph name={GLYPH[f.socket] ?? "studio"} size={18} />;
}

/** The market on a phone: three numbers, a filter, one row per fuse with its price; a row opens the fuse's screen. */
export function MarketMobile({ data }: { data: Market }) {
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("all");
  const list = data.fuses.filter((f) => kind === "all" || String(f.socket) === kind);
  return (
    <div className="mpage">
      <PageChrome title="Fuse market" sub="TapeOut circuits you can install"
        info={<>
          <p>Every fuse here is a NAND circuit taped out on TapeOut and listed in Fusebox&apos;s registry on X Layer.</p>
          <p>Wallets install fuses on their line. Each time a fuse checks a payment, the wallet pays its fee: {100 - data.protocolBps / 100}% to the fuse&apos;s designer, {data.protocolBps / 100}% to Fusebox (capped at 20%).</p>
          <p>Protocol earned so far: {Number(data.protocolEarned).toFixed(5)} USD₮0. Processor {data.fuses[0] ? short(data.fuses[0].processor) : "—"}.</p>
        </>} />
      <MStats items={[["Fuses", data.fuses.length], ["Decisions", data.totalDecisions], ["Paid out", Number(data.totalEarned).toFixed(3), "USD₮0"]]} />
      <MChips label="Filter fuses" items={KINDS} value={kind} onChange={setKind} />
      <div className="mrows">
        {list.map((f) => (
          <MRow key={f.fuseId} href={`/app/fuse/${f.fuseId}`} icon={<Thumb f={f} />} className="has-thumb"
            title={f.meta?.name ?? f.name} sub={`${(f.meta?.name ?? f.name) !== SOCKETS[f.socket]?.name ? `${SOCKETS[f.socket]?.name ?? "Fuse"} · ` : ""}TapeOut #${f.circuitId}${f.onAtlas ? " · on Atlas" : ""}${f.listed ? "" : " · delisted"}`}
            value={fmt(f.fee, 4)} valueSub="per check" />
        ))}
        {!list.length && <p className="mnote" style={{ padding: "14px 0" }}>No fuse of this kind is listed yet.</p>}
      </div>
      <MRow href="/app/studio" className="dashed" icon={<Glyph name="studio" size={18} />} title="Your fuse here" sub="Design one, earn on every decision" />
    </div>
  );
}

/** One fuse on a phone: its price, its netlist, install; the pinout and on-chain details sit in sheets. */
export function FuseMobile({ data, f }: { data: Market; f: Fuse }) {
  const [sheet, setSheet] = useState<"pins" | "chain" | null>(null);
  const spec = SOCKETS[f.socket];
  const layout = f.original ? LAYERS.find((l) => l.key === f.key) : undefined;
  const meta = f.meta;
  const name = meta?.name ?? f.name;
  const src = metaSource(f.metadataURI);
  return (
    <div className="mpage">
      <PageChrome title={name} sub={`${spec?.name ?? `Socket ${f.socket}`} · circuit #${f.circuitId}`} back="/app/market"
        info={<><p>{meta?.summary ?? spec?.say ?? ""}</p>{meta?.description && <p>{meta.description}</p>}<p>The wallet derives every input from its own state. The agent&apos;s memo never reaches the circuit; one output bit decides.</p></>} />
      <MHero label="Fee per check" right={f.listed ? "Listed" : "Delisted"} value={fmt(f.fee, 4)} unit="USD₮0"
        foot={<><span>{f.decisions} decisions</span><span>Earned {Number(f.lifetimeEarned).toFixed(4)}</span></>} />
      <p className="mcap">{meta?.summary ?? spec?.say ?? ""}</p>
      <div className="mcard m-net">
        <div className="m mute" style={{ marginBottom: 8 }}>Netlist · read from TapeOut</div>
        <div className="sch">{layout && <Netlist f={layout} />}<ChainNetlist processor={f.processor} circuitId={f.circuitId} nIn={f.nIn} pinned={f.netlistHash} draw={!layout} /></div>
      </div>
      <MStats items={[["Gates", f.gates, f.nState ? `+${f.nState} latch` : undefined], ["Inputs", f.nIn], ["Listed", f.listedAt ? new Date(f.listedAt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "—"]]} />
      {meta?.rule && <div className="mcard" style={{ padding: 12 }}><div className="m mute">Rule</div><code className="m" style={{ display: "block", marginTop: 8, color: "var(--ink)", textTransform: "none", letterSpacing: 0, overflowWrap: "anywhere" }}>{meta.rule}</code></div>}
      {f.listed ? <MarketInstall fuseId={f.fuseId} name={name} /> : <p className="mnote" style={{ color: "var(--red)" }}>Delisted: wallets already running it keep it, but it can&apos;t be installed.</p>}
      <MLabel>More</MLabel>
      <div className="mrows">
        {f.listed && <MRow href={`/app/simulate?f=${f.fuseId}`} icon={<Glyph name="sim" size={16} />} title="Try it on payments" sub="In the line simulator" />}
        <MRow onClick={() => setSheet("pins")} icon={<Glyph name="docs" size={16} />} title="Pinout" sub="What the wallet tells the circuit" />
        <MRow onClick={() => setSheet("chain")} icon={<Glyph name="ext" size={16} />} title="On X Layer" sub="Processor, designer, netlist hash" />
        {f.onAtlas && <MRow href={ATLAS_PATH} icon={<Glyph name="mine" size={16} />} title="Running on Atlas" sub="See it decide live" />}
      </div>
      <MSheet open={sheet === "pins"} onClose={() => setSheet(null)} title="Pinout">
        <div className="mrows">{(spec?.pins ?? []).map(([p, n, d]) => <MRow key={p} title={<span className="m lime" style={{ fontSize: 13 }}>{p}</span>} sub={d} value={n} valueSub="bits" chev={false} />)}</div>
        <p className="mnote">One output bit: 1 lets the payment through.</p>
      </MSheet>
      <MSheet open={sheet === "chain"} onClose={() => setSheet(null)} title="On X Layer">
        <div className="mkv">
          <span>Processor</span><span><a href={`${OKLINK}/address/${f.processor}`} target="_blank" rel="noreferrer">{short(f.processor)} ↗</a></span>
          <span>Circuit</span><span>#{f.circuitId}</span>
          <span>Designer</span><span><a href={`${OKLINK}/address/${f.designer}`} target="_blank" rel="noreferrer">{short(f.designer)} ↗</a></span>
          <span>Netlist hash</span><span>{f.netlistHash.slice(0, 10)}…{f.netlistHash.slice(-6)}</span>
          <span>Description</span><span>{src === "on-chain" ? "stored on-chain" : src === "link" ? "linked" : "none"}</span>
          {meta?.source && <><span>Source</span><span><a href={meta.source} target="_blank" rel="noreferrer">code ↗</a></span></>}
          <span>Split</span><span>{100 - data.protocolBps / 100}% designer · {data.protocolBps / 100}% Fusebox</span>
        </div>
      </MSheet>
    </div>
  );
}
