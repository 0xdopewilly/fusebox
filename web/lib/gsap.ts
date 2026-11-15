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

export { gsap, ScrollTrigger, SplitText, useGSAP };
