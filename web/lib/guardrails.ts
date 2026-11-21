import "server-only";
import { takeDailyCall } from "./aiBudget";
import { getAddress, isAddress } from "viem";
import { agentMode } from "./robAgent";

/**
 * Plain-English guardrails: an owner describes what their agent does; this proposes a line of Fusebox's four fuses
 * with settings, a reason for each, and test payments that show the line working (including what it stops).
 * Claude Haiku 5.5 on NEAR AI Cloud when it's available (a strict tool call, then validated and clamped to what the
 * circuits accept); otherwise a rule-based reader of the same description. The owner always reviews before signing.
 */
export interface Line {
  dailyCap: { on: boolean; cap: number };
  payeeGuard: { on: boolean; coolingHours: number; trial: number };
  breaker: { on: boolean };
  twoOfThree: { on: boolean; threshold: number };
}
export interface TestPayment { memo: string; to: "saved" | "new" | "stranger"; amount: string; approvals: number; expect: "pass" | "stop" }
export interface Proposal {
  source: "ai" | "rules"; model?: string;
  line: Line;
  reasons: { dailyCap: string; payeeGuard: string; breaker: string; twoOfThree: string };
  payees: string[]; approvers: string[];
  tests: TestPayment[];
  summary: string;
}

const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const addrs = (v: unknown) => (Array.isArray(v) ? v : []).map(String).filter((a) => isAddress(a, { strict: false })).map((a) => getAddress(a.toLowerCase())).slice(0, 8);
const cleanTests = (v: unknown): TestPayment[] => (Array.isArray(v) ? v : []).slice(0, 6).map((t) => {
  const o = (t ?? {}) as Record<string, unknown>;
  const to: TestPayment["to"] = o.to === "saved" || o.to === "new" || o.to === "stranger" ? o.to : "saved";
  const amount = /^\d{1,6}(\.\d{1,6})?$/.test(String(o.amount)) && Number(o.amount) > 0 ? String(o.amount) : "1";
  const expect: TestPayment["expect"] = o.expect === "stop" ? "stop" : "pass";
  return { memo: String(o.memo ?? "").slice(0, 70) || "Payment", to, amount, approvals: clamp(o.approvals, 0, 3, 0), expect };
}).filter((t) => t.memo);

function normalise(raw: Record<string, unknown>, source: Proposal["source"], model?: string): Proposal {
  const l = (raw.line ?? {}) as Record<string, Record<string, unknown>>;
  const line: Line = {
    dailyCap: { on: l.dailyCap?.on !== false, cap: clamp(l.dailyCap?.cap, 1, 254, 50) },
    payeeGuard: { on: !!l.payeeGuard?.on, coolingHours: clamp(l.payeeGuard?.coolingHours, 0, 255, 24), trial: clamp(l.payeeGuard?.trial, 0, 254, 2) },
    breaker: { on: !!l.breaker?.on },
    twoOfThree: { on: !!l.twoOfThree?.on, threshold: clamp(l.twoOfThree?.threshold, 0, 254, 20) },
  };
  // a line needs at least one fuse; with none, the daily cap stays on
  if (!line.dailyCap.on && !line.payeeGuard.on && !line.breaker.on && !line.twoOfThree.on) line.dailyCap.on = true;
  const r = (raw.reasons ?? {}) as Record<string, unknown>;
  const s = (k: string, d: string) => String(r[k] ?? "").slice(0, 220) || d;
  return {
    source, model, line,
    reasons: {
      dailyCap: s("dailyCap", line.dailyCap.on ? `Never more than ${line.dailyCap.cap} USD₮0 in a UTC day.` : "Off."),
      payeeGuard: s("payeeGuard", line.payeeGuard.on ? `Only saved payees; a new one gets at most ${line.payeeGuard.trial} USD₮0 for its first ${line.payeeGuard.coolingHours} hours.` : "Off: the agent pays people it hasn't paid before."),
      breaker: s("breaker", line.breaker.on ? "A payment to a stranger blows it, and nothing pays until you reset it." : "Off."),
      twoOfThree: s("twoOfThree", line.twoOfThree.on ? `Anything over ${line.twoOfThree.threshold} USD₮0 needs two of three approvers.` : "Off."),
    },
    payees: addrs(raw.payees), approvers: addrs(raw.approvers),
    tests: cleanTests(raw.tests),
    summary: String(raw.summary ?? "").slice(0, 300) || [
      line.dailyCap.on && `at most ${line.dailyCap.cap} USD₮0 a day`,
      line.payeeGuard.on && "saved payees only",
      line.breaker.on && "a stranger blows the breaker",
      line.twoOfThree.on && `two approvers above ${line.twoOfThree.threshold} USD₮0`,
    ].filter(Boolean).join(", ").replace(/^./, (c) => c.toUpperCase()) + ".",
  };
}

// ---------------------------------------------------------------- the rule-based reader (always available)

const money = (s: string) => Number(s.replace(/,/g, ""));
export function readRules(text: string): Proposal {
  const t = text.toLowerCase();
  const num = String.raw`\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:usd[t₮]?0?|usdc|dollars?|bucks)?`;
  const capM = t.match(new RegExp(String.raw`${num}\s*(?:a|per|each|every)\s*day`)) ?? t.match(new RegExp(String.raw`(?:daily|day's|per day)\s*(?:limit|cap|budget|max(?:imum)?)?\s*(?:of|is|at)?\s*${num}`)) ?? t.match(new RegExp(String.raw`(?:never|no) more than\s*${num}`));
  // the last "over N" before the sign-off words: "never more than 80 a day, anything over 30 needs us" → 30
  const thrM = t.match(new RegExp(String.raw`[\s\S]*(?:over|above|more than|bigger than|larger than|exceeding)\s*${num}[^.]{0,60}?(?:approv|sign|me and|both of us|two of|2 of|partner|co-?sign|my ok|my okay)`)) ?? t.match(new RegExp(String.raw`(?:approv|sign)[^.]{0,60}(?:over|above|more than)\s*${num}`));
  const coolM = t.match(/(\d+)\s*(hours?|days?)[^.]{0,40}(?:new|cool|wait)/) ?? t.match(/(?:new|cool|wait)[^.]{0,40}?(\d+)\s*(hours?|days?)/);
  const trialM = t.match(new RegExp(String.raw`(?:test|trial|small first)\s*(?:payment|amount)?\s*(?:of|up to)?\s*${num}`));
  const anyone = /(refund|customers?|anyone|new people|strangers are fine|many different)/.test(t);
  const known = /(supplier|vendor|known|saved|regular|same people|only pay|approved list|our contractors?|payroll)/.test(t);
  const cap = capM ? Math.min(254, Math.max(1, Math.ceil(money(capM[1])))) : anyone ? 100 : 50;
  const payeeOn = known || !anyone;
  const cool = coolM ? Math.min(255, Number(coolM[1]) * (coolM[2].startsWith("day") ? 24 : 1)) : 24;
  const trial = trialM ? Math.min(254, Math.ceil(money(trialM[1]))) : 2;
  const thr = thrM ? Math.min(254, Math.ceil(money(thrM[1]))) : null;
  const found = (text.match(/0x[0-9a-fA-F]{40}/g) ?? []);
  const line: Line = { dailyCap: { on: true, cap }, payeeGuard: { on: payeeOn, coolingHours: cool, trial }, breaker: { on: payeeOn }, twoOfThree: { on: thr !== null, threshold: thr ?? 20 } };
  const tests: TestPayment[] = [
    // small amounts first, so the cap test at the end is the only one today's running total can stop
    { memo: "A normal payment to a saved payee", to: "saved", amount: String(Math.max(1, Math.min(5, Math.floor(Math.min(cap, thr ?? cap) / 4)))), approvals: 0, expect: "pass" },
    ...(payeeOn ? [{ memo: "\"New bank details\" from someone you never saved", to: "stranger" as const, amount: "2", approvals: 0, expect: "stop" as const }] : []),
    ...(thr !== null && thr < cap ? [{ memo: `Over ${thr}: no signatures yet`, to: "saved" as const, amount: String(thr + 1), approvals: 0, expect: "stop" as const }, { memo: `Over ${thr}: two approvers signed`, to: "saved" as const, amount: String(thr + 1), approvals: 2, expect: "pass" as const }] : []),
    { memo: "Past today's cap", to: "saved", amount: String(Math.min(254, cap + 1)), approvals: 2, expect: "stop" },
  ];
  return normalise({ line, tests, payees: found, summary: "Read from your description by Fusebox's rule reader: check the numbers before you sign." }, "rules");
}

// ---------------------------------------------------------------- Claude Haiku 5.5 on NEAR AI Cloud

const SYSTEM = `You set up spending guardrails for an AI agent's Fusebox wallet on X Layer. The wallet has four optional fuses, each a logic circuit taped out on TapeOut:
- dailyCap: never more than cap USD₮0 per UTC day (cap 1-254).
- payeeGuard: only payees saved in the wallet's payee book; a newly saved payee may receive at most trial USD₮0 until coolingHours have passed (coolingHours 0-255, trial 0-254). Turn it off only if the agent must pay people it has never paid (refunds, payouts to new customers).
- breaker: a payment to a stranger (not in the payee book) blows it, and nothing pays until the owner resets it. Use it with payeeGuard for agents that should only ever pay known parties.
- twoOfThree: payments above threshold USD₮0 need two of three human approvers (threshold 0-254).
All amounts are whole USD₮0. Read the owner's description and call propose_line once. Pick sensible values for anything they didn't say, explain each fuse in one short plain sentence addressed to the owner ("you"), list any 0x payee or approver addresses they gave, and add 3 to 5 test payments that show the line working, including at least one it should stop. Be conservative with money.`;
const TOOL = {
  type: "function", function: {
    name: "propose_line", description: "Propose the wallet's line of fuses, with reasons and test payments.",
    parameters: {
      type: "object", additionalProperties: false, required: ["line", "reasons", "tests", "summary"],
      properties: {
        line: { type: "object", additionalProperties: false, required: ["dailyCap", "payeeGuard", "breaker", "twoOfThree"], properties: {
          dailyCap: { type: "object", additionalProperties: false, required: ["on", "cap"], properties: { on: { type: "boolean" }, cap: { type: "integer" } } },
          payeeGuard: { type: "object", additionalProperties: false, required: ["on", "coolingHours", "trial"], properties: { on: { type: "boolean" }, coolingHours: { type: "integer" }, trial: { type: "integer" } } },
          breaker: { type: "object", additionalProperties: false, required: ["on"], properties: { on: { type: "boolean" } } },
          twoOfThree: { type: "object", additionalProperties: false, required: ["on", "threshold"], properties: { on: { type: "boolean" }, threshold: { type: "integer" } } },
        } },
        reasons: { type: "object", additionalProperties: false, required: ["dailyCap", "payeeGuard", "breaker", "twoOfThree"], properties: { dailyCap: { type: "string" }, payeeGuard: { type: "string" }, breaker: { type: "string" }, twoOfThree: { type: "string" } } },
        payees: { type: "array", items: { type: "string" } },
        approvers: { type: "array", items: { type: "string" } },
        tests: { type: "array", items: { type: "object", additionalProperties: false, required: ["memo", "to", "amount", "approvals", "expect"], properties: {
          memo: { type: "string" }, to: { type: "string", enum: ["saved", "new", "stranger"] }, amount: { type: "string" }, approvals: { type: "integer" }, expect: { type: "string", enum: ["pass", "stop"] },
        } } },
        summary: { type: "string", description: "One sentence on what this line does for the owner" },
      },
    },
  },
};

// its own caps, per instance (hourly, daily) and shared (aiBudget): the page is public and every call costs credit
const G_HOURLY = Number(process.env.FUSEBOX_GUARDRAILS_HOURLY_CAP || 60);
const G_DAILY = Number(process.env.FUSEBOX_GUARDRAILS_DAILY_CAP || 300);
let gCalls: number[] = [];

export async function propose(description: string): Promise<Proposal & { fellBack?: boolean }> {
  const key = process.env.NEARAI_API_KEY;
  if (!key || agentMode().mode !== "llm") return readRules(description);
  gCalls = gCalls.filter((t) => Date.now() - t < 86_400_000);
  if (gCalls.filter((t) => Date.now() - t < 3_600_000).length >= G_HOURLY || gCalls.length >= G_DAILY || !(await takeDailyCall("guardrails"))) return readRules(description);
  gCalls.push(Date.now());
  const model = process.env.FUSEBOX_GUARDRAILS_MODEL || "anthropic/claude-haiku-5-5";
  try {
    const r = await fetch(`${process.env.NEARAI_BASE_URL || "https://cloud-api.near.ai/v1"}/chat/completions`, {
      method: "POST", signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1500, tool_choice: "auto", tools: [TOOL], messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `The owner's description:\n\n<description>\n${description}\n</description>` }] }),
    });
    if (!r.ok) throw new Error(`NEAR AI ${r.status}`);
    const j = (await r.json()) as { model?: string; choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[] };
    const fn = j.choices?.[0]?.message?.tool_calls?.find((c) => c.function?.name === "propose_line")?.function;
    if (!fn?.arguments) throw new Error("no proposal");
    return normalise(JSON.parse(fn.arguments), "ai", j.model ?? model);
  } catch (e) {
    console.error("guardrails:", (e as Error).message);
    return { ...readRules(description), fellBack: true };
  }
}
