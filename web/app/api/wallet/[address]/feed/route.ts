import { isAddress, getAddress } from "viem";
import { getHistory, isFuseboxWallet } from "@/lib/atlas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = "https://fusebox-xlayer.vercel.app";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** An Atom feed of the wallet's decisions, newest first: subscribe in Slack, email digests or any reader to hear about stopped payments. */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!isAddress(address, { strict: false })) return new Response("Not an address.", { status: 400 });
  const addr = getAddress(address.toLowerCase());
  try {
    if (!(await isFuseboxWallet(addr))) return new Response("This address isn't a Fusebox wallet.", { status: 404 });
    const { rows, names } = await getHistory(addr);
    const page = `${SITE}/app/w/${addr}`;
    const latest = rows.slice(-50).reverse();
    const updated = new Date((latest[0]?.time ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
    const entries = latest.map((r) => {
      const blew = r.status.map((s, i) => (s !== "pass" ? (r.status.length === names.length ? names[i] : `slot ${i + 1}`) : null)).filter(Boolean);
      const title = r.allowed ? `Paid ${r.amount} USDT0 to ${short(r.to)}` : `Stopped: ${r.amount} USDT0 to ${short(r.to)} · ${blew.join(", ")} said no`;
      const body = `Decision #${r.id} on X Layer. The agent said: “${r.memo}”. ${r.allowed ? "Every fuse held and the payment went through." : `${blew.join(", ")} refused it; nothing moved.`} Fees: ${r.fee} USDT0. Transaction: https://www.oklink.com/xlayer/tx/${r.tx}`;
      return `<entry><id>tag:fusebox-xlayer.vercel.app,2026:${addr}:${r.id}</id><title>${esc(title)}</title><link href="${page}"/><updated>${new Date(r.time * 1000).toISOString()}</updated><summary>${esc(body)}</summary><category term="${r.allowed ? "paid" : "stopped"}"/></entry>`;
    });
    const xml = `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><id>tag:fusebox-xlayer.vercel.app,2026:${addr}</id><title>Fusebox wallet ${short(addr)}: decisions</title><subtitle>Every payment its agent asked for, and what the fuses said.</subtitle><link rel="self" href="${SITE}/api/wallet/${addr}/feed"/><link href="${page}"/><updated>${updated}</updated><author><name>Fusebox</name></author>${entries.join("")}</feed>\n`;
    return new Response(xml, { headers: { "content-type": "application/atom+xml; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=60" } });
  } catch (e) {
    console.error("feed", (e as Error).message);
    return new Response("Couldn't reach X Layer just now.", { status: 503 });
  }
}
