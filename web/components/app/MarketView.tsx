"use client";
import Link from "next/link";
import { useRef } from "react";
import { gsap, useGSAP, reduced } from "@/lib/gsap";
import { useMarket } from "@/lib/useMarket";
import { LAYERS } from "@/lib/fuses";
import { short, fmt, OKLINK } from "@/lib/hooks";
import Netlist from "@/components/landing/Netlist";

const SAY: Record<string, string> = {
  "daily-cap": "No more than the owner's cap in a UTC day, however the agent is asked.",
  "payee-guard": "Saved payees only, with a trial amount for new ones until their cooling-off ends.",
  breaker: "Trips on a payment to a stranger and stays blown until the owner resets it.",
  "approval-2of3": "Above a threshold, two of three approvers must sign that exact payment.",
};

export default function MarketView() {
  const { data, error } = useMarket();
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!data || reduced()) return;
    root.current!.querySelectorAll<HTMLElement>(".fz").forEach((row, k) => {
      const gates = row.querySelectorAll<SVGElement>(".gate"), wires = row.querySelectorAll<SVGPathElement>(".wire");
      const dep = (n: Element) => Number(n.getAttribute("data-depth"));
      gsap.timeline({ delay: 0.15 + k * 0.12 })
        .from(row, { y: 30, autoAlpha: 0, duration: 0.8 })
        .from(wires, { drawSVG: "0%", duration: 0.5, stagger: (i) => dep(wires[i]) * 0.03 }, 0.1)
        .from(gates, { scale: 0, transformOrigin: "50% 50%", duration: 0.3, ease: "back.out(3)", stagger: (i) => dep(gates[i]) * 0.03 }, 0.15);
      row.addEventListener("mouseenter", () => gsap.fromTo(gates, { fill: "#bbfe2f" }, { fill: "#fff", duration: 0.09, yoyo: true, repeat: 1, stagger: (i) => dep(gates[i]) * 0.04, overwrite: true }));
    });
  }, { dependencies: [!!data] });
  return (
    <div className="page" ref={root}>
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <section className="try-head">
        <h1 className="disp" data-a>The fuse <span className="lime">[market]</span>.</h1>
        <p data-a>Every fuse here is a NAND circuit taped out on TapeOut and listed in Fusebox&apos;s registry on X Layer. Wallets install them; designers earn every time one decides.</p>
      </section>
      {!data ? <p className="m skel">{error ? `Can't reach X Layer right now (${error}).` : "Reading the registry…"}</p> : (
        <>
          <section className="stats m mute" data-a>
            <div>Fuses listed<b>{data.fuses.length}</b></div>
            <div>Decisions<b>{data.totalDecisions}</b></div>
            <div>Earned by designers<b>{Number(data.totalEarned).toFixed(5)}<small>USDT0</small></b></div>
            <div>Protocol share<b>{data.protocolBps / 100}%<small>cap 20%</small></b></div>
            <div>Protocol earned<b>{Number(data.protocolEarned).toFixed(5)}<small>USDT0</small></b></div>
            <div>Processor<b style={{ fontSize: 16, marginTop: 14 }}>{data.fuses[0] ? short(data.fuses[0].processor) : "—"}</b></div>
          </section>
          <div style={{ marginTop: 40 }}>
            {data.fuses.map((f, i) => {
              const layout = LAYERS.find((l) => l.key === f.key);
              return (
                <div className="fz" key={f.fuseId} data-cursor="Signal">
                  <div><div className="ix">{String(i + 1).padStart(2, "0")}</div></div>
                  <div style={{ gridColumn: "2 / 4" }}>
                    <h3>{f.name}</h3><p className="say">{SAY[f.key] ?? f.metadataURI}</p>
                    <p className="m" style={{ marginTop: 12, color: "var(--dim)" }}>Fuse #{f.fuseId} · <a href={`${OKLINK}/address/${f.processor}`} target="_blank" rel="noreferrer" style={{ color: "var(--mute)" }}>circuit #{f.circuitId} ↗</a> · designer {short(f.designer)}{f.onAtlas ? <span className="lime"> · on Atlas</span> : null}</p>
                  </div>
                  <div className="sch">{layout ? <Netlist f={layout} /> : <div className="m mute">Netlist on-chain</div>}<div className="m">{f.gates} gates{f.nState ? ` · ${f.nState} state bit` : ""}</div></div>
                  <div><div className="chips">
                    <span className="chip l">{fmt(f.fee)} USDT0 / check</span>
                    <span className="chip">{f.decisions} decisions</span>
                    <span className="chip">earned {Number(f.lifetimeEarned).toFixed(5)}</span>
                    <span className="chip">{f.listed ? "Listed" : "Delisted"}</span>
                  </div></div>
                </div>
              );
            })}
            <div className="fz" style={{ borderStyle: "dashed" }}>
              <div><div className="ix" style={{ color: "var(--dim)" }}>+</div></div>
              <div style={{ gridColumn: "2 / 5" }}><h3 style={{ color: "var(--mute)" }}>Your fuse here</h3><p className="say">Duplicate-invoice checks, business-hours only, per-payee caps, velocity limits. Design it as a NAND circuit, tape it out, list it, and earn from every decision it makes.</p></div>
              <div style={{ gridColumn: "5 / 7", display: "flex", alignItems: "center" }}><Link className="btn lime" href="/app/designers" data-cursor="Earn"><span className="roll"><span>Sell a fuse</span><span aria-hidden="true">Sell a fuse</span></span> <span className="k">→</span></Link></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
