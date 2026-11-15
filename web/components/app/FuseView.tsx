"use client";
import Link from "next/link";
import { useMarket } from "@/lib/useMarket";
import { LAYERS } from "@/lib/fuses";
import { SOCKETS } from "@/lib/sockets";
import { metaSource } from "@/lib/fuseMeta";
import { short, fmt, OKLINK } from "@/lib/hooks";
import Netlist from "@/components/landing/Netlist";
import ChainNetlist from "./ChainNetlist";
import MarketInstall from "./MarketInstall";
import Loading from "./Loading";

/** "Daily Cap" → Daily [Cap]. ; one word → [Breaker]. */
function Title({ name }: { name: string }) {
  const w = name.trim().split(/\s+/);
  const last = w.pop();
  return <h1 className="disp" data-a>{w.length ? `${w.join(" ")} ` : ""}<span className="lime">[{last}]</span>.</h1>;
}

/** One fuse's own page: what it decides, its real netlist from TapeOut, its pinout, its numbers, and an install button. */
export default function FuseView({ id }: { id: number }) {
  const { data, error } = useMarket();
  const grid = <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>;
  if (!data) return <div className="page">{grid}<Loading label="Reading the fuse registry" error={error} /></div>;
  const f = data.fuses.find((x) => x.fuseId === id);
  if (!f) return (
    <div className="page">{grid}
      <section className="try-head"><h1 className="disp" data-a>No fuse <span className="red">[#{id}]</span>.</h1><p data-a>The registry on X Layer has no fuse with that number.</p></section>
      <div className="fv-back m"><Link className="lime" href="/app/market">← The fuse market</Link></div>
    </div>
  );
  const spec = SOCKETS[f.socket];
  const layout = f.original ? LAYERS.find((l) => l.key === f.key) : undefined;
  const meta = f.meta;
  const name = meta?.name ?? f.name;
  const src = metaSource(f.metadataURI);
  const since = f.listedAt ? new Date(f.listedAt * 1000).toISOString().slice(0, 10) : "—";
  return (
    <div className="page">
      {grid}
      <section className="try-head">
        <div className="m fv-eyebrow" data-a><span className="lime">[Fuse {f.fuseId}]</span> <span className="mute">{spec?.name ?? `Socket ${f.socket}`} socket · circuit #{f.circuitId} on TapeOut · {f.listed ? "listed" : "delisted"}</span></div>
        <Title name={name} />
        <p data-a>{meta?.summary ?? (f.original ? spec?.say : "") ?? ""}</p>
      </section>

      <section className="stats m mute" data-a>
        <div>Fee per check<b>{fmt(f.fee)}<small>USDT0</small></b></div>
        <div>Decisions<b>{f.decisions}</b></div>
        <div>Earned<b>{Number(f.lifetimeEarned).toFixed(5)}<small>USDT0</small></b></div>
        <div>Gates<b>{f.gates}<small>{f.nState ? `+ ${f.nState} latch` : "NAND"}</small></b></div>
        <div>Inputs<b>{f.nIn}</b></div>
        <div>Listed<b style={{ fontSize: 20, marginTop: 14 }}>{since}</b></div>
      </section>

      <h2 className="sr">How it decides</h2>
      <section className="fv" data-a>
        <div className="fv-sch">
          <div className="m mute fv-k">Netlist · read from TapeOut</div>
          <div className="sch">{layout && <Netlist f={layout} />}<ChainNetlist processor={f.processor} circuitId={f.circuitId} nIn={f.nIn} pinned={f.netlistHash} draw={!layout} /></div>
        </div>
        <div className="fv-say">
          {meta?.description && <p>{meta.description}</p>}
          {meta?.rule && <div className="fv-rule m"><span className="mute">Rule</span><code>{meta.rule}</code></div>}
          {f.listed ? <MarketInstall fuseId={f.fuseId} name={name} /> : <p className="m red">Delisted: wallets already running it keep it, but it can&apos;t be installed.</p>}
        </div>
      </section>

      <section className="fv-cols" data-a>
        <div>
          <h2 className="m fv-h">Pinout · what the wallet tells it</h2>
          <div className="tbl-w" tabIndex={0} role="region" aria-label="Pinout">
            <table className="tbl fv-pins">
              <thead><tr><th>Pin</th><th>Bits</th><th>Meaning</th></tr></thead>
              <tbody>{(spec?.pins ?? []).map(([p, n, d]) => <tr key={p}><td className="m lime">{p}</td><td className="m">{n}</td><td>{d}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="m mute fv-note">Every input is derived by the wallet from its own state. The agent&apos;s memo never reaches the circuit. One output bit: 1 lets the payment through.</p>
        </div>
        <div>
          <h2 className="m fv-h">On X Layer</h2>
          <div className="m kv fv-kv">
            <span>Processor</span><span><a href={`${OKLINK}/address/${f.processor}`} target="_blank" rel="noreferrer">{short(f.processor)} ↗</a></span>
            <span>Circuit</span><span>#{f.circuitId}</span>
            <span>Designer</span><span><a href={`${OKLINK}/address/${f.designer}`} target="_blank" rel="noreferrer">{short(f.designer)} ↗</a>{meta?.designer ? ` · ${meta.designer}` : ""}</span>
            <span>Netlist hash</span><span title={f.netlistHash}>{f.netlistHash.slice(0, 10)}…{f.netlistHash.slice(-6)}</span>
            <span>Description</span><span>{src === "on-chain" ? "stored on-chain" : src === "link" ? <a href={f.metadataURI.startsWith("https") ? f.metadataURI : undefined} target="_blank" rel="noreferrer">{f.metadataURI.slice(0, 32)}…</a> : "none"}</span>
            {meta?.source && <><span>Source</span><span><a href={meta.source} target="_blank" rel="noreferrer">code ↗</a></span></>}
            <span>Revenue split</span><span>{100 - data.protocolBps / 100}% designer · {data.protocolBps / 100}% Fusebox</span>
          </div>
        </div>
      </section>
      <div className="fv-back m"><Link className="lime" href="/app/market">← Every fuse</Link>{f.onAtlas ? <> · <Link className="lime" href="/app">Running on Atlas →</Link></> : null}</div>
    </div>
  );
}
