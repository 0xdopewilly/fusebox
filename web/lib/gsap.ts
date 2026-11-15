"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { CustomEase } from "gsap/CustomEase";
import { TextPlugin } from "gsap/TextPlugin";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin, CustomEase, TextPlugin, useGSAP);
CustomEase.create("snap", "0.16,1,0.3,1");
CustomEase.create("wire", "0.76,0,0.24,1");
gsap.defaults({ ease: "snap", duration: 1 });

export const BINARY = "01";
export const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Resolves once the intro curtain has opened (immediately if there is no intro this session). */
export function introDone(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { __fuseboxIntro?: Promise<void> };
  return w.__fuseboxIntro ?? Promise.resolve();
}

/** Runs `fn` once `el` comes within `margin` of the viewport, then refreshes ScrollTrigger so later sections measure the
 *  final layout. Sections below the fold use it so hydration doesn't pay for every animation on the page at once. */
let refreshQueued = false;
export function whenNear(el: Element | null, fn: () => void, margin = "120% 0px"): () => void {
  if (!el || typeof IntersectionObserver === "undefined") { fn(); return () => {}; }
  let done = false;
  const io = new IntersectionObserver((es) => {
    if (done || !es.some((e) => e.isIntersecting)) return;
    done = true; io.disconnect(); fn();
    if (!refreshQueued) { refreshQueued = true; requestAnimationFrame(() => { refreshQueued = false; ScrollTrigger.refresh(); }); }
  }, { rootMargin: margin });
  io.observe(el);
  return () => io.disconnect();
}

export { gsap, ScrollTrigger, SplitText, useGSAP };
