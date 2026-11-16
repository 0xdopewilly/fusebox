import { getAddress, isAddress, type Address } from "viem";
import { DEPLOYMENT } from "@/lib/chain";
import { getWallet, isFuseboxWallet } from "@/lib/atlas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const W = 6.7; // px per character of 10.5px monospace caps: widths are exact enough to never clip

/** A README badge for a Fusebox wallet: its fuses and whether any is blown, read from X Layer (cached 5 min). */
function svg(right: string, tone: "ok" | "bad" | "dim", label: string) {
  const lw = 74, rw = Math.ceil(right.length * W) + 18, w = lw + rw;
  const bg = tone === "ok" ? "#bbfe2f" : tone === "bad" ? "#ff5232" : "#3a3a3a", fg = tone === "dim" ? "#f2f2ee" : "#000";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" viewBox="0 0 ${w} 20" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>
<rect width="${lw}" height="20" fill="#000"/><rect x="${lw}" width="${rw}" height="20" fill="${bg}"/>
<g transform="translate(6 4)"><rect x="0" y="3" width="3" height="6" fill="#f2f2ee"/><rect x="13" y="3" width="3" height="6" fill="#f2f2ee"/><rect x="3" y="4.25" width="10" height="3.5" fill="none" stroke="#f2f2ee" stroke-width=".7"/><path d="M3 6h2.2l1-1.6 1.4 3.2 1-1.6H13" fill="none" stroke="#bbfe2f" stroke-width="1.1"/></g>
<g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace" font-size="10.5" font-weight="600" letter-spacing=".4">
<text x="26" y="14" fill="#f2f2ee">FUSEBOX</text><text x="${lw + 9}" y="14" fill="${fg}">${esc(right)}</text></g></svg>`;
}

export async function GET(_: Request, ctx: { params: Promise<{ address: string }> }) {
  const raw = (await ctx.params).address.replace(/\.svg$/i, "");
  const send = (body: string, maxAge = 300) => new Response(body, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=3600`, "access-control-allow-origin": "*" } });
  const addr = raw.toLowerCase() === "atlas" ? DEPLOYMENT.atlas : isAddress(raw, { strict: false }) ? (getAddress(raw.toLowerCase()) as Address) : null;
  if (!addr) return send(svg("NOT AN ADDRESS", "dim", "Fusebox: not an address"), 3600);
  try {
    if (!(await isFuseboxWallet(addr))) return send(svg("NOT A FUSEBOX WALLET", "dim", "Fusebox: not a Fusebox wallet"), 3600);
    const w = await getWallet(addr);
    const blown = w.fuses.filter((f) => f.latched).map((f) => f.name);
    const n = w.fuses.length;
    const [right, tone] = w.paused ? ["PAUSED BY OWNER", "bad"] as const : blown.length ? [`${blown.join(" + ").toUpperCase()} BLOWN`, "bad"] as const : !n ? ["NO FUSES", "dim"] as const : [`${n} FUSE${n === 1 ? "" : "S"} · NONE BLOWN`, "ok"] as const;
    return send(svg(right, tone, `Fusebox wallet ${addr}: ${right.toLowerCase()}`));
  } catch {
    return send(svg("X LAYER UNREACHABLE", "dim", "Fusebox: X Layer unreachable"), 60);
  }
}
