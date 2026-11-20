"use client";
import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, reduced, whenNear } from "@/lib/gsap";
import { LAYERS, FUSE_META } from "@/lib/fuses";

const PROCESSOR = "0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355";
const OKLINK = "https://www.oklink.com/xlayer";

/** Where the fuses come from: every Fusebox fuse is a circuit taped out on TapeOut and evaluated by TapeOut on X Layer. */
const STEPS: [string, string, string][] = [
  ["Designed", "A logic circuit", "A fuse is a TAP-02 netlist: NAND gates, plus latches for memory. Design one with TapeOut's toolchain, or build it from rules in Fuse Studio."],
  ["Taped out", "On TapeOut", "Minted gate by gate and taped out on TapeOut's processor on X Layer. The designer gets the circuit NFT. Fusebox's five are circuits #15 to #18 and #21."],
  ["Evaluated", "By TapeOut, on X Layer", "Every payment calls TapeOut's eval and step for each fuse, in the same transaction. A latch keeps its state on-chain between payments."],
  ["Paid", "To the circuit's owner", "Every check pays whoever holds the circuit NFT, in USD₮0. Sell the NFT and the income goes with it."],
];

export default function OnTapeOut() {
  const root = useRef<HTMLElement>(null);
  useGSAP((_, contextSafe) => {
    let undo: void | (() => void);
    const cancel = whenNear(root.current, contextSafe!(() => { undo = (() => {
      if (reduced()) return;
      const el = root.current!;
      gsap.from(el.querySelectorAll(".ot-h > *"), { y: 26, autoAlpha: 0, duration: 1, stagger: 0.1, scrollTrigger: { trigger: el, start: "top 75%" } });
      gsap.from(el.querySelectorAll(".ot-step"), { y: 30, autoAlpha: 0, duration: 0.9, stagger: 0.1, scrollTrigger: { trigger: el.querySelector(".ot-steps"), start: "top 80%" } });
      gsap.from(el.querySelector(".ot-wire i"), { scaleX: 0, transformOrigin: "left", duration: 1.6, ease: "power3.inOut", scrollTrigger: { trigger: el.querySelector(".ot-steps"), start: "top 80%" } });
      gsap.from(el.querySelectorAll(".ot-c"), { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.08, scrollTrigger: { trigger: el.querySelector(".ot-circuits"), start: "top 85%" } });
      return () => ScrollTrigger.refresh();
    })(); }));
    return () => { cancel(); if (typeof undo === "function") undo(); };
  }, []);

  return (
    <section className="ontape" ref={root} id="tapeout" aria-labelledby="tapeout-h">
      <div className="wrap sh">
        <div className="m lime">[04]</div><div className="m mute">Built on TapeOut</div>
        <div className="m mute ot-links" style={{ gridColumn: "5 / 7" }}><a href="https://tapeout.net" target="_blank" rel="noreferrer">tapeout.net ↗</a><a href="https://x.com/TapeOutWorld" target="_blank" rel="noreferrer">@TapeOutWorld ↗</a></div>
      </div>
      <div className="wrap ot-h">
        <h2 className="disp" id="tapeout-h">Every fuse is a <span className="lime">[TapeOut]</span> circuit.</h2>
        <p>TapeOut lets anyone design a logic circuit, tape it out on X Layer and own it as an NFT. Fusebox puts those circuits between an AI agent and its money: a wallet wires them in as fuses, and every payment runs them through TapeOut&apos;s processor on X Layer before a cent moves.</p>
      </div>
      <div className="wrap ot-steps">
        <div className="ot-wire" aria-hidden="true"><i /></div>
        <ol>
          {STEPS.map(([k, t, p], i) => (
            <li className="ot-step" key={k}>
              <span className="ot-node" aria-hidden="true" />
              <span className="m lime">0{i + 1} · {k}</span>
              <h3>{t}</h3>
              <p>{p}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="wrap ot-circuits">
        <div className="m mute ot-cap">Live on TapeOut&apos;s processor <a href={`${OKLINK}/address/${PROCESSOR}`} target="_blank" rel="noreferrer">{PROCESSOR.slice(0, 6)}…{PROCESSOR.slice(-4)} ↗</a></div>
        <div className="ot-grid">
          {LAYERS.map((f) => {
            const m = FUSE_META[f.key];
            return (
              <div className="ot-c" key={f.key}>
                <span className="m mute">TapeOut circuit</span>
                <b className="disp">#{m.circuit}</b>
                <span className="ot-name">{m.name}</span>
                <span className="m mute">{m.chips[1]?.[0] ?? `${f.gates} gates`} · {m.fee} USD₮0 a check</span>
              </div>
            );
          })}
        </div>
        <div className="ot-cta">
          <a className="btn lime" href="https://tapeout.net" target="_blank" rel="noreferrer" data-cursor="Open"><span className="roll"><span>Open TapeOut</span><span aria-hidden="true">Open TapeOut</span></span> <span className="k">↗</span></a>
          <a className="btn line" href="/app/studio" data-cursor="Build"><span className="roll"><span>Tape out your own fuse</span><span aria-hidden="true">Tape out your own fuse</span></span> <span className="k">→</span></a>
        </div>
      </div>
    </section>
  );
}
