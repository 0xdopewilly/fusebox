import { getStatus } from "@/lib/status";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Health of every part Fusebox depends on (cached 30 s). */
export async function GET(req: Request) {
  const s = await getStatus(new URL(req.url).origin);
  return Response.json(s, { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
