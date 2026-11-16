/**
 * fusebox-tools: Fusebox for agent frameworks. Four tools an AI agent can call to spend from its Fusebox wallet on
 * X Layer, where every payment has to pass logic-circuit fuses taped out on TapeOut:
 *
 *   fusebox_check   dry-run a payment against every fuse (free, nothing moves)
 *   fusebox_pay     pay in USDT0 through the fuses (needs the agent's key)
 *   fusebox_status  the wallet: balance, prepaid fees, fuses, what's blown
 *   fusebox_fetch   call a paid API (x402): the price goes through the fuses before anything is paid
 *
 * This root export is framework-free ({ name, description, schema, run }); the adapters wrap it:
 * `fusebox-tools/ai` (Vercel AI SDK), `fusebox-tools/langchain`, `fusebox-tools/eliza` (ElizaOS).
 */
import { Fusebox, FuseboxError, ADDRESSES } from "fusebox-sdk";
import type { Address, Hex } from "viem";
import { z } from "zod";

export interface FuseboxToolsOptions {
  /** the Fusebox wallet (default: FUSEBOX_WALLET, else Atlas, the public demo wallet) */
  wallet?: string;
  /** the agent's private key (default: FUSEBOX_AGENT_KEY); without it the tools are read-only */
  agentKey?: string;
  /** X Layer RPC (default: FUSEBOX_RPC, else https://rpc.xlayer.tech) */
  rpc?: string;
  /** the Fusebox app that serves history and approval links (default https://fusebox-xlayer.vercel.app) */
  api?: string;
  /** the most fusebox_fetch pays for one call, in USDT0 (default: FUSEBOX_MAX_PRICE, else no cap beyond the fuses) */
  maxPrice?: string | number;
}

export interface ToolResult { summary: string; data: Record<string, unknown> }

export interface FuseboxTool<S extends z.ZodType = z.ZodType> {
  name: FuseboxToolName;
  description: string;
  schema: S;
  run(input: z.infer<S>): Promise<ToolResult>;
}

export type FuseboxToolName = "fusebox_check" | "fusebox_pay" | "fusebox_status" | "fusebox_fetch";

export interface FuseboxToolset {
  /** the fusebox-sdk client the tools share */
  client: Fusebox;
  /** fusebox_check, fusebox_pay, fusebox_status, fusebox_fetch, in that order */
  tools: FuseboxTool[];
  /** read-only when no agent key was given */
  readOnly: boolean;
}

const env = (k: string): string | undefined => (typeof process !== "undefined" ? process.env?.[k] || undefined : undefined);
const BODY_LIMIT = 4096;

export const checkSchema = z.object({
  to: z.string().describe("Payee address, 0x followed by 40 hex characters"),
  amount: z.string().describe('Amount in USDT0 as a decimal string, e.g. "2.5" (up to 6 decimals)'),
});
export const paySchema = checkSchema.extend({
  memo: z.string().max(200).describe("One line saying what the payment is for, e.g. an invoice number. Recorded on-chain; no fuse reads it."),
});
export const statusSchema = z.object({});
export const fetchSchema = z.object({
  url: z.string().describe("The http(s) URL to call"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional().describe("HTTP method (default GET)"),
  body: z.string().optional().describe("Request body as a string (JSON is sent as application/json)"),
  maxPrice: z.string().optional().describe('The most to pay for this one call, in USDT0, e.g. "0.05". Leave it out to use the configured cap.'),
});

/** Build the four tools around one Fusebox client. */
export function createFuseboxToolset(opts: FuseboxToolsOptions = {}): FuseboxToolset {
  const rawKey = opts.agentKey ?? env("FUSEBOX_AGENT_KEY");
  const key = rawKey ? ((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex) : undefined;
  const client = new Fusebox({
    wallet: (opts.wallet ?? env("FUSEBOX_WALLET") ?? ADDRESSES.atlas) as Address,
    rpc: opts.rpc ?? env("FUSEBOX_RPC"),
    api: opts.api ?? env("FUSEBOX_API"),
    account: key,
  });
  const cap = opts.maxPrice ?? env("FUSEBOX_MAX_PRICE");
  const W = client.wallet;

  const check: FuseboxTool<typeof checkSchema> = {
    name: "fusebox_check",
    description: `Dry-run a USDT0 payment from the Fusebox wallet ${W} on X Layer against every fuse (TapeOut logic circuits). Each fuse answers yes or no with its reason. Free and read-only: nothing moves. Always call this before fusebox_pay: a payment the fuses refuse is still recorded on-chain, still costs fees, and can blow the Breaker so nothing pays until the owner resets it. If the result has an approvalUrl, the payment needs human approvers: give that link to a person; never try to approve it yourself.`,
    schema: checkSchema,
    async run({ to, amount }) {
      try {
        const c = await client.check(to, amount);
        return { summary: c.summary, data: { allowed: c.allowed, wallet: W, to: c.to, amount: c.amount, block: c.block, fuses: c.fuses, ...(c.approvalUrl ? { approvalUrl: c.approvalUrl } : {}) } };
      } catch (e) { return refused(e, { allowed: false }); }
    },
  };

  const pay: FuseboxTool<typeof paySchema> = {
    name: "fusebox_pay",
    description: `Pay in USDT0 from the Fusebox wallet ${W} on X Layer. Every fuse decides in the same transaction and the money moves only if all of them say yes. Call fusebox_check first and only pay what it allows: this tool also checks first and won't send a payment the fuses would refuse, but a refused payment that does get sent costs fees and can blow the Breaker. If it needs approval, send the approval link to a human approver, wait for them, then retry; never approve your own payments. Needs the agent's key.`,
    schema: paySchema,
    async run({ to, amount, memo }) {
      if (!client.account) return { summary: "Not paid: these tools are read-only. Give them the agent's key (agentKey, or FUSEBOX_AGENT_KEY) to pay.", data: { paid: false, sent: false, error: "read-only" } };
      try {
        const p = await client.pay(to, amount, memo);
        // the SDK's summary already carries the approval link when approval is the only no; add it when it doesn't
        const ask = p.needsApproval && !p.summary.includes(p.needsApproval.url) ? ` Ask a human approver to sign it at ${p.needsApproval.url}, then retry.` : "";
        return { summary: p.summary + ask, data: { paid: p.paid, sent: p.sent, wallet: W, to, amount, memo, fuses: p.fuses, ...(p.decisionId !== undefined ? { decisionId: p.decisionId } : {}), ...(p.tx ? { tx: p.tx, txUrl: p.txUrl, feePaid: p.feePaid } : {}), ...(p.needsApproval ? { approvalUrl: p.needsApproval.url } : {}) } };
      } catch (e) { return refused(e, { paid: false, sent: false }); }
    },
  };

  const status: FuseboxTool<typeof statusSchema> = {
    name: "fusebox_status",
    description: `The Fusebox wallet ${W} on X Layer: its USDT0 balance, the prepaid fee balance that pays for fuse checks, each fuse and whether it's blown, today's spend and the decision counts. Read-only.`,
    schema: statusSchema,
    async run() {
      const s = await client.status();
      const blown = s.fuses.filter((f) => f.blown).map((f) => f.name);
      const state = s.paused ? "Paused by the owner: nothing pays until they lift it." : blown.length ? `${blown.join(", ")} blown: nothing pays until the owner resets it.` : "Every fuse is closed.";
      return {
        summary: `${s.balance} USDT0 in the wallet, ${s.feeBalance} USDT0 of prepaid fees. ${state} ${s.decisions} decisions so far (${s.paid} paid, ${s.stopped} stopped).`,
        data: { ...s, fuses: s.fuses.map((f) => ({ name: f.name, fuseId: f.fuseId, circuitId: f.circuitId, blown: f.blown, fee: f.fee, settings: f.settings, spentToday: f.spentToday })), agent: client.account?.address ?? null },
      };
    },
  };

  const fetchTool: FuseboxTool<typeof fetchSchema> = {
    name: "fusebox_fetch",
    description: `Call an HTTP API that may charge per call (x402). If it answers 402 with a Fusebox offer, the price is paid from the wallet ${W} on X Layer only if every fuse allows it, then the call is retried with the proof. Returns the status, up to 4 KB of the body and what was paid. Set maxPrice to cap one call. A refusal costs nothing. Without the agent's key it only reports the price and what the fuses would say.`,
    schema: fetchSchema,
    async run({ url, method, body, maxPrice }) {
      let u: URL;
      try { u = new URL(url); } catch { return { summary: `"${url}" isn't a URL.`, data: { ok: false, error: "bad-url" } }; }
      if (u.protocol !== "https:" && u.protocol !== "http:") return { summary: `Only http(s) URLs: got ${u.protocol}`, data: { ok: false, error: "bad-url" } };
      const headers: Record<string, string> = {};
      if (body !== undefined) headers["content-type"] = /^\s*[[{]/.test(body) ? "application/json" : "text/plain";
      try {
        const r = await client.fetch(u, { method: method ?? (body !== undefined ? "POST" : "GET"), body, headers }, { maxPrice: maxPrice ?? cap });
        const text = await r.response.text().catch(() => "");
        const excerpt = text.length > BODY_LIMIT ? text.slice(0, BODY_LIMIT) : text;
        const status = `${r.response.status}${r.response.statusText ? ` ${r.response.statusText}` : ""}`;
        const summary = r.payment ? `${r.payment.summary} (HTTP ${status})` : `HTTP ${status}; it asked for no payment.`;
        return { summary, data: { url: u.toString(), status: r.response.status, ok: r.response.ok, contentType: r.response.headers.get("content-type"), body: excerpt, truncated: text.length > BODY_LIMIT, ...(r.payment ? { payment: { ...r.payment, check: undefined } } : {}) } };
      } catch (e) { return refused(e, { ok: false }); }
    },
  };

  return { client, tools: [check, pay, status, fetchTool] as FuseboxTool[], readOnly: !client.account };
}

/** A FuseboxError (bad address, not an agent, fees empty, no Fusebox offer…) becomes an answer the model can act on. */
function refused(e: unknown, data: Record<string, unknown>): ToolResult {
  if (e instanceof FuseboxError) return { summary: e.message, data: { ...data, error: e.message } };
  throw e;
}

export { Fusebox, FuseboxError, ADDRESSES } from "fusebox-sdk";
