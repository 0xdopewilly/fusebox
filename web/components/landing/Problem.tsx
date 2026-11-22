"use client";
import { useRef } from "react";
import { gsap, SplitText, ScrollTrigger, useGSAP, reduced, whenNear } from "@/lib/gsap";
import Reg from "./Reg";
import { useLang } from "@/lib/i18n";

export default function Problem() {
  const root = useRef<HTMLElement>(null);
  const { t } = useLang();
  const TRICKS = [
    t("New bank details: pay us here from now on", "收款账户已变更：以后请付到这里"),
    t("One letter off: kano-cott0n", "差一个字母：kano-cott0n"),
    t("Invoice padded to 3× the usual", "发票金额虚高到平时的 3 倍"),
    t("Urgent: the CEO needs this today", "急：CEO 今天就要"),
    t("Same invoice, sent twice", "同一张发票，发了两次"),
    t("Refund to a new address", "退款到一个新地址"),
  ];
  const ROWS = [0, 4, 2, 3].map((o) => [...TRICKS.slice(o), ...TRICKS.slice(0, o)]);
  const note = t("→ A fuse doesn't. It runs on X Layer, in the same call as the payment.", "→ 保险丝不会。它在 X Layer 上运行，和付款在同一次调用里。");
  useGSAP((_, contextSafe) => {
    // below the fold: set this section up only as it nears the viewport, so hydration stays light
    let undo: void | (() => void);
    const cancel = whenNear(root.current, contextSafe!(() => { undo = (() => {
      const el = root.current!;
      const rows = Array.from(el.querySelectorAll<HTMLElement>(".row"));
      // infinite marquees, alternating direction; scroll velocity speeds them up, hover slows a row to a stop
      const loops = rows.map((row, i) => {
        const dir = i % 2 ? 1 : -1;
        const tw = gsap.fromTo(row, { xPercent: dir < 0 ? 0 : -50 }, { xPercent: dir < 0 ? -50 : 0, duration: 46 + i * 7, ease: "none", repeat: -1 });
        row.addEventListener("mouseenter", () => gsap.to(tw, { timeScale: 0, duration: 0.6 }));
        row.addEventListener("mouseleave", () => gsap.to(tw, { timeScale: 1, duration: 0.6 }));
        return tw;
      });
      if (!reduced()) {
        ScrollTrigger.create({
          trigger: el, start: "top bottom", end: "bottom top",
          onUpdate: (self) => {
            const v = Math.min(6, Math.abs(self.getVelocity()) / 260);
            loops.forEach((l) => { if (l.timeScale() > 0.05) gsap.to(l, { timeScale: 1 + v, duration: 0.3, overwrite: true, onComplete: () => { gsap.to(l, { timeScale: 1, duration: 1.2 }); } }); });
          },
        });
        // statement lights up word by word as it scrolls through
        const split = SplitText.create(el.querySelector(".state")!, { type: "words", wordsClass: "w" });
        gsap.fromTo(split.words, { opacity: 0.1 }, { opacity: 1, stagger: 0.1, ease: "none", scrollTrigger: { trigger: el.querySelector(".state"), start: "top 80%", end: "bottom 45%", scrub: true } });
        const note = el.querySelector<HTMLElement>(".state-note")!;
        const text = note.dataset.text || "";
        note.textContent = "";
        ScrollTrigger.create({ trigger: note, start: "top 75%", once: true, onEnter: () => { gsap.to(note, { duration: 1.6, scrambleText: { text, chars: "01", speed: 0.5, revealDelay: 0.2 } }); } });
        gsap.from(el.querySelectorAll(".ticks"), { autoAlpha: 0, y: 30, stagger: 0.2, duration: 1.2, scrollTrigger: { trigger: el, start: "top 70%" } });
      }
    })(); }));
    return () => { cancel(); if (typeof undo === "function") undo(); };
  }, []);
  return (
    <section className="problem reg" ref={root} id="problem">
      <Reg />
      <div className="wrap sh"><div className="m lime" data-scr>[02]</div><div className="m mute" data-scr>{t("The problem", "问题所在")}</div><div className="m mute" style={{ gridColumn: "5 / 7" }} data-scr>{t("Six tricks real invoice fraud uses", "真实发票诈骗常用的六种手法")}</div></div>
      <div className="ticks">
        {ROWS.slice(0, 2).map((r, i) => <Row key={i} items={r} dim={i === 1} />)}
      </div>
      <h2 className="disp state">{t(<>Your agent says<br />&ldquo;sure thing, boss&rdquo;<br />to every one of these.</>, <>对这里的每一招，<br />你的智能体都会说<br />“好嘞，老板”。</>)}</h2>
      <p className="state-note" data-text={note}>{note}</p>
      <div className="ticks">
        {ROWS.slice(2).map((r, i) => <Row key={i} items={r} dim={i === 0} />)}
      </div>
    </section>
  );
}

function Row({ items, dim }: { items: string[]; dim?: boolean }) {
  const { t } = useLang();
  const set = (k: string) => (
    <div className="set" key={k} aria-hidden={k === "b"}>
      {items.map((it) => <span className="chip-t" key={it} data-cursor={t("Blocked", "已拦截")}>{it}<span className="no">{t("Blocked", "已拦截")}</span></span>)}
    </div>
  );
  return <div className={`row${dim ? " dimrow" : ""}`}>{set("a")}{set("b")}</div>;
}
