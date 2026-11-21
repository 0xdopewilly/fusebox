import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Scheduled routes (the alert sweeps) run only for the GitHub workflows that call them: they send
 * `Authorization: Bearer <CRON_SECRET>`. Without a secret configured, production refuses them; local runs allow them.
 */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return process.env.VERCEL_ENV !== "production";
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export const cronDenied = () => Response.json({ error: "This route runs on a schedule." }, { status: 401 });
