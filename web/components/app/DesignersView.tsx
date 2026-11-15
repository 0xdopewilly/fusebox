"use client";
import { useMarket } from "@/lib/useMarket";
import { short, fmt, OKLINK } from "@/lib/hooks";
import DesignerTools from "./DesignerTools";
import Loading from "./Loading";

const STEPS = [
  ["Design the circuit", "Write it as NAND gates (plus LATCH bits if it needs memory) with the Fusebox toolchain, which builds, simulates and exhaustively tests TAP-02 netlists. It reads one socket: the payment's inputs, laid out bit by bit."],
  ["Tape it out on TapeOut", "Mint one transistor per gate on an X Layer processor and call tapeout(). You get the circuit NFT. Our four fuses cost about 0.03 OKB in total."],
  ["List it in the registry", "registry.list(processor, circuitId, socket, netlistHash, fee, uri). The registry checks the processor's code, the gate budget and the netlist hash, then wallets can install it."],
  ["Earn on every decision", "Each time a wallet's payment runs through your fuse, you earn your fee in USDT0, the no's included. Claim with claim(fuseId, to). Sell the NFT and the income moves with it."],
];

export default function DesignersView() {
  const { data, error } = useMarket();
  const byDesigner = new Map<string, { fuses: number; decisions: number; life: number; earned: number }>();
  data?.fuses.forEach((f) => { const d = byDesigner.get(f.designer) ?? { fuses: 0, decisions: 0, life: 0, earned: 0 }; d.fuses++; d.decisions += f.decisions; d.life += Number(f.lifetimeEarned); d.earned += Number(f.earned); byDesigner.set(f.designer, d); });
  return (
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <section className="try-head">
        <h1 className="disp" data-a>Sell a <span className="lime">[fuse]</span>.</h1>
        <p data-a>A fuse is a product. Tape out a circuit once, list it, and it pays you {data ? `${100 - data.protocolBps / 100}%` : "90%"} of its fee every time a wallet runs a payment through it.</p>
      </section>
      <h2 className="sr">How to sell a fuse</h2>
      <section data-a>
        {STEPS.map(([h, p], i) => (
          <div className="fz" key={h} style={{ minHeight: 0 }}>
            <div><div className="ix">0{i + 1}</div></div>
            <div style={{ gridColumn: "2 / 4" }}><h3>{h}</h3></div>
            <div style={{ gridColumn: "4 / 7" }}><p className="say" style={{ maxWidth: 560 }}>{p}</p></div>
          </div>
        ))}
      </section>
      <div className="blockhead" data-a><h2 className="disp">Earnings</h2><span className="m mute">read from the registry · {data ? `protocol keeps ${data.protocolBps / 100}%, earned ${fmt(data.protocolEarned)} USDT0` : ""}</span></div>
      {!data ? <Loading label="Reading the fuse registry" error={error} /> : (
        <div style={{ overflowX: "auto" }} data-a tabIndex={0} role="region" aria-label="Earnings table">
          <table className="tbl">
            <thead><tr><th>Designer</th><th style={{ textAlign: "right" }}>Fuses</th><th style={{ textAlign: "right" }}>Decisions</th><th style={{ textAlign: "right" }}>Lifetime earned</th><th style={{ textAlign: "right" }}>Claimable now</th></tr></thead>
            <tbody>
              {[...byDesigner].map(([d, v]) => (
                <tr key={d}>
                  <td className="num" style={{ textAlign: "left" }}><a className="tx" href={`${OKLINK}/address/${d}`} target="_blank" rel="noreferrer">{short(d)} ↗</a></td>
                  <td className="num">{v.fuses}</td><td className="num">{v.decisions}</td>
                  <td className="num lime">{v.life.toFixed(6)}</td><td className="num">{v.earned.toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="proof m">Every row is the registry&apos;s own ledger: fees are charged in the same call as each decision, so earnings move the moment a wallet uses a fuse.</p>
        </div>
      )}
      <DesignerTools market={data} />
    </div>
  );
}
