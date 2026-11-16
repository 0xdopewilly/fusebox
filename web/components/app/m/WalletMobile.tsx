"use client";
import Link from "next/link";
import { useState } from "react";
import type { Atlas, DecisionRow, FuseSlot } from "@/lib/atlas";
import { LAYERS } from "@/lib/fuses";
import { describe } from "@/lib/sockets";
import { OKLINK, fmt, short } from "@/lib/hooks";
import Netlist from "@/components/landing/Netlist";
import { useWallet } from "../WalletProvider";
import OwnerConsole from "../OwnerConsole";
import SpendView from "../SpendView";
import DecisionTools from "../DecisionTools";
import { Glyph, Plate } from "../Pixel";
import { PageChrome } from "./chrome";
import { MActions, MHero, MLabel, MRow, MSeg, MSheet, MStats, type Action } from "./ui";

const when = (t: number) => {
  const s = Date.now() / 1000 - t;
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t * 1000).toISOString().slice(5, 10).replace("-", "/");
};
const verdict = (s: string) => (s === "pass" ? <span className="mtag ok">Holds</span> : <span className="mtag no">{s === "blew" ? "Blew" : s === "untrusted" ? "Untrusted" : "Failed"}</span>);

function fuseText(f: FuseSlot) {
  if (f.original === false) return `${f.summary ?? "A rival design for this socket."} Settings: ${describe(f.socket, f.a, f.b, f.unit, f.paramLabels)}.`;
  if (f.key === "daily-cap") return `No more than ${f.a} USD₮0 a UTC day. ${Number(f.spentToday).toFixed(2)} spent today.`;
  if (f.key === "payee-guard") return `Saved payees only. A new payee gets up to ${f.b} USD₮0 until its ${f.a}-hour cooling-off ends.`;
  if (f.key === "breaker") return f.latched ? "Blown: it tripped on a stranger and stays blown until the owner resets it." : "Trips on a payment to a stranger and stays blown until the owner resets it.";
  if (f.key === "approval-2of3") return `Over ${f.a} USD₮0, two of three approvers must sign that exact payment.`;
  return "";
}

/** The wallet on a phone: the balance, the few things you do, then Activity / Fuses / Spend / Owner. */
export default function WalletMobile({ a, fresh }: { a: Atlas; fresh: Set<number> }) {
  const { account } = useWallet();
  const owner = !!account && account.toLowerCase() === a.owner.toLowerCase();
  const [tab, setTab] = useState<"act" | "fuses" | "spend" | "owner">("act");
  const [dec, setDec] = useState<DecisionRow | null>(null);
  const [fuse, setFuse] = useState<FuseSlot | null>(null);
  const [tools, setTools] = useState(false);
  const [shown, setShown] = useState(12);
  const [copied, setCopied] = useState(false);

  const cap = a.fuses.find((f) => f.key === "daily-cap" && f.original !== false) ?? a.fuses.find((f) => f.key === "daily-cap");
  const blown = a.fuses.find((f) => f.latched);
  const perDecision = a.fuses.reduce((t, f) => t + Number(f.fee), 0);
  const left = perDecision > 0 ? Math.floor(Number(a.feeBalance) / perDecision) : null;
  const isPayee = (addr: string) => a.payees.some((p) => p.address.toLowerCase() === addr.toLowerCase());
  const copy = () => { navigator.clipboard?.writeText(a.wallet); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  const actions: Action[] = a.isAtlas
    ? [{ icon: "rob", label: "Try a scam", href: "/app/try" }, { icon: "sim", label: "Test a line", href: "/app/simulate" }, { icon: "copy", label: copied ? "Copied" : "Copy", onClick: copy }, { icon: "ext", label: "OKLink", href: `${OKLINK}/address/${a.wallet}`, ext: true }]
    : [{ icon: "copy", label: copied ? "Copied" : "Copy", onClick: copy }, { icon: "ext", label: "OKLink", href: `${OKLINK}/address/${a.wallet}`, ext: true }, { icon: "sim", label: "Test a line", href: "/app/simulate" }, { icon: "new", label: "Wire up", href: "/app/new" }];
  const tabs = [["act", "Activity"], ["fuses", "Fuses"], ["spend", "Spend"], ...(owner ? [["owner", "Owner"] as const] : [])] as const;

  return (
    <div className="mpage">
      <PageChrome
        title={a.isAtlas ? "Atlas" : "Wallet"}
        sub={a.isAtlas ? "Live demo wallet" : short(a.wallet)}
        info={<>
          <p>{a.isAtlas ? "Atlas is a live AI-agent wallet on X Layer, open to everyone. Its agent can only pay through the fuses on its line." : "A Fusebox wallet on X Layer. Its agent can only pay through the fuses on its line."}</p>
          <p>Every fuse is a circuit taped out on TapeOut. A payment reaches the payee only if all {a.fuses.length} say yes; one no and nothing moves.</p>
          <p>Wallet <span className="m">{a.wallet}</span> · owner {short(a.owner)}.{a.isAtlas && <> <a href={`https://repo.sourcify.dev/196/${a.wallet}`} target="_blank" rel="noreferrer">Verified source ↗</a></>}</p>
        </>}
      />
      <MHero
        label="In the wallet"
        right={a.paused ? "Paused" : blown ? `${blown.name} blown` : <><i className="kc-live" />Line closed</>}
        tone={a.paused || blown ? "bad" : undefined}
        value={Number(a.balance).toFixed(4)} unit="USD₮0"
        foot={<><span>{cap ? `Spent today ${Number(cap.spentToday).toFixed(2)} / ${cap.a}` : `${a.counts.decisions} decisions`}</span><span>{left !== null ? `Fees cover ≈ ${left}` : ""}</span></>}
      />
      {(a.paused || blown) && <p className="mnote">{a.paused ? "The owner froze this wallet; nothing pays until they unfreeze it." : `${blown!.name} is blown. Nothing can be paid until the owner resets it.`}</p>}
      <MActions items={actions} />
      <MSeg label="Wallet views" items={tabs} value={tab} onChange={setTab} />

      {tab === "act" && <>
        <MStats items={[["Decisions", a.counts.decisions], ["Paid", <span key="p" className="lime">{a.counts.allowed}</span>], ["Stopped", <span key="s" style={{ color: "var(--red)" }}>{a.counts.blocked}</span>]]} />
        {a.historyLoading && <p className="m mute" role="status"><span className="live" />Reading the history from X Layer…</p>}
        <div className="mrows">
          {a.decisions.slice(0, shown).map((r) => {
            const blew = a.fuses.filter((_, i) => r.status[i] !== "pass").map((f) => f.name);
            return (
              <MRow key={r.id} className={fresh.has(r.id) ? "new" : ""} onClick={() => setDec(r)}
                icon={<Glyph name={r.allowed ? "approve" : "stop"} size={16} color={r.allowed ? "var(--lime)" : "var(--red)"} />}
                title={r.memo || "No memo"}
                sub={`#${r.id} · ${r.allowed ? (isPayee(r.to) ? "saved payee" : "paid") : blew.length ? `${blew[0]} blew` : "stopped"} · ${when(r.time)}`}
                value={Number(r.amount).toFixed(2)}
                valueSub={<span className={`mtag ${r.allowed ? "ok" : "no"}`}>{r.allowed ? "Paid" : "Stopped"}</span>} chev={false} />
            );
          })}
        </div>
        {shown < a.decisions.length && <button className="btn" style={{ justifyContent: "center" }} onClick={() => setShown((n) => n + 20)}>Show older · {a.decisions.length - shown} more</button>}
        {!a.decisions.length && !a.historyLoading && <p className="mnote">No payments yet. Every decision the agent makes lands here, paid or stopped.</p>}
        <MRow icon={<Glyph name="docs" size={16} />} title="Export, feed and badge" sub="CSV · JSON feed · status badge" onClick={() => setTools(true)} />
      </>}

      {tab === "fuses" && <>
        <MLabel right={`${a.fuses.length} in series`}>The line</MLabel>
        <div className="mrows">
          {a.fuses.map((f) => (
            <MRow key={f.slot} onClick={() => setFuse(f)} icon={<Glyph name={f.key === "daily-cap" ? "mine" : f.key === "payee-guard" ? "approve" : f.key === "breaker" ? "stop" : "x402"} size={16} color={f.latched ? "var(--red)" : "var(--lime)"} />}
              title={f.name} sub={`TapeOut #${f.circuitId} · ${f.gates} gates`} value={fmt(f.fee, 4)} valueSub={f.latched ? <span className="mtag no">Blown</span> : <span className="mtag ok">Holds</span>} chev={false} />
          ))}
        </div>
        <MLabel right={a.payees.length}>Saved payees</MLabel>
        <div className="mrows">
          {a.payees.length ? a.payees.map((p) => <MRow key={p.address} icon={<Plate address={p.address} size={22} />} title={short(p.address)} sub={`since ${new Date(p.since * 1000).toISOString().slice(0, 10)}`} href={`${OKLINK}/address/${p.address}`} ext />)
            : <p className="mnote" style={{ padding: "12px 0" }}>None yet. Payee Guard lets saved payees through.</p>}
        </div>
        <MLabel right="2 of 3 sign">Approvers</MLabel>
        <div className="mrows">
          {a.approvers.filter((p) => !/^0x0{40}$/i.test(p)).map((p, i) => <MRow key={p} icon={<Plate address={p} size={22} />} title={short(p)} sub={`Seat ${i + 1}`} href={`${OKLINK}/address/${p}`} ext />)}
        </div>
      </>}

      {tab === "spend" && <SpendView wallet={a.wallet} refreshKey={a.counts.decisions} />}
      {tab === "owner" && owner && <OwnerConsole data={a} />}

      <MSheet open={!!dec} onClose={() => setDec(null)} title={dec ? `Decision #${dec.id}` : ""}>
        {dec && <>
          <MHero label={dec.allowed ? "Paid" : "Stopped"} right={when(dec.time)} value={Number(dec.amount).toFixed(4)} unit="USD₮0" tone={dec.allowed ? undefined : "bad"}
            foot={<span>To {short(dec.to)} · {isPayee(dec.to) ? "saved payee" : "stranger"}</span>} />
          <p className="mcap">“{dec.memo}”</p>
          <div className="mrows">{a.fuses.map((f, i) => <MRow key={f.slot} title={f.name} sub={`TapeOut #${f.circuitId}`} value={verdict(dec.status[i])} chev={false} />)}</div>
          <div className="mkv">
            <span>Time</span><span>{new Date(dec.time * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
            <span>Block</span><span>{dec.block.toLocaleString("en-US")}</span>
            <span>Fees</span><span>{fmt(dec.fee)} USD₮0</span>
            <span>Payee</span><span><a href={`${OKLINK}/address/${dec.to}`} target="_blank" rel="noreferrer">{short(dec.to)} ↗</a></span>
          </div>
          <div className="mbtns">
            <a className="btn" href={`${OKLINK}/tx/${dec.tx}`} target="_blank" rel="noreferrer">Transaction ↗</a>
            {!dec.allowed && a.fuses.some((x, i) => x.key === "approval-2of3" && dec.status[i] === "blew")
              ? <Link className="btn lime" href={`/app/approve?wallet=${a.wallet}&to=${dec.to}&amount=${dec.amount}`}>Approve it →</Link>
              : <Link className="btn" href={`/app/simulate`}>Test a line →</Link>}
          </div>
        </>}
      </MSheet>

      <MSheet open={!!fuse} onClose={() => setFuse(null)} title={fuse?.name}>
        {fuse && (() => { const layout = fuse.original ? LAYERS.find((l) => l.key === fuse.key) : null; return <>
          <p className="mcap">{fuseText(fuse)}</p>
          {layout && <div className="mcard" style={{ padding: 12 }}><Netlist f={layout} /><div className="m mute" style={{ marginTop: 8 }}>Real netlist · {fuse.gates} gates{fuse.nState ? ` · ${fuse.nState} state bit` : ""}</div></div>}
          <div className="mkv">
            <span>TapeOut circuit</span><span><a href={`${OKLINK}/address/${fuse.processor}`} target="_blank" rel="noreferrer">#{fuse.circuitId} ↗</a></span>
            <span>Fee per check</span><span>{fmt(fuse.fee)} USD₮0</span>
            <span>Decisions</span><span>{fuse.decisions}</span>
            <span>Earned</span><span>{fmt(fuse.lifetimeEarned)} USD₮0</span>
            <span>Designer</span><span><a href={`${OKLINK}/address/${fuse.designer}`} target="_blank" rel="noreferrer">{short(fuse.designer)} ↗</a></span>
          </div>
          <Link className="btn" style={{ justifyContent: "center" }} href={`/app/fuse/${fuse.fuseId}`}>Open in the market →</Link>
        </>; })()}
      </MSheet>

      <MSheet open={tools} onClose={() => setTools(false)} title="Export and share">
        <DecisionTools wallet={a.wallet} rows={a.decisions} fresh={fresh} names={a.fuses.map((x) => x.name)} />
      </MSheet>
    </div>
  );
}
