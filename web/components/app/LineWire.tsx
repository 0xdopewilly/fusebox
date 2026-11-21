"use client";
import { useEffect, useRef, useState } from "react";
import { gsap, useGSAP, reduced } from "@/lib/gsap";

export type WireStatus = "idle" | "checking" | "pass" | "blew" | "latched";
export interface WireFuse { name: string; meta: string }

const LABEL: Record<WireStatus, [string, string]> = {
  idle: ["WAITING", "#80807c"], checking: ["CHECKING", "#f2f2ee"], pass: ["HOLDS", "#bbfe2f"], blew: ["BLEW", "#ff5232"], latched: ["BLOWN", "#ff5232"],
};
const FW = 126; // cartridge length along the wire

/** Geometry for one orientation: where each fuse sits along the wire axis, and how the SVG is framed. */
interface Geom { vertical: boolean; vb: string; start: number; end: number; pos: number[]; cross: number }
// laid out for any number of fuses: four fill the original 880-wide frame, and each one more adds a slot
const H = (n: number): Geom => {
  const X0 = 8, NODE = 110, GAP = 28, X1 = X0 + NODE * 2 + FW * n + GAP * (n + 1);
  return { vertical: false, vb: `0 0 ${X1 + 8} 170`, start: X0 + NODE, end: X1 - NODE, pos: Array.from({ length: n }, (_, i) => X0 + NODE + GAP * (i + 1) + FW * i), cross: 70 };
};
const V = (n: number): Geom => {
  const end = 96 + (n - 1) * 150 + FW + 28;
  return { vertical: true, vb: `0 0 360 ${end + 60}`, start: 64, end, pos: Array.from({ length: n }, (_, i) => 96 + i * 150), cross: 48 };
};

/** A horizontal cartridge from x to x+FW centred on y; rotated into place for the vertical wire. */
function Cartridge({ x, y, st, cx }: { x: number; y: number; st: WireStatus; cx: number }) {
  const bad = st === "blew" || st === "latched";
  const zig = `M${x + 22} ${y}h12l5-9 7 18 7-18 7 18 7-18 5 9h${FW - 44 - 12 - 43}`;
  return (
    <>
      <rect x={x} y={y - 22} width="22" height="44" fill="#d9d9d4" /><rect x={x + FW - 22} y={y - 22} width="22" height="44" fill="#d9d9d4" />
      <rect x={x + 3} y={y - 22} width="2" height="44" fill="#9a9a96" /><rect x={x + FW - 5} y={y - 22} width="2" height="44" fill="#9a9a96" />
      <rect x={x + 22} y={y - 16} width={FW - 44} height="32" fill="#0b0b0b" stroke="rgba(255,255,255,.35)" className="glass" />
      {!bad && <path d={zig} fill="none" stroke={st === "pass" ? "#bbfe2f" : st === "checking" ? "#f2f2ee" : "#3a3a38"} strokeWidth="2" style={{ transition: "stroke .25s" }} />}
      {bad && (
        <g>
          <path d={`M${x + 22} ${y}h12l5-9 6 15`} fill="none" stroke="#ff5232" strokeWidth="2" />
          <path d={`M${cx + 10} ${y + 6}l5-15 7 18 5-9h${FW - 44 - 58}`} fill="none" stroke="#5a5a57" strokeWidth="2" />
          <g stroke="#ff5232" strokeWidth="1.6" className="sparks" opacity={st === "blew" ? 1 : 0.55}>
            <line x1={cx} y1={y - 2} x2={cx - 6} y2={y - 30} /><line x1={cx + 3} y1={y - 2} x2={cx + 14} y2={y - 28} />
            <line x1={cx + 2} y1={y} x2={cx + 22} y2={y - 12} /><line x1={cx - 1} y1={y} x2={cx - 20} y2={y - 16} />
          </g>
        </g>
      )}
    </>
  );
}

function useNarrow(q = "(max-width: 700px)") {
  const [m, setM] = useState(false);
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); f(); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, [q]);
  return m;
}

/**
 * The payment line. Live mode shows the wallet's standing state with current flowing up to the first open fuse.
 * When `run` changes, it plays one check: the pulse travels, every fuse answers in turn, and blown fuses spark.
 * On narrow screens the wire runs top to bottom.
 */
export default function LineWire({
  fuses, live, run, payee = "PAYEE", payeeSub = "", selected, onSelect, onDone,
}: {
  fuses: WireFuse[]; live?: WireStatus[]; run?: { id: number; status: WireStatus[] } | null;
  payee?: string; payeeSub?: string; selected?: number | null; onSelect?: (i: number) => void; onDone?: () => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const narrow = useNarrow(), n = Math.max(1, fuses.length);
  const g = narrow ? V(n) : H(n);
  const [shown, setShown] = useState<WireStatus[]>(live ?? fuses.map(() => "idle"));
  const [current, setCurrent] = useState<number>(-1); // position along the wire where current stops; -1 = none
  const reach = (st: WireStatus[]) => { const k = st.findIndex((s) => s === "blew" || s === "latched"); return k < 0 ? g.end : g.pos[k] + FW / 2 - 9; };
  useEffect(() => { if (live && !run) { setShown(live); setCurrent(reach(live)); } }, [live, run, g.vertical]); // eslint-disable-line react-hooks/exhaustive-deps

  useGSAP(() => {
    if (!run) return;
    const svg = ref.current!;
    const pulse = svg.querySelector(".pulse")!;
    const ax = g.vertical ? "y" : "x";
    const firstBad = run.status.findIndex((s) => s === "blew" || s === "latched");
    setShown(fuses.map(() => "idle")); setCurrent(-1);
    if (reduced()) { setShown(run.status); setCurrent(reach(run.status)); onDone?.(); return; }
    const tl = gsap.timeline({ onComplete: () => onDone?.() });
    gsap.set(pulse, { x: 0, y: 0, scale: 1, autoAlpha: 0, transformOrigin: "center" });
    tl.to(pulse, { autoAlpha: 1, duration: 0.1 });
    run.status.forEach((_, i) => {
      const reached = firstBad < 0 || i <= firstBad;
      if (reached) tl.to(pulse, { [ax]: g.pos[i] + FW / 2 - g.start, duration: 0.32, ease: "power2.inOut" });
      tl.add(() => setShown((s) => s.map((v, k) => (k === i ? "checking" : v))), reached ? "-=0.12" : "+=0.02");
      tl.add(() => setShown((s) => s.map((v, k) => (k === i ? run.status[i] : v))), "+=0.22");
      if (i === firstBad) {
        tl.to(pulse, { scale: 3.2, autoAlpha: 0, duration: 0.18 });
        tl.add(() => { gsap.fromTo(svg.querySelectorAll(`.fz-${i} .sparks line`), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.18, stagger: 0.02 }); });
      }
    });
    if (firstBad < 0) tl.to(pulse, { [ax]: g.end - g.start, duration: 0.3 }).to(pulse, { scale: 2.6, autoAlpha: 0, duration: 0.2 });
    tl.add(() => setCurrent(reach(run.status)));
  }, { dependencies: [run?.id] });

  const C = g.cross;
  const line = (a: number, b: number, props: React.SVGProps<SVGLineElement>) =>
    g.vertical ? <line x1={C} y1={a} x2={C} y2={b} {...props} /> : <line x1={a} y1={C} x2={b} y2={C} {...props} />;
  const payeeLit = current >= g.end - 1;

  return (
    <svg ref={ref} viewBox={g.vb} role="img" aria-label="The payment line: agent, four fuses in series, payee" className={g.vertical ? "vert" : ""}>
      {line(g.start, g.end, { stroke: "#2e2e2c", strokeWidth: 2.5, strokeDasharray: "6 5" })}
      {current > 0 && line(g.start, current, { stroke: "#bbfe2f", strokeWidth: 2.5 })}
      {current > 0 && line(g.start, current, { stroke: "#ffffff", strokeWidth: 2.5, className: "flow", opacity: 0.85 })}
      {g.vertical ? (
        <>
          <rect x="8" y="8" width="344" height="56" fill="#0b0b0b" stroke="rgba(255,255,255,.2)" />
          <text x="20" y="31" fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="15">ATLAS</text>
          <text x="20" y="50" fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".6">AGENT KEY</text>
          <rect x="8" y={g.end} width="344" height="56" fill="#0b0b0b" stroke={payeeLit ? "#bbfe2f" : "rgba(255,255,255,.2)"} />
          <text x="20" y={g.end + 23} fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="15">{payee}</text>
          <text x="20" y={g.end + 42} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".6">{payeeSub}</text>
        </>
      ) : (
        <>
          <rect x="8" y={C - 28} width="110" height="56" fill="#0b0b0b" stroke="rgba(255,255,255,.2)" />
          <text x="20" y={C - 5} fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="15">ATLAS</text>
          <text x="20" y={C + 14} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".6">AGENT KEY</text>
          <rect x={g.end} y={C - 28} width="110" height="56" fill="#0b0b0b" stroke={payeeLit ? "#bbfe2f" : "rgba(255,255,255,.2)"} />
          <text x={g.end + 12} y={C - 5} fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="15">{payee}</text>
          <text x={g.end + 12} y={C + 14} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".6">{payeeSub}</text>
        </>
      )}
      {fuses.map((f, i) => {
        const p = g.pos[i], st = shown[i] ?? "idle";
        const [lab, col] = LABEL[st];
        const tx = g.vertical ? 104 : p, ty = g.vertical ? p + FW / 2 - 14 : C + 50;
        return (
          <g key={i} className={`fz-${i}${onSelect ? " fz-hit" : ""}${selected === i ? " sel" : ""}`} onClick={() => onSelect?.(i)} data-cursor={onSelect ? "Inspect" : undefined}>
            {g.vertical ? <rect x="8" y={p - 6} width="344" height={FW + 12} fill="transparent" /> : <rect x={p - 6} y={C - 34} width={FW + 12} height="128" fill="transparent" />}
            {g.vertical
              ? <g transform={`rotate(90 ${C} ${p + FW / 2})`}><Cartridge x={C - FW / 2} y={p + FW / 2} st={st} cx={C} /></g>
              : <Cartridge x={p} y={C} st={st} cx={p + FW / 2} />}
            <text x={tx} y={ty} fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="14">{f.name.toUpperCase()}</text>
            <text x={tx} y={ty + 18} fill={col} fontFamily="var(--f-mono)" fontWeight="600" fontSize="10.5" letterSpacing=".8">{lab}</text>
            {f.meta && <text x={tx} y={ty + 36} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".4">{f.meta.toUpperCase()}</text>}
          </g>
        );
      })}
      {g.vertical
        ? <rect x={C - 5} y={g.start - 5} width="10" height="10" fill="#fff" className="pulse" opacity="0" style={{ filter: "drop-shadow(0 0 6px #bbfe2f) drop-shadow(0 0 14px #bbfe2f)" }} />
        : <rect x={g.start - 5} y={C - 5} width="10" height="10" fill="#fff" className="pulse" opacity="0" style={{ filter: "drop-shadow(0 0 6px #bbfe2f) drop-shadow(0 0 14px #bbfe2f)" }} />}
    </svg>
  );
}
