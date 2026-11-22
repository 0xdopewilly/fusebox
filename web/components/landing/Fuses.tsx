"use client";
import { useRef } from "react";
import { gsap, SplitText, ScrollTrigger, useGSAP, reduced, whenNear } from "@/lib/gsap";
import { LAYERS, FUSE_META } from "@/lib/fuses";
import Netlist from "./Netlist";
import Reg from "./Reg";
import { useLang } from "@/lib/i18n";

/** 简体中文 for the fuse copy that lives in lib/fuses (FUSE_META.say and the spec chips), keyed by fuse */
const SAY_ZH: Record<string, string> = {
  "daily-cap": "无论智能体被怎么要求，一个 UTC 日内的付款都不会超过所有者设定的上限。",
  "payee-guard": "只付给已保存的收款方。新收款方在 24 小时冷静期结束前，只能收到一小笔试付金额。",
  breaker: "一遇到付给陌生地址的付款就跳闸，并保持熔断，直到所有者重置。",
  "approval-2of3": "超过阈值时，三位审批人中必须有两位为这笔付款本身签名。",
  "repeat-guard": "同一张发票发两次，只付一次。确属重复的付款，所有者可以放行。",
};
const chipZh = (c: string) => c.replace(/^(\d+) inputs$/, "$1 个输入").replace(" / check", " / 次检查").replace("LATCH", "锁存器").replace("Stateless", "无状态").replace("Remembers", "有记忆");

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
          <h2 className="disp">{t(<>Five TapeOut circuits.<br /><span className="lime">[246]</span> gates.<br />All on&#8209;chain.</>, <>五个 TapeOut 电路。<br /><span className="lime">[246]</span> 个门。<br />全部上链。</>)}</h2>
          <p>{t(
            "Each fuse is a real NAND circuit taped out on TapeOut, with its own circuit NFT, gate count and gas cost. The pictures below are their actual netlists, one square per gate, laid out by logic depth. Hover one to send a signal through it.",
            "每个保险丝都是在 TapeOut 上流片的真实 NAND 电路，有自己的电路 NFT、门数量和 gas 成本。下面的图就是它们真实的网表：每个方块是一个门，按逻辑深度排布。把鼠标移到任意一个上，就能让信号从中穿过。",
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
