import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getAddress, isAddress, type Address } from "viem";
import { getWallet, isFuseboxWallet, type Atlas } from "./atlas";

/** The share card for one wallet: its live fuses and decisions, read from X Layer when the link is first unfurled. */
export const OG_SIZE = { width: 1200, height: 630 };

const C = { lime: "#bbfe2f", ink: "#f2f2ee", soft: "#c9c9c4", mute: "#9d9d98", red: "#ff5232", hair: "rgba(255,255,255,0.08)", hair2: "rgba(255,255,255,0.14)" };
const MONO = { fontFamily: "Geist Mono", fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase" as const };

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 500 | 800 }[]> | null = null;
const loadFonts = () => (fonts ??= Promise.all([
  ["Archivo", "archivo-800.ttf", 800], ["Geist", "geist-400.ttf", 400], ["Geist Mono", "geist-mono-500.ttf", 500],
  // ₮ for USD₮0, which none of the three draws (scripts/build-tugrik.py)
  ["Fusebox Tug Display", "tug-display-800.ttf", 800], ["Fusebox Tug Sans", "tug-sans-400.ttf", 400], ["Fusebox Tug Mono", "tug-mono-500.ttf", 500],
].map(async ([name, file, weight]) => ({ name: name as string, data: await readFile(join(process.cwd(), "assets/og", file as string)), weight: weight as 400 | 500 | 800 }))));

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const num = (v: string) => { const n = Number(v); return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toFixed(4).replace(/0{1,2}$/, ""); };

function Fuse({ blown, width = 236 }: { blown: boolean; width?: number }) {
  return (
    <svg width={width} height={Math.round((40 * width) / 236)} viewBox="0 0 236 40">
      <rect x="0" y="4" width="20" height="32" fill={C.ink} />
      <rect x="216" y="4" width="20" height="32" fill={C.ink} />
      <rect x="20.5" y="10.5" width="195" height="19" fill="none" stroke="rgba(255,255,255,0.22)" />
      {blown ? (
        <>
          <path d="M20 20 H92 L100 13" fill="none" stroke={C.red} strokeWidth="2.5" />
          <path d="M134 27 L142 20 H216" fill="none" stroke={C.red} strokeWidth="2.5" />
          <path d="M112 8 L116 16 M124 9 L120 17 M106 22 L113 20 M130 21 L123 20" stroke={C.red} strokeWidth="2" />
        </>
      ) : (
        <path d="M20 20 H84 L92 11 L102 29 L112 11 L122 29 L132 11 L140 20 H216" fill="none" stroke={C.lime} strokeWidth="2.5" />
      )}
    </svg>
  );
}

function Card({ addr, w }: { addr: string; w: Atlas | null }) {
  const fuses = w?.fuses ?? [];
  const blownNames = fuses.filter((f) => f.latched).map((f) => f.name);
  const blown = blownNames.length;
  // a v2 wallet has five fuses (Repeat Guard): show up to five in one row, past that four and a "+N more" cell
  const shown = fuses.length > 5 ? fuses.slice(0, 4) : fuses;
  const more = fuses.length - shown.length;
  const cols = Math.max(4, shown.length + (more ? 1 : 0));
  const colW = Math.floor((1120 - (cols - 1) * 20) / cols);
  const eyebrow = w?.isAtlas ? "[Atlas] public demo wallet" : "[Wallet] on X Layer";
  const state = !w ? "" : w.paused ? "Paused by its owner · nothing can be paid" : blown ? `${blownNames.join(" and ")} blown · nothing can be paid until the owner resets it` : "Line closed · every fuse is holding";
  const stats: [string, string, string][] = w ? [
    [String(w.counts.decisions), "decisions", C.ink], [String(w.counts.blocked), "payments stopped", w.counts.blocked ? C.red : C.ink],
    [num(w.balance), "USD₮0 in the wallet", C.ink], [num(w.paidToDesigners), "USD₮0 paid to designers", C.lime],
  ] : [];
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#000", color: C.ink, fontFamily: "Geist" }}>
      <div style={{ position: "absolute", left: 40, right: 40, top: 0, bottom: 0, display: "flex" }}>
        {Array.from({ length: 6 }, (_, i) => <div key={i} style={{ flex: 1, borderLeft: `1px solid ${C.hair}`, borderRight: i === 5 ? `1px solid ${C.hair}` : "none" }} />)}
      </div>

      <div style={{ position: "absolute", left: 40, right: 40, top: 0, height: 84, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.hair2}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "Archivo", fontSize: 28, textTransform: "uppercase" }}>
          <svg width="44" height="20" viewBox="0 0 30 14"><rect x=".5" y="1.5" width="6" height="11" fill={C.ink} /><rect x="23.5" y="1.5" width="6" height="11" fill={C.ink} /><rect x="6.5" y="3.5" width="17" height="7" fill="none" stroke={C.ink} /><path d="M6.5 7h4.5l1.6-2.6 2 5.2 1.6-2.6h7.3" fill="none" stroke={C.lime} strokeWidth="1.4" /></svg>
          Fusebox
        </div>
        <div style={{ ...MONO, color: C.mute, display: "flex", alignItems: "center" }}><div style={{ width: 9, height: 9, background: C.lime, marginRight: 10 }} />Built on&nbsp;<span style={{ color: C.lime }}>TapeOut</span>&nbsp;× X Layer</div>
      </div>

      <div style={{ position: "absolute", left: 40, top: 118, display: "flex", flexDirection: "column", width: 640 }}>
        <div style={{ ...MONO, color: C.lime, display: "flex" }}>{eyebrow}</div>
        <div style={{ fontFamily: "Archivo", fontSize: 84, lineHeight: 0.9, letterSpacing: "-0.04em", marginTop: 20, display: "flex", flexDirection: "column" }}>
          <span>WALLET</span>
          <span style={{ color: C.lime }}>{isAddress(addr) ? short(addr) : "on X Layer"}</span>
        </div>
        <div style={{ marginTop: 20, fontSize: 23, lineHeight: 1.4, color: C.soft, display: "flex" }}>
          {w ? "Its AI agent can only pay through these fuses." : "Its AI agent can only pay through the fuses its owner chose."}
        </div>
      </div>

      {w && (
        <div style={{ position: "absolute", left: 760, right: 40, top: 118, display: "flex", flexWrap: "wrap", borderTop: `1px solid ${C.hair2}` }}>
          {stats.map(([v, l, color]) => (
            <div key={l} style={{ width: "50%", height: 104, display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 18, borderBottom: `1px solid ${C.hair2}`, borderLeft: `1px solid ${C.hair2}` }}>
              <div style={{ fontFamily: "Archivo", fontSize: 40, letterSpacing: "-0.03em", color }}>{v}</div>
              <div style={{ ...MONO, fontSize: 12, color: C.mute, marginTop: 6 }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {w && (
        <div style={{ position: "absolute", left: 40, right: 40, top: 398, display: "flex", flexDirection: "column" }}>
          <div style={{ ...MONO, fontSize: 13, color: w.paused || blown ? C.red : C.lime, display: "flex", marginBottom: 14 }}>{state}</div>
          <div style={{ display: "flex", gap: 20 }}>
            {shown.map((f) => (
              <div key={f.slot} style={{ display: "flex", flexDirection: "column", width: colW }}>
                <Fuse blown={f.latched} width={Math.min(236, colW)} />
                <div style={{ fontFamily: "Archivo", fontSize: cols > 4 ? 21 : 22, textTransform: "uppercase", marginTop: 12, letterSpacing: "-0.01em" }}>{f.name}</div>
                <div style={{ ...MONO, fontSize: 12, color: f.latched ? C.red : C.mute, marginTop: 4 }}>{`${f.latched ? "Blown · " : ""}TapeOut #${f.circuitId} · ${f.gates} gates`}</div>
              </div>
            ))}
            {more > 0 && <div style={{ ...MONO, fontSize: 13, color: C.mute, display: "flex", alignItems: "center", width: colW }}>{`+${more} more fuses`}</div>}
            {fuses.length === 0 && <div style={{ ...MONO, color: C.mute }}>No fuses installed yet</div>}
          </div>
        </div>
      )}

      <div style={{ position: "absolute", left: 40, right: 40, bottom: 0, height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `1px solid ${C.hair2}`, ...MONO, color: C.mute }}>
        <div style={{ display: "flex" }}>AI agents pay.&nbsp;<span style={{ color: C.lime }}>TapeOut circuits decide.</span></div>
        <div style={{ color: C.ink, display: "flex", textTransform: "none" }}>{`fusebox-xlayer.vercel.app/app/w/${isAddress(addr) ? short(addr) : ""}`}</div>
      </div>
    </div>
  );
}

export async function walletCard(raw: string) {
  let w: Atlas | null = null;
  if (isAddress(raw, { strict: false })) {
    const addr = getAddress(raw.toLowerCase()) as Address;
    // a crawler won't wait long: past 8 s the card goes out without live numbers
    w = await Promise.race([
      Promise.all([isFuseboxWallet(addr), getWallet(addr).catch(() => null)]).then(([ok, w]) => (ok ? w : null)),
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]).catch(() => null);
  }
  return new ImageResponse(<Card addr={raw} w={w} />, {
    ...OG_SIZE, fonts: await loadFonts(),
    headers: { "cache-control": w ? "public, max-age=300, s-maxage=300, stale-while-revalidate=86400" : "public, max-age=60" },
  });
}
