"use client";
import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";

/** A registration-mark cursor (desktop only). Elements with data-cursor="label" turn it and show the label. */
export default function Cursor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const el = ref.current!;
    const lab = el.querySelector(".lab") as HTMLElement;
    document.documentElement.classList.add("has-cursor");
    const xTo = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3" });
    const move = (e: PointerEvent) => {
      xTo(e.clientX); yTo(e.clientY);
      const t = (e.target as HTMLElement)?.closest?.("[data-cursor]") as HTMLElement | null;
      if (t) { lab.textContent = t.dataset.cursor || ""; el.classList.add("on"); } else el.classList.remove("on");
    };
    const down = () => el.classList.add("press");
    const up = () => el.classList.remove("press");
    const leave = () => gsap.to(el, { autoAlpha: 0, duration: 0.2 });
    const enter = () => gsap.to(el, { autoAlpha: 1, duration: 0.2 });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    document.addEventListener("mouseleave", leave);
    document.addEventListener("mouseenter", enter);
    return () => {
      document.documentElement.classList.remove("has-cursor");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("mouseleave", leave);
      document.removeEventListener("mouseenter", enter);
    };
  }, []);
  return (
    <div className="cursor" ref={ref} aria-hidden="true" style={{ transform: "translate(-100px,-100px)" }}>
      <div className="plus" />
      <div className="lab" />
    </div>
  );
}
