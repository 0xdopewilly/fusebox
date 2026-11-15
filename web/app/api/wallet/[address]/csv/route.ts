import { isAddress, getAddress } from "viem";
import { getHistory, isFuseboxWallet } from "@/lib/atlas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A spreadsheet cell: quoted when needed, and never read as a formula (memos come from the agent). */
const cell = (v: string | number) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every decision the wallet has recorded, as CSV for accounting. */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!isAddress(address, { strict: false })) return new Response("Not an address.", { status: 400 });
  const addr = getAddress(address.toLowerCase());
  try {
    if (!(await isFuseboxWallet(addr))) return new Response("This address isn't a Fusebox wallet.", { status: 404 });
    const { rows, payees, names } = await getHistory(addr);
    const saved = new Set([...payees.keys()].map((a) => a.toLowerCase()));
    const head = ["decision", "time_utc", "block", "result", "amount_usdt0", "to", "to_is_saved_payee", "memo", "fees_usdt0", "fuse_verdicts", "tx"];
    const lines = rows.map((r) => [
      r.id, new Date(r.time * 1000).toISOString().replace(".000Z", "Z"), r.block, r.allowed ? "paid" : "stopped", r.amount, r.to,
      saved.has(r.to.toLowerCase()) ? "yes" : "no", r.memo, r.fee,
      r.status.map((s, i) => `${r.status.length === names.length ? names[i] : `slot ${i + 1}`}: ${s}`).join("; "), r.tx,
    ].map(cell).join(","));
    return new Response([head.join(","), ...lines].join("\r\n") + "\r\n", {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="fusebox-${addr.slice(0, 8)}-decisions.csv"`, "cache-control": "no-store" },
    });
  } catch (e) {
    console.error("csv", (e as Error).message);
    return new Response("Couldn't reach X Layer just now.", { status: 503 });
  }
}
