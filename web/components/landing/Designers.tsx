"use client";
import { useRef } from "react";
import { gsap, SplitText, useGSAP, reduced, whenNear } from "@/lib/gsap";

const BARS = [
  { name: "Daily Cap", fee: "0.001", h: 50 },
  { name: "Payee Guard", fee: "0.001", h: 50 },
  { name: "Breaker", fee: "0.0005", h: 25 },
  { name: "Two of Three", fee: "0.002", h: 100 },
];

export default function Designers() {
  const root = useRef<HTMLElement>(null);
  useGSAP((_, contextSafe) => {
    // below the fold: set this section up only as it nears the viewport, so hydration stays light
    let undo: void | (() => void);
    const cancel = whenNear(root.current, contextSafe!(() => { undo = (() => {
      const el = root.current!;
      if (reduced()) return;
      // the lime floods in from a narrower frame as it scrolls up
      gsap.fromTo(el, { clipPath: "inset(10% 4% 0% 4%)" }, { clipPath: "inset(0% 0% 0% 0%)", ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "top 25%", scrub: true } });
      const h = SplitText.create(el.querySelector("h2")!, { type: "lines", linesClass: "line-mask", mask: "lines" });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el.querySelector(".body"), start: "top 75%" } });
      tl.from(h.lines, { yPercent: 105, duration: 1.2, stagger: 0.08 });
      el.querySelectorAll<HTMLElement>(".pts > div").forEach((d, i) => {
        const b = d.querySelector<HTMLElement>("b")!;
        tl.from(d, { y: 30, autoAlpha: 0, duration: 0.9 }, 0.2 + i * 0.1);
        if (b.dataset.count) {
          const o = { v: 0 };
          tl.to(o, { v: Number(b.dataset.count), duration: 1.4, ease: "power3.out", onUpdate: () => { b.textContent = Math.round(o.v) + (b.dataset.suffix || ""); } }, 0.25 + i * 0.1);
        } else {
          tl.from(b, { duration: 1, scrambleText: { text: b.textContent || "", chars: "01", speed: 0.6 } }, 0.25 + i * 0.1);
        }
      });
      const bars = Array.from(el.querySelectorAll<HTMLElement>(".bar"));
      const bt = gsap.timeline({ scrollTrigger: { trigger: el.querySelector(".bars"), start: "top 85%" } });
      bars.forEach((bar, i) => {
        const steps = Math.max(2, Math.round((Number(bar.dataset.h) / 100) * 20));
        bt.from(bar.querySelector("i"), { scaleY: 0, duration: 0.25 + steps * 0.05, ease: `steps(${steps})` }, i * 0.15)
          .from(bar.querySelector("span"), { autoAlpha: 0, y: 10, duration: 0.5 }, i * 0.15 + 0.3);
      });
      bt.from(el.querySelector(".barlab"), { autoAlpha: 0, duration: 0.8 }, 0);
    })(); }));
    return () => { cancel(); if (typeof undo === "function") undo(); };
  }, []);
  return (
    <section className="flood" ref={root} id="designers">
      <div className="wrap sh"><div className="m">[07]</div><div className="m">For circuit designers</div><div className="m" style={{ gridColumn: "5 / 7" }}>Tape out on TapeOut. Every fee goes to whoever owns the circuit NFT</div></div>
      <div className="wrap body">
        <h2 className="disp">A fuse is a product. It pays you every time it decides.</h2>
        <p className="studio-lead">Build one without code. Fuse Studio combines payment conditions with <b>all</b>, <b>any</b>, <b>at least</b> or <b>none</b>, turns the rule into TapeOut gates, trims every gate it doesn&apos;t need and proves it matches your rule on every possible input before you tape it out. <a href="/app/studio">Open Fuse Studio →</a></p>
        <div className="pts">
          <div><b data-count="90" data-suffix="%">90%</b><p>of every fee goes to the circuit&apos;s owner. Fusebox keeps 10%, and the contract caps its share at 20%.</p></div>
          <div><b>Even the no</b><p>A fuse that stops a scam has done its job, so blocked attempts pay too, within daily caps.</p></div>
          <div><b>1 NFT</b><p>The circuit NFT is the payout address. Sell it, and the income moves with it.</p></div>
          <div><b>0 upfront</b><p>Wallet owners pay per decision, from a prepaid USD₮0 balance. No licences, no subscriptions.</p></div>
        </div>
      </div>
      <div className="wrap bars">
        <div className="m barlab">Fee per check, USD₮0<br />set by each fuse&apos;s designer</div>
        {BARS.map((b) => (
          <div className="bar" key={b.name} style={{ ["--h" as string]: `${b.h}%` }} data-h={b.h} data-cursor={`${b.fee} / check`}>
            <i /><span>{b.name} · {b.fee}</span><em>{b.fee} USD₮0</em>
          </div>
        ))}
      </div>
    </section>
  );
}
