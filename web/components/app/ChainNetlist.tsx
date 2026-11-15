"use client";
import { useEffect, useRef, useState } from "react";
import { keccak256, type Address, type Hex } from "viem";
import { tapeoutProcessorAbi } from "@/lib/abi";
import { pub } from "@/lib/client-chain";
import { decodeNetlist, OP_LATCH, OP_NAND, type NetEl } from "@/lib/tap02";

/** Reads a fuse's netlist straight from its TapeOut processor and checks it against the hash the registry pinned at listing.
 *  With `draw`, it also renders the real wiring as an arc diagram (used for fuses without a hand-laid schematic). */
export default function ChainNetlist({ processor, circuitId, nIn, pinned, draw }: { processor: Address; circuitId: number; nIn: number; pinned: Hex; draw?: boolean }) {
  const [st, setSt] = useState<{ bytes: number; nand: number; latch: number; ok: boolean } | null>(null);
  const [err, setErr] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    pub.readContract({ address: processor, abi: tapeoutProcessorAbi, functionName: "netlist", args: [BigInt(circuitId)] })
      .then((nl) => {
        if (!live) return;
        const els = decodeNetlist(nl as Hex, nIn);
        setSt({ bytes: ((nl as Hex).length - 2) / 2, nand: els.filter((e) => e.op === OP_NAND).length, latch: els.filter((e) => e.op === OP_LATCH).length, ok: keccak256(nl as Hex).toLowerCase() === pinned.toLowerCase() });
        if (draw && cv.current) arcs(cv.current, els, nIn);
      })
      .catch(() => live && setErr(true));
    return () => { live = false; };
  }, [processor, circuitId, nIn, pinned, draw]);
  return (
    <>
      {draw && <canvas ref={cv} style={{ width: "100%", height: 118, display: "block" }} aria-label={`Netlist of circuit #${circuitId}, read from TapeOut`} />}
      <div className="m" style={{ marginTop: 8, color: "var(--dim)" }} title="Read from the TapeOut processor and compared with the hash Fusebox's registry pinned when the fuse was listed">
        {err ? "Netlist: couldn't read TapeOut just now"
          : !st ? "Reading the netlist from TapeOut…"
          : <>{st.latch ? `${st.nand} NAND + ${st.latch} LATCH` : `${st.nand} NAND`} · {st.bytes} bytes read from TapeOut · <span style={{ color: st.ok ? "var(--lime)" : "var(--red)", whiteSpace: "nowrap" }}>{st.ok ? "✓ matches registry" : "✗ differs from registry"}</span></>}
      </div>
    </>
  );
}

function arcs(c: HTMLCanvasElement, els: NetEl[], nIn: number) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext("2d")!; g.scale(dpr, dpr);
  const base = h - 14, left = 2, right = w - 2, inW = Math.min((right - left) * 0.22, nIn * 5);
  const xIn = (k: number) => left + (nIn > 1 ? (k / (nIn - 1)) * inW : 0);
  const gx0 = left + inW + 14, step = (right - gx0) / Math.max(1, els.length - 1);
  const xOf = (s: number) => (s < 2 ? null : s < 2 + nIn ? xIn(s - 2) : (() => { const k = els.findIndex((e) => s >= e.firstOut && s < e.firstOut + e.nOut); return k < 0 ? null : gx0 + k * step; })());
  els.forEach((e, k) => {
    const x = gx0 + k * step;
    for (const s of e.ins) {
      const sx = xOf(s); if (sx === null) continue;
      const r = Math.abs(x - sx) / 2;
      g.beginPath(); g.ellipse((x + sx) / 2, base, r, Math.min(base - 4, r * 0.9 + 6), 0, Math.PI, 2 * Math.PI);
      g.strokeStyle = e.op === OP_LATCH ? "rgba(247,255,235,0.55)" : sx < gx0 ? "rgba(187,254,47,0.32)" : "rgba(187,254,47,0.16)"; g.lineWidth = 1; g.stroke();
    }
  });
  g.fillStyle = "#585855"; for (let k = 0; k < nIn; k++) g.fillRect(xIn(k) - 1, base + 1, 2, 8);
  els.forEach((e, k) => { g.fillStyle = e.op === OP_LATCH ? "#f7ffeb" : "#bbfe2f"; g.fillRect(gx0 + k * step - 1.5, base - 1.5, 3, e.op === OP_LATCH ? 8 : 4); });
}
