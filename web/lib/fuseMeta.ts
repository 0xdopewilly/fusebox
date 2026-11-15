/**
 * A fuse's listing metadata (the registry's `metadataURI`): a small JSON document, `fusebox-fuse/1`.
 * Fusebox writes it on-chain as a `data:application/json;base64,…` URI, so a fuse describes itself with no host
 * to keep alive. An https URL to the same JSON works too (resolved server-side, see market.ts).
 */
export interface FuseMeta {
  schema?: string;
  name?: string;
  /** one line for the market card */
  summary?: string;
  /** a paragraph for the fuse's own page */
  description?: string;
  /** the rule in plain terms, e.g. "allow iff spent + amount <= cap" */
  rule?: string;
  designer?: string;
  source?: string;
  external_url?: string;
  /** what this circuit does with the owner's two 8-bit settings; a setting left out is unused (sent as 0) */
  params?: { a?: string; b?: string };
}

export const META_SCHEMA = "fusebox-fuse/1";
export const META_MAX = 1600; // bytes of JSON we'll write on-chain from the app

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : undefined);
const url = (v: unknown) => { const s = clean(v, 300); return s && /^https:\/\//.test(s) ? s : undefined; };

/** Keep only the fields we know, as plain bounded strings (metadata is written by anyone who lists a fuse). */
export function sanitize(j: unknown): FuseMeta | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const m: FuseMeta = {
    schema: clean(o.schema, 40), name: clean(o.name, 60), summary: clean(o.summary, 200), description: clean(o.description, 1200),
    rule: clean(o.rule, 160), designer: clean(o.designer, 60), source: url(o.source), external_url: url(o.external_url),
  };
  if (o.params && typeof o.params === "object") {
    const q = o.params as Record<string, unknown>;
    m.params = { a: clean(q.a, 40), b: clean(q.b, 40) };
  }
  return m.name || m.summary || m.description ? m : null;
}

function b64decode(s: string): string {
  if (typeof atob === "function") { const bin = atob(s); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); }
  return Buffer.from(s, "base64").toString("utf8");
}
function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  if (typeof btoa === "function") return btoa(String.fromCharCode(...bytes));
  return Buffer.from(bytes).toString("base64");
}

/** Decode a `data:application/json` URI (base64 or percent-encoded). Anything else returns null. */
export function decodeDataUri(uri: string): FuseMeta | null {
  const m = /^data:application\/json(;charset=utf-8)?(;base64)?,(.*)$/is.exec(uri.trim());
  if (!m) return null;
  try { return sanitize(JSON.parse(m[2] ? b64decode(m[3]) : decodeURIComponent(m[3]))); } catch { return null; }
}

/** The on-chain form: compact JSON, base64, as a data URI. */
export function encodeMeta(meta: FuseMeta): string {
  const body: FuseMeta = { schema: META_SCHEMA, ...meta };
  for (const k of Object.keys(body) as (keyof FuseMeta)[]) if (!body[k]) delete body[k];
  return `data:application/json;base64,${b64encode(JSON.stringify(body))}`;
}

/** How the listing points at its metadata, for display. */
export function metaSource(uri: string): "on-chain" | "link" | "none" {
  if (/^data:application\/json/i.test(uri)) return "on-chain";
  return /^(https|ipfs):\/\//.test(uri) ? "link" : "none";
}
