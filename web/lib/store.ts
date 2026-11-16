import "server-only";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { del, get, list, put } from "@vercel/blob";

/**
 * A small durable key/value store for things the chain doesn't hold: which x402 payments have already bought a
 * response, which devices want an approver's alerts, which alerts went out. Vercel Blob (a private store) in
 * production; with FUSEBOX_STORE=file, or no Blob token, JSON files under .store/ (local runs and fork tests).
 */
const FILE = process.env.FUSEBOX_STORE === "file" || !process.env.BLOB_READ_WRITE_TOKEN;
const ROOT = process.env.FUSEBOX_STORE_DIR || join(/*turbopackIgnore: true*/ process.cwd(), ".store");
const safe = (key: string) => { if (!/^[a-z0-9][a-z0-9/_.:-]{0,200}$/i.test(key) || key.includes("..")) throw new Error(`bad store key: ${key}`); return key; };
const path = (key: string) => join(/*turbopackIgnore: true*/ ROOT, safe(key));

/** Write `value` under `key` only if nothing is there yet: true the first time, false after. */
export async function putOnce(key: string, value: unknown): Promise<boolean> {
  const body = JSON.stringify(value);
  if (FILE) {
    await mkdir(/*turbopackIgnore: true*/ dirname(path(key)), { recursive: true });
    try { await writeFile(/*turbopackIgnore: true*/ path(key), body, { flag: "wx" }); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") return false; throw e; }
  }
  try { await put(safe(key), body, { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: "application/json" }); return true; }
  catch (e) { if (/exist/i.test((e as Error).message)) return false; throw e; }
}

export async function putJson(key: string, value: unknown): Promise<void> {
  const body = JSON.stringify(value);
  if (FILE) { await mkdir(/*turbopackIgnore: true*/ dirname(path(key)), { recursive: true }); await writeFile(/*turbopackIgnore: true*/ path(key), body); return; }
  await put(safe(key), body, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
}

export async function getJson<T>(key: string): Promise<T | null> {
  if (FILE) { try { return JSON.parse(await readFile(/*turbopackIgnore: true*/ path(key), "utf8")) as T; } catch { return null; } }
  const r = await get(safe(key), { access: "private", useCache: false }).catch(() => null);
  if (!r?.stream) return null;
  try { return JSON.parse(await new Response(r.stream).text()) as T; } catch { return null; }
}

/** Every key under a prefix ending in "/". */
export async function listKeys(prefix: string): Promise<string[]> {
  if (FILE) {
    const out: string[] = [];
    const walk = async (rel: string) => {
      const ents = await readdir(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ ROOT, rel), { withFileTypes: true }).catch(() => []);
      for (const e of ents) { const k = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) await walk(k); else out.push(k); }
    };
    await walk(safe(prefix).replace(/\/$/, ""));
    return out;
  }
  const keys: string[] = []; let cursor: string | undefined;
  do { const r = await list({ prefix: safe(prefix), limit: 1000, cursor }); keys.push(...r.blobs.map((b) => b.pathname)); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return keys;
}

export async function remove(key: string): Promise<void> {
  if (FILE) { await rm(/*turbopackIgnore: true*/ path(key), { force: true }); return; }
  await del(safe(key)).catch(() => {});
}

export const STORE_KIND = FILE ? "file" : "blob";
