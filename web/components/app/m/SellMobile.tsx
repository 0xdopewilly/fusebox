"use client";
import Link from "next/link";
import { useState } from "react";
import type { Address } from "viem";
import { fuseRegistryAbi } from "@/lib/abi";
import { DEP } from "@/lib/client-chain";
import { OKLINK, fmt, short } from "@/lib/hooks";
import type { Market } from "@/lib/market";
import { useTxQueue } from "@/lib/useTxQueue";
import { useWallet } from "../WalletProvider";
import ConnectChoices from "../ConnectChoices";
import { ManageFuse, useListCircuit } from "../DesignerTools";
import { Glyph, Plate, type GlyphName } from "../Pixel";
import { PageChrome } from "./chrome";
import { MHero, MLabel, MRow, MSeg, MSheet, MSticky } from "./ui";

const GLYPH: Record<number, GlyphName> = { 1: "mine", 2: "approve", 3: "stop", 4: "x402" };
const STEPS: [string, string][] = [
  ["Design the circuit", "NAND gates, plus latch bits if it needs memory. Fuse Studio builds and proves it for you."],
  ["Tape it out on TapeOut", "One transistor per gate on an X Layer processor. You get the circuit NFT."],
  ["List it here", "The registry checks the processor, the gate budget and the netlist, then wallets can install it."],
  ["Earn on every decision", "Each check pays your fee in USD₮0, the no's included. Sell the NFT and the income moves with it."],
];

/** Selling on a phone: earnings first with one Claim, your fuses as rows (price and listing in a sheet), list a new one. */
export default function SellMobile({ market }: { market: Market }) {
  const { account, write } = useWallet();
  const q = useTxQueue<object>();
  const L = useListCircuit(market);
  const [tab, setTab] = useState<"mine" | "list" | "how">("mine");
  const [open, setOpen] = useState<number | null>(null);
  const share = 100 - market.protocolBps / 100;
  const mine = account ? market.fuses.filter((f) => f.designer.toLowerCase() === account.toLowerCase()) : [];
  const claimable = mine.filter((f) => Number(f.earned) > 0);
  const toClaim = claimable.reduce((t, f) => t + Number(f.earned), 0);
  const claim = (fs: typeof mine) => q.start(fs.map((f) => ({ id: `c${f.fuseId}`, label: `Claim fuse #${f.fuseId}`, run: () => write({ address: DEP.registry as Address, abi: fuseRegistryAbi, functionName: "claim", args: [BigInt(f.fuseId), account!] }) })), {});
  const last = q.steps[q.steps.length - 1];
  const status = last && <p className="m mute" role="status">{last.label}: {last.state === "done" ? "done" : last.state === "error" ? last.error : last.state === "skip" ? "not needed" : last.state === "mine" ? "confirming…" : "sign in your wallet…"}{last.hash ? <> · <a className="lime" href={`${OKLINK}/tx/${last.hash}`} target="_blank" rel="noreferrer">tx ↗</a></> : null}</p>;
  const f = open !== null ? mine.find((x) => x.fuseId === open) : undefined;
  const designers = new Map<string, { fuses: number; life: number }>();
  market.fuses.forEach((x) => { const d = designers.get(x.designer) ?? { fuses: 0, life: 0 }; d.fuses++; d.life += Number(x.lifetimeEarned); designers.set(x.designer, d); });

  return (
    <div className="mpage">
      <PageChrome title="Sell a fuse" sub="Earn on every decision"
        info={<>
          <p>A fuse is a product. Tape out a circuit once, list it, and it pays you {share}% of its fee every time a wallet runs a payment through it. Fusebox keeps {market.protocolBps / 100}%.</p>
          <p>Fees are charged in the same call as each decision, so earnings move the moment a wallet uses your fuse. Claim them any time.</p>
          <p>No toolchain needed: <Link href="/app/studio">build, prove and tape one out in Fuse Studio →</Link></p>
        </>} />

      {account && mine.length ? (
        <MHero label="Ready to claim" right={`${mine.length} fuse${mine.length > 1 ? "s" : ""} listed`} value={toClaim.toFixed(4)} unit="USD₮0"
          foot={<><span>{mine.reduce((t, x) => t + x.decisions, 0)} decisions · {share}% to you</span><button className="mh-btn" disabled={q.running || !claimable.length} onClick={() => claim(claimable)}>{claimable.length ? "Claim all" : "Nothing yet"}</button></>} />
      ) : (
        <MHero label="Paid to designers so far" right={`${market.fuses.length} fuses listed`} value={Number(market.totalEarned).toFixed(4)} unit="USD₮0"
          foot={<span>{share}% of every fee goes to the fuse&apos;s designer</span>} />
      )}
      {status}

      <MSeg label="Sell views" items={[["mine", "My fuses"], ["list", "List new"], ["how", "How it works"]]} value={tab} onChange={setTab} />

      {tab === "mine" && (!account ? <>
        <p className="mcap">Connect the wallet that owns your circuit NFTs.</p>
        <ConnectChoices />
      </> : !mine.length ? <>
        <p className="mcap">{short(account)} doesn&apos;t own a listed fuse yet. Build one in Fuse Studio, or list a circuit you&apos;ve already taped out.</p>
      </> : <>
        <div className="mrows">
          {mine.map((x) => (
            <MRow key={x.fuseId} onClick={() => setOpen(x.fuseId)} icon={<Glyph name={GLYPH[x.socket] ?? "studio"} size={16} color={x.listed ? "var(--lime)" : "var(--dim)"} />}
              title={x.meta?.name ?? x.name} sub={`${x.decisions} decisions · ${fmt(x.fee, 4)} / check${x.listed ? "" : " · delisted"}`}
              value={Number(x.earned).toFixed(4)} valueSub="to claim" chev={false} />
          ))}
        </div>
        <p className="m mute" style={{ textAlign: "center" }}>Tap a fuse to change its price or listing</p>
      </>)}

      {tab === "list" && <>
        <p className="mcap">Enter the circuit you taped out on TapeOut. Fusebox reads it, matches its socket and lists it with your fee.</p>
        <label className="mfield"><span className="m">Circuit id</span><input aria-label="Circuit id" value={L.cid} onChange={(e) => L.setCid(e.target.value)} inputMode="numeric" placeholder="e.g. 19" /></label>
        {L.info && <div className="mcard" style={{ padding: 12 }}><div className="mkv">
          <span>Owner</span><span>{short(L.info.owner)}</span><span>Inputs</span><span>{L.info.nIn}</span><span>Gates</span><span>{L.info.gates}{L.info.nState ? ` + ${L.info.nState} latch` : ""}</span><span>Socket</span><span>{L.socket ? L.socket[1] : "no match"}</span>
        </div></div>}
        <label className="mfield"><span className="m">Fee per check · USD₮0</span><input aria-label="Fee per check, USD₮0" value={L.fee} onChange={(e) => L.setFee(e.target.value)} inputMode="decimal" /></label>
        <label className="mfield"><span className="m">Name</span><input aria-label="Fuse name" value={L.fname} onChange={(e) => L.setFname(e.target.value)} maxLength={60} placeholder={L.socket ? `e.g. Strict ${L.socket[1]}` : "e.g. Per-payment cap"} /></label>
        <label className="mfield"><span className="m">One-line summary</span><input aria-label="One-line summary" value={L.fsum} onChange={(e) => L.setFsum(e.target.value)} maxLength={200} placeholder="What it lets through" /></label>
        <details className="mdetails"><summary className="m">Processor</summary><label className="mfield"><span className="m">TapeOut processor</span><input aria-label="Processor" value={L.proc} onChange={(e) => L.setProc(e.target.value)} spellCheck={false} /></label></details>
        {L.problem && <p className="mnote" style={{ color: account ? "var(--red)" : undefined }}>{L.problem}</p>}
        {!account && <ConnectChoices />}
      </>}

      {tab === "how" && <>
        <div className="mrows">
          {STEPS.map(([h, s], i) => <MRow key={h} icon={<span className="m lime" style={{ fontSize: 13 }}>0{i + 1}</span>} title={h} sub={s} chev={false} className="tall" />)}
        </div>
        <MLabel right={`${share}% to designers`}>Earnings ledger</MLabel>
        <div className="mrows">
          {[...designers].map(([d, v]) => <MRow key={d} icon={<Plate address={d} size={22} />} title={short(d)} sub={`${v.fuses} fuse${v.fuses > 1 ? "s" : ""}`} value={v.life.toFixed(4)} valueSub="earned" href={`${OKLINK}/address/${d}`} ext />)}
        </div>
      </>}

      <MSticky>
        {tab === "list"
          ? <button className="btn lime" disabled={q.running || !!L.problem} onClick={() => q.start([{ id: "list", label: "List the circuit", run: L.submit }], {})}>List it as a fuse <span className="k">→</span></button>
          : <><Link className="btn" href="/app/studio">Fuse Studio</Link><button className="btn lime" onClick={() => setTab("list")}>List a fuse <span className="k">→</span></button></>}
      </MSticky>

      <MSheet open={!!f} onClose={() => setOpen(null)} title={f ? f.meta?.name ?? f.name : ""}>
        {f && <>
          <div className="mkv">
            <span>Fuse</span><span>#{f.fuseId} · TapeOut #{f.circuitId}</span><span>Decisions</span><span>{f.decisions}</span>
            <span>Earned</span><span>{fmt(f.lifetimeEarned)} USD₮0</span><span>To claim</span><span>{fmt(f.earned)} USD₮0</span>
          </div>
          <button className="btn lime" style={{ justifyContent: "center", height: 48 }} disabled={q.running || Number(f.earned) <= 0} onClick={() => claim([f])}>Claim {fmt(f.earned, 4)} USD₮0</button>
          {status}
          <ManageFuse f={f} busy={q.running} run={(label, fn) => q.start([{ id: label, label, run: fn }], {})} />
        </>}
      </MSheet>
    </div>
  );
}
