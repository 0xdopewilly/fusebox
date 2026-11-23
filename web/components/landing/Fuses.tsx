"use client";
import { useRef } from "react";
import { gsap, SplitText, ScrollTrigger, useGSAP, reduced, whenNear } from "@/lib/gsap";
import { LAYERS, FUSE_META } from "@/lib/fuses";
import Netlist from "./Netlist";
import Reg from "./Reg";
import { useLang } from "@/lib/i18n";
import { SAY_ZH, chipZh } from "@/lib/fuseZh";

export default function Fuses() {
  const root = useRef<HTMLElement>(null);
  const { t } = useLang();
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
      <div className="wrap sh"><div className="m lime" data-scr>[05]</div><div className="m mute" data-scr>{t("The fuses", "保险丝")}</div></div>
      <div className="wrap">
        <div className="head">
          <h2 className="disp">{t(<>Five sockets.<br /><span className="lime">[9]</span> circuits.<br />All on&#8209;chain.</>, <>5 个插槽。<br /><span className="lime">[9]</span> 个电路。<br />全部上链。</>)}</h2>
          <p>{t(
            "A socket is one kind of rule. Below are Fusebox's five originals, one per socket, 246 gates in all; four rival designs (circuits #22–25) compete with them on the same sockets in the market. Each is a real NAND circuit taped out on TapeOut, with its own circuit NFT, gate count and gas cost. The pictures are their actual netlists, one square per gate, laid out by logic depth. Hover one to send a signal through it.",
            "一个插槽就是一种规则。下面是 Fusebox 的 5 个原始保险丝，每个插槽一个，共 246 个门；另有 4 个竞争设计（#22–25 号电路）在市场上与它们争夺同样的插槽。每个都是在 TapeOut 上流片的真实 NAND 电路，有自己的电路 NFT、门数量和 gas 成本。下面的图就是它们真实的网表：每个方块是一个门，按逻辑深度排布。把鼠标移到任意一个上，就能让信号从中穿过。",
          )}</p>
        </div>
        <div>
          {LAYERS.map((f) => {
            const m = FUSE_META[f.key];
            return (
              <div className="fz" key={f.key} data-cursor={t("Signal", "信号")}>
                <div><div className="ix" data-ix={m.ix}>{m.ix}</div></div>
                <div style={{ gridColumn: "2 / 4" }}><h3>{m.name}</h3><p className="say">{t(m.say, SAY_ZH[f.key] ?? m.say)}</p></div>
                <div className="sch"><Netlist f={f} /><div className="m">{t(<><span className="lime">TapeOut circuit #{m.circuit}</span> · netlist · {f.gates} gates · depth {f.depth}{f.key === "breaker" ? " · lime box = the latch" : ""}</>, <><span className="lime">TapeOut 电路 #{m.circuit}</span> · 网表 · {f.gates} 个门 · 深度 {f.depth}{f.key === "breaker" ? " · 绿框 = 锁存器" : ""}</>)}</div></div>
                <div><div className="chips">{m.chips.map(([ch, c]) => <span className={`chip ${c || ""}`} key={ch}>{t(ch, chipZh(ch))}</span>)}</div></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
