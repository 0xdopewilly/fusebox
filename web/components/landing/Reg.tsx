"use client";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";

/** Registration marks at a section's top corners and a hairline that draws across when the section arrives. */
export default function Reg() {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const el = ref.current!;
    const sec = el.parentElement!;
    const tl = gsap.timeline({ scrollTrigger: { trigger: sec, start: "top 85%" } });
    tl.from(el.querySelector(".rule"), { scaleX: 0, duration: 1.4, ease: "wire" })
      .from(el.querySelectorAll(".regmark"), { rotate: -90, autoAlpha: 0, duration: 0.8, stagger: 0.1 }, 0.2);
    sec.querySelectorAll<HTMLElement>("[data-scr]").forEach((s, i) =>
      tl.from(s, { scrambleText: { text: s.textContent || "", chars: "01", speed: 0.6 }, duration: 0.9 }, 0.15 + i * 0.1),
    );
  }, []);
  return (
    <div ref={ref} aria-hidden="true">
      <div className="rule" />
      <span className="regmark l">+</span>
      <span className="regmark r">+</span>
    </div>
  );
}
