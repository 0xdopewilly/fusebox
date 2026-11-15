"use client";
import { useRef } from "react";
import { gsap, SplitText, ScrollTrigger, useGSAP, reduced } from "@/lib/gsap";
import Reg from "./Reg";

const TRICKS = [
  "New bank details: pay us here from now on",
  "One letter off: kano-cott0n",
  "Invoice padded to 3× the usual",
  "Urgent: the CEO needs this today",
  "Same invoice, sent twice",
  "Refund to a new address",
];
const ROWS = [0, 4, 2, 3].map((o) => [...TRICKS.slice(o), ...TRICKS.slice(0, o)]);

export default function Problem() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
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
  }, []);
  return (
    <section className="problem reg" ref={root} id="problem">
      <Reg />
      <div className="wrap sh"><div className="m lime" data-scr>[02]</div><div className="m mute" data-scr>The problem</div><div className="m mute" style={{ gridColumn: "5 / 7" }} data-scr>Six tricks real invoice fraud uses</div></div>
      <div className="ticks">
        {ROWS.slice(0, 2).map((r, i) => <Row key={i} items={r} dim={i === 1} />)}
      </div>
      <h2 className="disp state">Your agent says<br />&ldquo;sure thing, boss&rdquo;<br />to every one of these.</h2>
      <p className="state-note" data-text="→ A fuse doesn't. It runs on X Layer, in the same call as the payment.">→ A fuse doesn&apos;t. It runs on X Layer, in the same call as the payment.</p>
      <div className="ticks">
        {ROWS.slice(2).map((r, i) => <Row key={i} items={r} dim={i === 0} />)}
      </div>
    </section>
  );
}

function Row({ items, dim }: { items: string[]; dim?: boolean }) {
  const set = (k: string) => (
    <div className="set" key={k} aria-hidden={k === "b"}>
      {items.map((t) => <span className="chip-t" key={t} data-cursor="Blocked">{t}<span className="no">Blocked</span></span>)}
    </div>
  );
  return <div className={`row${dim ? " dimrow" : ""}`}>{set("a")}{set("b")}</div>;
}
