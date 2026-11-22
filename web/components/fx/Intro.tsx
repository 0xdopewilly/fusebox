"use client";
import { useRef } from "react";
import { gsap, useGSAP, reduced } from "@/lib/gsap";
import { useLang } from "@/lib/i18n";

/**
 * Once per session: a lime wire draws across the black screen, the gate count runs up,
 * then the screen splits open along the wire. window.__fuseboxIntro resolves as it opens.
 */
export default function Intro() {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLang();
  useGSAP(() => {
    const root = ref.current!;
    const html = document.documentElement;
    let resolve!: () => void;
    (window as unknown as { __fuseboxIntro?: Promise<void> }).__fuseboxIntro = new Promise<void>((r) => (resolve = r));
    if (html.dataset.intro === "skip" || reduced()) { root.style.display = "none"; resolve(); return; }
    const lenis = (window as unknown as { __lenis?: { stop(): void; start(): void } }).__lenis;
    lenis?.stop();
    const count = root.querySelector(".count b")!;
    const n = { v: 0 };
    const tl = gsap.timeline({ defaults: { ease: "wire" } });
    tl.to(root.querySelector(".wire"), { scaleX: 1, duration: 0.8 })
      .from(root.querySelector(".glyph"), { scale: 0.6, autoAlpha: 0, duration: 0.5, ease: "back.out(2)" }, 0.25)
      .from(root.querySelector(".count"), { autoAlpha: 0, y: 8, duration: 0.4 }, 0.3)
      .to(n, { v: 244, duration: 0.9, ease: "power2.inOut", onUpdate: () => { count.textContent = String(Math.round(n.v)).padStart(3, "0"); } }, 0.3)
      .to(root.querySelector(".glyph path"), { stroke: "#ffffff", duration: 0.08, repeat: 3, yoyo: true, ease: "none" }, 1.15)
      .add(() => resolve(), 1.4)
      .to(root.querySelector(".half.t"), { yPercent: -101, duration: 0.95 }, 1.35)
      .to(root.querySelector(".half.b"), { yPercent: 101, duration: 0.95 }, 1.35)
      .to([root.querySelector(".glyph"), root.querySelector(".count")], { autoAlpha: 0, duration: 0.25, ease: "none" }, 1.35)
      .to(root.querySelector(".wire"), { scaleY: 0, duration: 0.5 }, 1.45)
      .add(() => {
        root.style.display = "none";
        lenis?.start();
        try { sessionStorage.setItem("fx-intro", "1"); } catch {}
      });
  }, []);
  return (
    <div className="intro" ref={ref} aria-hidden="true">
      <div className="half t" />
      <div className="half b" />
      <div className="wire" />
      <div className="glyph">
        <svg width="72" height="34" viewBox="0 0 30 14"><rect x=".5" y="1.5" width="6" height="11" fill="#f2f2ee" /><rect x="23.5" y="1.5" width="6" height="11" fill="#f2f2ee" /><rect x="6.5" y="3.5" width="17" height="7" fill="#000" stroke="#f2f2ee" /><path d="M6.5 7h4.5l1.6-2.6 2 5.2 1.6-2.6h7.3" fill="none" stroke="#bbfe2f" strokeWidth="1.4" /></svg>
      </div>
      <div className="count m"><b style={{ color: "#f2f2ee", fontWeight: 500 }}>000</b>{t(" gates · taping out", " 个门 · 流片中")}</div>
    </div>
  );
}
