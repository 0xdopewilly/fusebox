"use client";
import type { FuseLayout } from "@/lib/fuses";
import { useLang } from "@/lib/i18n";

const W = 520, H = 118, PAD = 6;

/** The fuse's real netlist: inputs on the left, one square per gate placed by logic depth, wires as curves. */
export default function Netlist({ f }: { f: FuseLayout }) {
  const { zh } = useLang();
  const cols: Record<number, number[]> = {};
  f.layout.forEach((g, i) => (cols[g.d] ||= []).push(i));
  const pos: Record<number, [number, number]> = {};
  const colX = (d: number) => PAD + (d / (f.depth + 1)) * (W - 2 * PAD);
  for (let s = 0; s < f.nIn; s++) pos[s] = [PAD, PAD + ((s + 0.5) / f.nIn) * (H - 2 * PAD)];
  Object.entries(cols).forEach(([d, ids]) => ids.forEach((i, k) => { pos[f.layout[i].out] = [colX(+d), PAD + ((k + 0.5) / ids.length) * (H - 2 * PAD)]; }));
  const wires: { d: string; depth: number }[] = [];
  f.layout.forEach((g) => {
    const [x, y] = pos[g.out];
    g.ins.forEach((s) => {
      const p = pos[s]; if (!p) return;
      const mx = (p[0] + x) / 2;
      wires.push({ d: `M${p[0].toFixed(1)} ${p[1].toFixed(1)}C${mx.toFixed(1)} ${p[1].toFixed(1)} ${mx.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`, depth: g.d });
    });
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={zh ? `${f.title} 网表，${f.gates} 个门` : `${f.title} netlist, ${f.gates} gates`}>
      <g fill="none" stroke="rgba(187,254,47,.18)" strokeWidth=".8">
        {wires.map((w, i) => <path key={i} d={w.d} data-depth={w.depth} className="wire" />)}
      </g>
      {Array.from({ length: f.nIn }, (_, s) => <rect key={`i${s}`} x={pos[s][0] - 1.5} y={pos[s][1] - 1.5} width="3" height="3" fill="#585855" className="pin" />)}
      {f.layout.map((g, i) => {
        const [x, y] = pos[g.out];
        return g.latch ? (
          <g key={i} className="latch" data-depth={g.d}>
            <rect x={x - 4.5} y={y - 4.5} width="9" height="9" fill="none" stroke="#bbfe2f" strokeWidth="1.5" />
            <rect x={x - 2} y={y - 2} width="4" height="4" className="gate" data-depth={g.d} />
          </g>
        ) : (
          <rect key={i} x={x - 2.5} y={y - 2.5} width="5" height="5" className="gate" data-depth={g.d} />
        );
      })}
    </svg>
  );
}
