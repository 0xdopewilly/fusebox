"use client";
/**
 * Fusebox's one motion language for things that open: a panel "powers on" like a circuit. A lime wire draws across
 * its top edge, the panel unrolls from that wire, a scan line sweeps down, and its rows slide in one by one (labels
 * can decode from bits). Closing runs it back. Panels that sit in the page flow (accordions, inline editors) grow
 * open instead of unrolling over the page. With reduced motion everything opens and closes at once.
 *
 * A panel opts into the wire and the scan by rendering `<i className="pw-wire" /><i className="pw-scan" />` as its
 * first children (see `PowerTrim`). The panel needs `position: relative | absolute`.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { gsap, reduced } from "./gsap";

type Els = Element[] | NodeListOf<Element> | null | undefined;
const list = (e: Els) => (e ? Array.from(e) : []);
const running = new WeakMap<Element, gsap.core.Timeline>();
const take = (el: Element, tl: gsap.core.Timeline) => { running.get(el)?.kill(); running.set(el, tl); return tl; };

export interface PowerOpts {
  /** rows that slide in one after another */
  rows?: Els;
  /** labels that decode from bits into their text (`data-t` holds the final text, else their current text) */
  decode?: Els;
  /** where the wire starts drawing from */
  from?: "left" | "right" | "center";
}

/** The rows of a panel: its direct children apart from the wire and the scan. */
export const rowsOf = (panel: Element) => panel.querySelectorAll(":scope > :not(.pw-wire):not(.pw-scan)");

/** Plays a floating panel (dropdown, popover) open. */
export function powerOn(panel: HTMLElement, o: PowerOpts = {}) {
  if (reduced()) return;
  const wire = panel.querySelector(":scope > .pw-wire");
  const scan = panel.querySelector(":scope > .pw-scan");
  const rows = list(o.rows ?? rowsOf(panel));
  const tl = take(panel, gsap.timeline());
  gsap.set(panel, { clearProps: "clipPath" });
  if (wire) tl.fromTo(wire, { scaleX: 0, transformOrigin: o.from ?? "right" }, { scaleX: 1, duration: 0.38, ease: "wire" }, 0);
  tl.fromTo(panel, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.6, ease: "snap", clearProps: "clipPath" }, wire ? 0.14 : 0);
  if (scan) tl.fromTo(scan, { y: 0, autoAlpha: 1 }, { y: panel.offsetHeight, duration: 0.7, ease: "power2.inOut" }, 0.14).set(scan, { autoAlpha: 0 });
  if (rows.length) tl.fromTo(rows, { x: 18, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, stagger: 0.04, ease: "snap", clearProps: "transform,opacity,visibility" }, 0.2);
  list(o.decode).forEach((l, i) => {
    const text = (l as HTMLElement).dataset.t ?? l.textContent ?? "";
    tl.to(l, { duration: 0.55, scrambleText: { text, chars: "01", speed: 0.9, revealDelay: 0.15 } }, 0.24 + i * 0.04);
  });
}

/** Plays a floating panel closed, then calls `done` (which unmounts or hides it). */
export function powerOff(panel: HTMLElement, done: () => void, o: { rows?: Els } = {}) {
  if (reduced()) { done(); return; }
  const wire = panel.querySelector(":scope > .pw-wire");
  const rows = list(o.rows ?? rowsOf(panel));
  const tl = take(panel, gsap.timeline({ onComplete: () => { done(); gsap.set([panel, wire, ...rows].filter(Boolean), { clearProps: "all" }); } }));
  if (rows.length) tl.to(rows, { x: 10, autoAlpha: 0, duration: 0.18, stagger: { each: 0.015, from: "end" }, ease: "power2.in" }, 0);
  tl.to(panel, { clipPath: "inset(0 0 100% 0)", duration: 0.32, ease: "wire" }, 0.06);
  if (wire) tl.to(wire, { scaleX: 0, transformOrigin: "left", duration: 0.26, ease: "wire" }, 0.24);
}

/** Grows an in-flow panel open from `fromH` (its closed height) to its natural height, rows rising in. */
export function growOpen(el: HTMLElement, fromH: number, o: PowerOpts = {}) {
  if (reduced()) return;
  const toH = el.offsetHeight;
  const wire = el.querySelector(":scope > .pw-wire");
  const tl = take(el, gsap.timeline({ onComplete: () => { gsap.set(el, { clearProps: "height,overflow,boxSizing" }); } }));
  tl.fromTo(el, { height: fromH, overflow: "hidden", boxSizing: "border-box" }, { height: toH, duration: 0.55, ease: "snap" }, 0);
  if (wire) tl.fromTo(wire, { scaleX: 0, transformOrigin: o.from ?? "left" }, { scaleX: 1, duration: 0.5, ease: "wire" }, 0);
  const rows = list(o.rows);
  if (rows.length) tl.fromTo(rows, { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.045, ease: "snap", clearProps: "transform,opacity,visibility" }, 0.08);
}

/** Shrinks an in-flow panel to `toH`, then calls `done`. */
export function shrinkClosed(el: HTMLElement, toH: number, done: () => void, o: { rows?: Els } = {}) {
  if (reduced()) { done(); return; }
  const rows = list(o.rows);
  const tl = take(el, gsap.timeline({ onComplete: () => { done(); gsap.set([el, ...rows], { clearProps: "height,overflow,boxSizing,transform,opacity,visibility" }); } }));
  if (rows.length) tl.to(rows, { y: -6, autoAlpha: 0, duration: 0.2, stagger: { each: 0.02, from: "end" }, ease: "power2.in" }, 0);
  tl.fromTo(el, { height: el.offsetHeight, overflow: "hidden", boxSizing: "border-box" }, { height: toH, duration: 0.38, ease: "wire" }, 0.05);
}

/**
 * Keeps a panel mounted while it plays closed. `open` is what the component wants; the returned flag is whether the
 * panel should be in the DOM. `enter` runs once the panel has mounted, `exit` must call its `done` when finished.
 */
export function usePresence(open: boolean, ref: RefObject<HTMLElement | null>, enter: (el: HTMLElement) => void, exit: (el: HTMLElement, done: () => void) => void) {
  const [shown, setShown] = useState(open);
  const enterRef = useRef(enter); enterRef.current = enter;
  const exitRef = useRef(exit); exitRef.current = exit;
  useEffect(() => {
    if (open) { setShown(true); return; }
    const el = ref.current;
    if (!el) { setShown(false); return; }
    let live = true;
    exitRef.current(el, () => { if (live) setShown(false); });
    return () => { live = false; };
  }, [open, ref]);
  // before paint, so the panel never flashes fully open for a frame
  useLayoutEffect(() => { if (open && ref.current) enterRef.current(ref.current); }, [open, ref]);
  return shown || open;
}

/** Content that changes in place (tabs, wizard steps): when `k` changes, the new content slides in from `dir`. */
export function useSwapIn(k: unknown, ref: RefObject<HTMLElement | null>, dir: 1 | -1 = 1) {
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = ref.current;
    if (!el || reduced()) return;
    const kids = Array.from(el.children);
    take(el, gsap.timeline().fromTo(kids, { x: 26 * dir, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, stagger: 0.045, ease: "snap", clearProps: "transform,opacity,visibility" }));
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
}
