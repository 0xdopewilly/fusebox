"use client";
import { useRef } from "react";
import { gsap, SplitText, ScrollTrigger, useGSAP, reduced, whenNear } from "@/lib/gsap";
import { LAYERS, FUSE_META } from "@/lib/fuses";
import Netlist from "./Netlist";
import Reg from "./Reg";

export default function Fuses() {
  const root = useRef<HTMLElement>(null);
  useGSAP((_, contextSafe) => {
    // below the fold: set this section up only as it nears the viewport, so hydration stays light
    let undo: void | (() => void);
    const cancel = whenNear(root.current, contextSafe!(() => { undo = (() => {
      const el = root.current!;
      const head = SplitText.create(el.querySelector(".head h2")!, { type: "lines", linesClass: "line-mask", mask: "lines" });
      gsap.from(head.lines, { yPercent: 105, duration: 1.2, stagger: 0.1, scrollTrigger: { trigger: el.querySelector(".head"), start: "top 80%" } });
      gsap.from(el.querySelector(".head p"), { autoAlpha: 0, y: 20, duration: 1, scrollTrigger: { trigger: el.querySelector(".head"), start: "top 70%" } });

      el.querySelectorAll<HTMLElement>(".fz").forEach((row) => {
        const gates = Array.from(row.querySelectorAll<SVGElement>(".gate"));
        const wires = Array.from(row.querySelectorAll<SVGPathElement>(".wire"));
        const depth = (n: Element) => Number(n.getAttribute("data-depth"));
        const ix = row.querySelector<HTMLElement>(".ix")!;
        const wave = () => gsap.fromTo(gates, { fill: "#bbfe2f" }, { fill: "#ffffff", duration: 0.09, yoyo: true, repeat: 1, ease: "none", stagger: (i) => depth(gates[i]) * 0.045, overwrite: true });
        if (!reduced()) {
          gsap.set(row, { "--rule": 0 });
          const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: "top 82%" } });
          tl.to(row, { "--rule": 1, duration: 1.2, ease: "wire" }, 0)
            .from(ix, { yPercent: 60, autoAlpha: 0, duration: 0.8 }, 0.1)
            .from(row.querySelectorAll("h3, .say"), { y: 24, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.15)
            .from(wires, { drawSVG: "0%", duration: 0.6, ease: "power2.out", stagger: (i) => depth(wires[i]) * 0.035 }, 0.2)
            .from(gates, { scale: 0, transformOrigin: "50% 50%", duration: 0.35, ease: "back.out(3)", stagger: (i) => depth(gates[i]) * 0.035 }, 0.25)
            .from(row.querySelectorAll(".chip"), { autoAlpha: 0, x: -10, duration: 0.5, stagger: 0.06 }, 0.4)
            .add(wave, "-=0.1");
          // an idle signal wave while on screen
          let id: ReturnType<typeof setInterval> | undefined;
          ScrollTrigger.create({
            trigger: row, start: "top bottom", end: "bottom top",
            onToggle: (s) => { clearInterval(id); if (s.isActive) id = setInterval(wave, 3800 + Math.random() * 1200); },
          });
          row.addEventListener("mouseenter", () => {
            wave();
            gsap.to(ix, { duration: 0.6, scrambleText: { text: ix.dataset.ix || "", chars: "0123456789", speed: 0.8 } });
          });
          const latch = row.querySelector(".latch rect");
          if (latch) gsap.to(latch, { opacity: 0.25, duration: 0.5, repeat: -1, yoyo: true, ease: "steps(1)" });
        }
      });
    })(); }));
    return () => { cancel(); if (typeof undo === "function") undo(); };
  }, []);

  return (
    <section className="fuses reg" ref={root} id="fuses">
      <Reg />
      <div className="wrap sh"><div className="m lime" data-scr>[05]</div><div className="m mute" data-scr>The fuses</div></div>
      <div className="wrap">
        <div className="head">
          <h2 className="disp">Four TapeOut circuits.<br /><span className="lime">[244]</span> gates.<br />All on&#8209;chain.</h2>
          <p>Each fuse is a real NAND circuit taped out on TapeOut, with its own circuit NFT, gate count and gas cost. The pictures below are their actual netlists, one square per gate, laid out by logic depth. Hover one to send a signal through it.</p>
        </div>
        <div>
          {LAYERS.map((f) => {
            const m = FUSE_META[f.key];
            return (
              <div className="fz" key={f.key} data-cursor="Signal">
                <div><div className="ix" data-ix={m.ix}>{m.ix}</div></div>
                <div style={{ gridColumn: "2 / 4" }}><h3>{m.name}</h3><p className="say">{m.say}</p></div>
                <div className="sch"><Netlist f={f} /><div className="m"><span className="lime">TapeOut circuit #{m.circuit}</span> · netlist · {f.gates} gates · depth {f.depth}{f.key === "breaker" ? " · lime box = the latch" : ""}</div></div>
                <div><div className="chips">{m.chips.map(([t, c]) => <span className={`chip ${c || ""}`} key={t}>{t}</span>)}</div></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
