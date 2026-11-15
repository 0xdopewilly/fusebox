"use client";
import { useRef } from "react";
import { gsap, useGSAP, reduced } from "@/lib/gsap";

/** Runs on every navigation inside the app: a lime wire wipes under the bar and the page assembles. */
export default function Template({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (reduced()) return;
    const wipe = document.querySelector(".wipe");
    gsap.timeline().fromTo(wipe, { scaleX: 0, transformOrigin: "left", autoAlpha: 1 }, { scaleX: 1, duration: 0.5, ease: "wire" })
      .to(wipe, { scaleX: 0, transformOrigin: "right", duration: 0.5, ease: "wire" });
    gsap.from(ref.current!.querySelectorAll(".page .grid i"), { scaleY: 0, duration: 1.1, stagger: 0.05, ease: "wire" });
    gsap.from(ref.current!.querySelectorAll("[data-a]"), { y: 28, autoAlpha: 0, duration: 0.9, stagger: 0.07, ease: "snap", delay: 0.1 });
  }, []);
  return <div ref={ref}>{children}</div>;
}
