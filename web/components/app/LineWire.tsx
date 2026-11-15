"use client";
import { useEffect, useRef, useState } from "react";
import { gsap, useGSAP, reduced } from "@/lib/gsap";

export type WireStatus = "idle" | "checking" | "pass" | "blew" | "latched";
export interface WireFuse { name: string; meta: string }

const Y = 70, X0 = 8, X1 = 872, FW = 126, NODE = 110;
const GAP = (X1 - X0 - NODE * 2 - FW * 4) / 5;
const XS = [0, 1, 2, 3].map((i) => X0 + NODE + GAP * (i + 1) + FW * i);
const zig = (x: number) => `M${x + 22} ${Y}h12l5-9 7 18 7-18 7 18 7-18 5 9h${FW - 44 - 12 - 43}`;
const LABEL: Record<WireStatus, [string, string]> = {
  idle: ["WAITING", "#585855"], checking: ["CHECKING", "#f2f2ee"], pass: ["HOLDS", "#bbfe2f"], blew: ["BLEW", "#ff5232"], latched: ["BLOWN", "#ff5232"],
};

/**
 * The payment line. Live mode shows the wallet's standing state with current flowing up to the first open fuse.
 * When `run` changes, it plays one check: the pulse travels, every fuse answers in turn, and blown fuses spark.
 */
export default function LineWire({
  fuses, live, run, payee = "PAYEE", payeeSub = "", selected, onSelect, onDone,
}: {
  fuses: WireFuse[]; live?: WireStatus[]; run?: { id: number; status: WireStatus[] } | null;
  payee?: string; payeeSub?: string; selected?: number | null; onSelect?: (i: number) => void; onDone?: () => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [shown, setShown] = useState<WireStatus[]>(live ?? fuses.map(() => "idle"));
  const [current, setCurrent] = useState<number>(-1); // x where current stops; -1 = no current
  useEffect(() => { if (live && !run) setShown(live); }, [live, run]);

  // where the current reaches for a given set of statuses
  const reach = (st: WireStatus[]) => { const k = st.findIndex((s) => s === "blew" || s === "latched"); return k < 0 ? X1 - NODE : XS[k] + FW / 2 - 9; };
  useEffect(() => { if (live && !run) setCurrent(reach(live)); }, [live, run]);

  useGSAP(() => {
    if (!run) return;
    const svg = ref.current!;
    const pulse = svg.querySelector(".pulse")!;
    const firstBad = run.status.findIndex((s) => s === "blew" || s === "latched");
    const stopX = firstBad < 0 ? X1 - NODE : XS[firstBad] + FW / 2;
    setShown(fuses.map(() => "idle")); setCurrent(-1);
    if (reduced()) { setShown(run.status); setCurrent(reach(run.status)); onDone?.(); return; }
    const tl = gsap.timeline({ onComplete: () => onDone?.() });
    gsap.set(pulse, { x: 0, scale: 1, autoAlpha: 0, transformOrigin: "center" });
    tl.to(pulse, { autoAlpha: 1, duration: 0.1 });
    const order = run.status.map((_, i) => i);
    order.forEach((i) => {
      const reached = firstBad < 0 || i <= firstBad;
      if (reached) tl.to(pulse, { x: XS[i] + FW / 2 - (X0 + NODE), duration: 0.32, ease: "power2.inOut" });
      tl.add(() => setShown((s) => s.map((v, k) => (k === i ? "checking" : v))), reached ? "-=0.12" : "+=0.02");
      tl.add(() => setShown((s) => s.map((v, k) => (k === i ? run.status[i] : v))), "+=0.22");
      if (i === firstBad) {
        tl.to(pulse, { scale: 3.2, autoAlpha: 0, duration: 0.18 });
        tl.add(() => { const g = svg.querySelectorAll(`.fz-${i} .sparks line`); gsap.fromTo(g, { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.18, stagger: 0.02 }); });
      }
    });
    if (firstBad < 0) tl.to(pulse, { x: stopX - (X0 + NODE), duration: 0.3 }).to(pulse, { scale: 2.6, autoAlpha: 0, duration: 0.2 });
    tl.add(() => setCurrent(reach(run.status)));
  }, { dependencies: [run?.id] });

  return (
    <svg ref={ref} viewBox="0 0 880 170" role="img" aria-label="The payment line: agent, four fuses in series, payee">
      <line x1={X0 + NODE} y1={Y} x2={X1 - NODE} y2={Y} stroke="#2e2e2c" strokeWidth="2.5" strokeDasharray="6 5" />
      {current > 0 && <line x1={X0 + NODE} y1={Y} x2={current} y2={Y} stroke="#bbfe2f" strokeWidth="2.5" />}
      {current > 0 && <line x1={X0 + NODE} y1={Y} x2={current} y2={Y} stroke="#ffffff" strokeWidth="2.5" className="flow" opacity=".85" />}
      <rect x={X0} y={Y - 28} width={NODE} height="56" fill="#0b0b0b" stroke="rgba(255,255,255,.2)" />
      <text x={X0 + 12} y={Y - 5} fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="15">ATLAS</text>
      <text x={X0 + 12} y={Y + 14} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".6">AGENT KEY</text>
      <rect x={X1 - NODE} y={Y - 28} width={NODE} height="56" fill="#0b0b0b" stroke={current >= X1 - NODE - 1 ? "#bbfe2f" : "rgba(255,255,255,.2)"} />
      <text x={X1 - NODE + 12} y={Y - 5} fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="15">{payee}</text>
      <text x={X1 - NODE + 12} y={Y + 14} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".6">{payeeSub}</text>
      {fuses.map((f, i) => {
        const x = XS[i], cx = x + FW / 2, st = shown[i] ?? "idle";
        const bad = st === "blew" || st === "latched";
        const [lab, col] = LABEL[st];
        return (
          <g key={i} className={`fz-${i}${onSelect ? " fz-hit" : ""}${selected === i ? " sel" : ""}`} onClick={() => onSelect?.(i)} data-cursor={onSelect ? "Inspect" : undefined}>
            <rect x={x - 6} y={Y - 34} width={FW + 12} height="128" fill="transparent" />
            <rect x={x} y={Y - 22} width="22" height="44" fill="#d9d9d4" /><rect x={x + FW - 22} y={Y - 22} width="22" height="44" fill="#d9d9d4" />
            <rect x={x + 3} y={Y - 22} width="2" height="44" fill="#9a9a96" /><rect x={x + FW - 5} y={Y - 22} width="2" height="44" fill="#9a9a96" />
            <rect x={x + 22} y={Y - 16} width={FW - 44} height="32" fill="#0b0b0b" stroke="rgba(255,255,255,.35)" className="glass" />
            {!bad && <path d={zig(x)} fill="none" stroke={st === "pass" ? "#bbfe2f" : st === "checking" ? "#f2f2ee" : "#3a3a38"} strokeWidth="2" style={{ transition: "stroke .25s" }} />}
            {bad && (
              <g>
                <path d={`M${x + 22} ${Y}h12l5-9 6 15`} fill="none" stroke="#ff5232" strokeWidth="2" />
                <path d={`M${cx + 10} ${Y + 6}l5-15 7 18 5-9h${FW - 44 - 58}`} fill="none" stroke="#5a5a57" strokeWidth="2" />
                <g stroke="#ff5232" strokeWidth="1.6" className="sparks" opacity={st === "blew" ? 1 : 0.55}>
                  <line x1={cx} y1={Y - 2} x2={cx - 6} y2={Y - 30} /><line x1={cx + 3} y1={Y - 2} x2={cx + 14} y2={Y - 28} />
                  <line x1={cx + 2} y1={Y} x2={cx + 22} y2={Y - 12} /><line x1={cx - 1} y1={Y} x2={cx - 20} y2={Y - 16} />
                </g>
              </g>
            )}
            <text x={x} y={Y + 50} fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="14">{f.name.toUpperCase()}</text>
            <text x={x} y={Y + 68} fill={col} fontFamily="var(--f-mono)" fontWeight="600" fontSize="10.5" letterSpacing=".8">{lab}</text>
            <text x={x} y={Y + 86} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".4">{f.meta.toUpperCase()}</text>
          </g>
        );
      })}
      <rect x={X0 + NODE - 5} y={Y - 5} width="10" height="10" fill="#fff" className="pulse" opacity="0" style={{ filter: "drop-shadow(0 0 6px #bbfe2f) drop-shadow(0 0 14px #bbfe2f)" }} />
    </svg>
  );
}
