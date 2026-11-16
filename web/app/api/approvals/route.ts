import { isAddress, getAddress } from "viem";
import { inboxFor } from "@/lib/approvals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Payments waiting on an approver's signature, across every Fusebox wallet where they hold a seat. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams, a = sp.get("approver") ?? "";
  if (!isAddress(a, { strict: false })) return Response.json({ error: "Pass ?approver=0x…" }, { status: 400 });
  try {
    return Response.json(await inboxFor(getAddress(a.toLowerCase()), { fresh: sp.get("fresh") === "1" }), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("approvals", (e as Error).message);
    return Response.json({ error: "Couldn't reach X Layer just now." }, { status: 503 });
  }
}
