"use client";
import { useEffect, useRef } from "react";
import { gsap, reduced } from "@/lib/gsap";

/**
 * Site-wide motion that isn't tied to one component (lib/motion's language):
 * - every <details> grows open and shut instead of snapping, its rows rising in and a lime wire zipping under the
 *   summary (the app bar's "More" menu runs its own, and `data-fx="off"` opts a details out);
 * - switching EN / 中文 sweeps a scan line down the screen while the page settles into the new language.
 */
type Anim = { tl: gsap.core.Timeline; closing: boolean };
const anims = new WeakMap<HTMLDetailsElement, Anim>();

function bodyOf(d: HTMLDetailsElement, s: Element) { return Array.from(d.children).filter((k) => k !== s); }

function openDetails(d: HTMLDetailsElement, s: HTMLElement) {
  const prev = anims.get(d);
  const from = d.offsetHeight;
  prev?.tl.kill();
  gsap.set(d, { clearProps: "height,overflow,boxSizing" });
  d.open = true;
  const to = d.offsetHeight;
  d.classList.remove("fx-zip"); void d.offsetWidth; d.classList.add("fx-zip");
  setTimeout(() => d.classList.remove("fx-zip"), 800); // the zip runs 0.75 s, past the grow
  const rows = bodyOf(d, s);
  const tl = gsap.timeline({ onComplete: () => { gsap.set(d, { clearProps: "height,overflow,boxSizing" }); anims.delete(d); } });
  tl.fromTo(d, { height: from, overflow: "hidden", boxSizing: "border-box" }, { height: to, duration: 0.55, ease: "snap" }, 0);
  if (!prev?.closing) tl.fromTo(rows, { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.05, ease: "snap", clearProps: "transform,opacity,visibility" }, 0.06);
  else tl.to(rows, { y: 0, autoAlpha: 1, duration: 0.3, clearProps: "transform,opacity,visibility" }, 0);
  anims.set(d, { tl, closing: false });
}

function closeDetails(d: HTMLDetailsElement, s: HTMLElement) {
  const prev = anims.get(d);
  const from = d.offsetHeight;
  prev?.tl.kill();
  gsap.set(d, { clearProps: "height,overflow,boxSizing" });
  d.open = false;
  const to = d.offsetHeight;
  d.open = true;
  const rows = bodyOf(d, s);
  const tl = gsap.timeline({ onComplete: () => { d.open = false; gsap.set([d, ...rows], { clearProps: "height,overflow,boxSizing,transform,opacity,visibility" }); anims.delete(d); } });
  tl.to(rows, { y: -6, autoAlpha: 0, duration: 0.2, stagger: { each: 0.02, from: "end" }, ease: "power2.in" }, 0);
  tl.fromTo(d, { height: from, overflow: "hidden", boxSizing: "border-box" }, { height: to, duration: 0.4, ease: "wire" }, 0.04);
  anims.set(d, { tl, closing: true });
}

export default function UiFx() {
  const scan = useRef<HTMLElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || reduced()) return;
      const t = e.target as Element;
      const s = t.closest?.("summary") as HTMLElement | null;
      if (!s) return;
      const d = s.parentElement;
      if (!(d instanceof HTMLDetailsElement) || d.classList.contains("more-l") || d.dataset.fx === "off") return;
      const inner = t.closest("a, button, input, select, textarea, label");
      if (inner && s.contains(inner)) return; // a control inside the summary does its own thing
      e.preventDefault();
      const a = anims.get(d);
      if (d.open && !a?.closing) closeDetails(d, s); else openDetails(d, s);
    };
    const onLang = () => {
      if (reduced()) return;
      // after React has painted the new words
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (scan.current) gsap.fromTo(scan.current, { y: 0, autoAlpha: 1 }, { y: window.innerHeight + 180, duration: 0.85, ease: "power2.inOut", onComplete: () => { gsap.set(scan.current, { autoAlpha: 0 }); } });
        const wipe = document.querySelector(".wipe");
        if (wipe) gsap.timeline().fromTo(wipe, { scaleX: 0, transformOrigin: "left", autoAlpha: 1 }, { scaleX: 1, duration: 0.45, ease: "wire" }).to(wipe, { scaleX: 0, transformOrigin: "right", duration: 0.45, ease: "wire" });
        if (location.pathname !== "/") {
          const main = document.querySelector("main");
          if (main) gsap.fromTo(main, { autoAlpha: 0.2 }, { autoAlpha: 1, duration: 0.6, ease: "snap", clearProps: "opacity,visibility" }); // opacity only: a transform would unpin fixed bars inside
        }
      }));
    };
    document.addEventListener("click", onClick);
    window.addEventListener("fusebox:lang", onLang);
    return () => { document.removeEventListener("click", onClick); window.removeEventListener("fusebox:lang", onLang); };
  }, []);
  return <i className="lang-scan" ref={scan} aria-hidden="true" />;
}
