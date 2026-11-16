import { isAddress, getAddress } from "viem";
import { inboxFor } from "@/lib/approvals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = "https://fusebox-xlayer.vercel.app";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** An Atom feed of the payments waiting on this approver, for Slack, email digests or any reader. */
export async function GET(req: Request) {
  const a = new URL(req.url).searchParams.get("approver") ?? "";
  if (!isAddress(a, { strict: false })) return new Response("Pass ?approver=0x…", { status: 400 });
  const approver = getAddress(a.toLowerCase());
  try {
    const box = await inboxFor(approver);
    const entries = box.open.map((r) => {
      const n = [0, 1, 2].filter((i) => (r.mask >> i) & 1).length;
      const link = `${SITE}/app/approve?wallet=${r.wallet}&to=${r.to}&amount=${r.amount}`;
      const title = `Needs approval: ${r.amount} USDT0 to ${short(r.to)}${r.isAtlas ? " (Atlas)" : ""} · ${n} of 2 signed`;
      const body = `The agent of wallet ${r.wallet} asked to pay ${r.amount} USDT0 to ${r.to} (${r.saved ? "a saved payee" : "not a saved payee"}) and was refused until two approvers sign. It said: “${r.memo}”. Attempts: ${r.attempts}. Sign it at ${link}`;
      return `<entry><id>tag:fusebox-xlayer.vercel.app,2026:approval:${r.wallet}:${r.to}:${r.amount}:${r.first}</id><title>${esc(title)}</title><link href="${esc(link)}"/><updated>${new Date(r.last * 1000).toISOString()}</updated><summary>${esc(body)}</summary></entry>`;
    });
    const updated = new Date((box.open[0]?.last ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
    const xml = `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><id>tag:fusebox-xlayer.vercel.app,2026:approvals:${approver}</id><title>Fusebox approvals for ${short(approver)}</title><link rel="self" href="${SITE}/api/approvals/feed?approver=${approver}"/><link href="${SITE}/app/approve"/><updated>${updated}</updated><author><name>Fusebox</name></author>${entries.join("")}</feed>\n`;
    return new Response(xml, { headers: { "content-type": "application/atom+xml; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=60" } });
  } catch (e) {
    console.error("approvals feed", (e as Error).message);
    return new Response("Couldn't reach X Layer just now.", { status: 503 });
  }
}
