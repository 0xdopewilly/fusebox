/**
 * Fusebox for ElizaOS: actions to check, pay and pay-per-call (x402) through the agent's Fusebox wallet, and a
 * provider that puts the wallet's state in the agent's context.
 *
 *   import { fuseboxPlugin } from "fusebox-tools/eliza";
 *   export const character = { name: "Ledger", plugins: [fuseboxPlugin], settings: { secrets: { FUSEBOX_AGENT_KEY: "0x…" } } };
 *
 * Settings (runtime.getSetting): FUSEBOX_WALLET, FUSEBOX_AGENT_KEY, FUSEBOX_RPC, FUSEBOX_API, FUSEBOX_MAX_PRICE.
 * Only types come from @elizaos/core, so the plugin doesn't pin a runtime version.
 */
import type { Action, ActionExample, ActionResult, HandlerCallback, IAgentRuntime, Memory, Plugin, Provider, ProviderResult, State } from "@elizaos/core";
import { createFuseboxToolset, type FuseboxToolName, type FuseboxToolset, type ToolResult } from "./index.js";

const ADDRESS = /0x[a-fA-F0-9]{40}/;
const URL_RE = /https?:\/\/[^\s<>"'`]+/;

const setting = (rt: IAgentRuntime, k: string): string | undefined => { const v = rt.getSetting?.(k); return v === null || v === undefined || v === "" ? undefined : String(v); };
const sets = new WeakMap<object, { sig: string; set: FuseboxToolset }>();
/** One toolset per runtime, rebuilt if its Fusebox settings change. */
function toolsetFor(rt: IAgentRuntime): FuseboxToolset {
  const o = { wallet: setting(rt, "FUSEBOX_WALLET"), agentKey: setting(rt, "FUSEBOX_AGENT_KEY"), rpc: setting(rt, "FUSEBOX_RPC"), api: setting(rt, "FUSEBOX_API"), maxPrice: setting(rt, "FUSEBOX_MAX_PRICE") };
  const sig = JSON.stringify({ ...o, agentKey: o.agentKey ? o.agentKey.length : 0 });
  const hit = sets.get(rt);
  if (hit && hit.sig === sig) return hit.set;
  const set = createFuseboxToolset(o);
  sets.set(rt, { sig, set });
  return set;
}
const toolOf = (rt: IAgentRuntime, name: FuseboxToolName) => toolsetFor(rt).tools.find((t) => t.name === name)!;
const textOf = (m: Memory) => String(m.content?.text ?? "");

/** The plain-text fallback: the first 0x address, an amount (one next to a currency first), the first URL. */
export function extractFromText(text: string): { to?: string; amount?: string; url?: string; memo: string } {
  const to = text.match(ADDRESS)?.[0];
  const url = text.match(URL_RE)?.[0]?.replace(/[).,;:!?]+$/, "");
  const rest = text.replace(URL_RE, " ").replace(/0x[a-fA-F0-9]+/g, " ");
  const money = rest.match(/\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:USD₮0|USDT0|USDT|USD|dollars?)\b/i);
  const amount = money ? (money[1] ?? money[2]) : rest.match(/\b\d+(?:\.\d+)?\b/)?.[0];
  return { to, amount, url, memo: text.replace(/\s+/g, " ").trim().slice(0, 200) };
}

type Fields = { to?: string; amount?: string; memo?: string; url?: string; maxPrice?: string };
const SCHEMA: Record<keyof Fields, { type: "string"; description: string }> = {
  to: { type: "string", description: "the payee's 0x address, exactly as written" },
  amount: { type: "string", description: "the amount in USDT0 as a decimal string" },
  memo: { type: "string", description: "one line: what the payment is for" },
  url: { type: "string", description: "the http(s) URL to call" },
  maxPrice: { type: "string", description: "the most to pay for the call, in USDT0, if the user named one" },
};

/** Ask the agent's small object model for the fields, then keep only values that pass checks; fill gaps from the text. */
async function extract(rt: IAgentRuntime, m: Memory, want: (keyof Fields)[]): Promise<Fields> {
  const text = textOf(m), fallback = extractFromText(text);
  let got: Record<string, unknown> = {};
  if (typeof rt.useModel === "function") {
    try {
      const properties = Object.fromEntries(want.map((k) => [k, SCHEMA[k]]));
      got = (await rt.useModel("OBJECT_SMALL" as never, {
        prompt: `Pull these fields out of the message below for a USDT0 payment tool. Copy addresses and URLs exactly; leave a field out if the message doesn't say it.\nFields: ${want.join(", ")}\n\nMessage:\n${text}`,
        schema: { type: "object", properties, required: [] },
        output: "object",
      } as never)) as unknown as Record<string, unknown>;
    } catch { got = {}; }
  }
  const s = (k: keyof Fields) => (typeof got?.[k] === "string" && (got[k] as string).trim() ? (got[k] as string).trim() : undefined);
  const to = s("to") && ADDRESS.test(s("to")!) && s("to")!.match(ADDRESS)![0] === s("to") && text.includes(s("to")!) ? s("to") : fallback.to;
  const amount = s("amount") && /^\d{1,9}(\.\d{1,6})?$/.test(s("amount")!) ? s("amount") : fallback.amount;
  const url = s("url") && /^https?:\/\//.test(s("url")!) && text.includes(s("url")!) ? s("url") : fallback.url;
  const maxPrice = s("maxPrice") && /^\d{1,9}(\.\d{1,6})?$/.test(s("maxPrice")!) ? s("maxPrice") : undefined;
  return { to, amount, url, maxPrice, memo: (s("memo") ?? fallback.memo).slice(0, 200) };
}

async function reply(name: string, r: ToolResult, cb?: HandlerCallback, success = true): Promise<ActionResult> {
  if (cb) await cb({ text: r.summary, actions: [name], source: "fusebox" });
  return { success, text: r.summary, data: r.data, values: { fuseboxLast: name } };
}
async function missing(name: string, what: string, cb?: HandlerCallback): Promise<ActionResult> {
  const text = `I need ${what} for that.`;
  if (cb) await cb({ text, actions: [name], source: "fusebox" });
  return { success: false, text, error: text };
}

const ex = (user: string, agent: string, action: string): ActionExample[] => [{ name: "{{user}}", content: { text: user } }, { name: "{{agent}}", content: { text: agent, actions: [action] } }];

const checkAction: Action = {
  name: "FUSEBOX_CHECK",
  similes: ["CHECK_PAYMENT", "DRY_RUN_PAYMENT", "FUSEBOX_DRY_RUN", "WOULD_FUSES_ALLOW"],
  description: "Dry-run a USDT0 payment from the agent's Fusebox wallet against every fuse (TapeOut circuits on X Layer): free, nothing moves. Use it before FUSEBOX_PAY. If it returns an approval link, give it to a human approver.",
  validate: async (_rt: IAgentRuntime, m: Memory) => ADDRESS.test(textOf(m)),
  handler: async (rt: IAgentRuntime, m: Memory, _s?: State, _o?: unknown, cb?: HandlerCallback) => {
    const f = await extract(rt, m, ["to", "amount"]);
    if (!f.to || !f.amount) return missing("FUSEBOX_CHECK", "the payee's 0x address and an amount", cb);
    const r = await toolOf(rt, "fusebox_check").run({ to: f.to, amount: f.amount });
    return reply("FUSEBOX_CHECK", r, cb);
  },
  examples: [ex("Would the fuses let you pay 0.05 USDT0 to 0x69dB89385E8a69278a49335C432d0c70ec86A6C4?", "Checking that against the wallet's fuses.", "FUSEBOX_CHECK")],
};

const payAction: Action = {
  name: "FUSEBOX_PAY",
  similes: ["PAY", "SEND_PAYMENT", "PAY_INVOICE", "FUSEBOX_SEND"],
  description: "Pay in USDT0 from the agent's Fusebox wallet on X Layer; every fuse must allow it. It checks first and won't send a payment the fuses refuse (a refused payment that is sent still costs fees and can blow the Breaker). If it needs approval, send the link to a human approver, never approve it yourself. Needs FUSEBOX_AGENT_KEY.",
  validate: async (rt: IAgentRuntime, m: Memory) => !!setting(rt, "FUSEBOX_AGENT_KEY") && ADDRESS.test(textOf(m)),
  handler: async (rt: IAgentRuntime, m: Memory, _s?: State, _o?: unknown, cb?: HandlerCallback) => {
    const f = await extract(rt, m, ["to", "amount", "memo"]);
    if (!f.to || !f.amount) return missing("FUSEBOX_PAY", "the payee's 0x address and an amount", cb);
    const r = await toolOf(rt, "fusebox_pay").run({ to: f.to, amount: f.amount, memo: f.memo ?? "" });
    return reply("FUSEBOX_PAY", r, cb, r.data.paid === true);
  },
  examples: [ex("Pay invoice INV-7801: 0.05 USDT0 to Kano Cotton, 0x69dB89385E8a69278a49335C432d0c70ec86A6C4", "Paying it through the fuses.", "FUSEBOX_PAY")],
};

const statusAction: Action = {
  name: "FUSEBOX_STATUS",
  similes: ["WALLET_STATUS", "FUSEBOX_BALANCE", "CHECK_FUSES"],
  description: "Report the agent's Fusebox wallet on X Layer: USDT0 balance, prepaid fees, each fuse and whether it's blown, decision counts.",
  validate: async () => true,
  handler: async (rt: IAgentRuntime, _m: Memory, _s?: State, _o?: unknown, cb?: HandlerCallback) => reply("FUSEBOX_STATUS", await toolOf(rt, "fusebox_status").run({}), cb),
  examples: [ex("How much is left in your Fusebox wallet, and is any fuse blown?", "Reading the wallet now.", "FUSEBOX_STATUS")],
};

const fetchAction: Action = {
  name: "FUSEBOX_FETCH",
  similes: ["PAID_FETCH", "X402_FETCH", "CALL_PAID_API"],
  description: "Call an HTTP API that may charge per call (x402). The price is paid from the agent's Fusebox wallet only if every fuse allows it; a refusal costs nothing. Set FUSEBOX_MAX_PRICE to cap one call.",
  validate: async (_rt: IAgentRuntime, m: Memory) => URL_RE.test(textOf(m)),
  handler: async (rt: IAgentRuntime, m: Memory, _s?: State, _o?: unknown, cb?: HandlerCallback) => {
    const f = await extract(rt, m, ["url", "maxPrice"]);
    if (!f.url) return missing("FUSEBOX_FETCH", "an http(s) URL", cb);
    const r = await toolOf(rt, "fusebox_fetch").run({ url: f.url, maxPrice: f.maxPrice });
    return reply("FUSEBOX_FETCH", r, cb, r.data.ok === true);
  },
  examples: [ex("Get Kano Cotton's price sheet from https://fusebox-xlayer.vercel.app/api/x402/prices", "Fetching it; if it costs anything, the fuses decide.", "FUSEBOX_FETCH")],
};

const cache = new WeakMap<object, { at: number; r: ProviderResult }>();
const walletProvider: Provider = {
  name: "FUSEBOX_WALLET",
  description: "The agent's Fusebox wallet on X Layer: balance, prepaid fees, fuses and what's blown.",
  get: async (rt: IAgentRuntime): Promise<ProviderResult> => {
    const hit = cache.get(rt);
    if (hit && Date.now() - hit.at < 30_000) return hit.r;
    try {
      const s = await toolOf(rt, "fusebox_status").run({});
      const d = s.data as { wallet: string; balance: string; feeBalance: string; paused: boolean; fuses: { name: string; blown: boolean }[] };
      const r: ProviderResult = {
        text: `# Fusebox wallet ${d.wallet} (X Layer)\n${s.summary}\nFuses, in order: ${d.fuses.map((f) => `${f.name}${f.blown ? " (blown)" : ""}`).join(", ")}. Check a payment with FUSEBOX_CHECK before FUSEBOX_PAY.`,
        values: { fuseboxWallet: d.wallet, fuseboxBalance: d.balance, fuseboxFees: d.feeBalance, fuseboxPaused: d.paused, fuseboxBlown: d.fuses.filter((f) => f.blown).map((f) => f.name).join(", ") },
        data: { fusebox: s.data },
      };
      cache.set(rt, { at: Date.now(), r });
      return r;
    } catch (e) {
      return { text: `# Fusebox wallet\nCouldn't read it just now (${(e as Error).message.slice(0, 120)}).`, values: {}, data: {} };
    }
  },
};

export const fuseboxPlugin: Plugin = {
  name: "fusebox",
  description: "Pay from a Fusebox wallet on X Layer, where every payment must pass logic-circuit fuses taped out on TapeOut: check, pay, wallet status and pay-per-call APIs (x402).",
  actions: [checkAction, payAction, statusAction, fetchAction],
  providers: [walletProvider],
};

export default fuseboxPlugin;
