import "server-only";
import { getJson, putJson } from "./store";

/**
 * Daily budgets for model calls, shared by every server instance through the store, on top of each feature's own
 * per-instance hourly cap. A soft cap: two instances racing can both take the last call, which is fine for a budget.
 * Past it, the feature answers with its scripted fallback until the next UTC day.
 */
export type AiFeature = "rob" | "assistant" | "guardrails";
const DAILY: Record<AiFeature, number> = {
  rob: Number(process.env.FUSEBOX_AGENT_DAILY_BUDGET || 400),
  assistant: Number(process.env.FUSEBOX_ASSISTANT_DAILY_BUDGET || 600),
  guardrails: Number(process.env.FUSEBOX_GUARDRAILS_DAILY_BUDGET || 300),
};

/** Take one call from today's budget; false once it's spent. */
export async function takeDailyCall(feature: AiFeature): Promise<boolean> {
  const key = `ai/${feature}/${new Date().toISOString().slice(0, 10)}.json`;
  try {
    const n = (await getJson<{ n: number }>(key))?.n ?? 0;
    if (n >= DAILY[feature]) return false;
    await putJson(key, { n: n + 1 });
    return true;
  } catch {
    return true; // a store hiccup doesn't switch the model off; the per-instance hourly caps still hold
  }
}
