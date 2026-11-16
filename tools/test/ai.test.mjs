// Vercel AI SDK: generateText with a mock model that calls fusebox_check; the real tool runs against mainnet Atlas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { fuseboxTools } from "../dist/ai.js";

delete process.env.FUSEBOX_AGENT_KEY;
const SUPPLIER = "0x69dB89385E8a69278a49335C432d0c70ec86A6C4";
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };

test("generateText: the model calls fusebox_check, the tool runs, its result comes back", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "tool-call", toolCallId: "call-1", toolName: "fusebox_check", input: JSON.stringify({ to: SUPPLIER, amount: "0.05" }) }],
      finishReason: { unified: "tool-calls", raw: "tool_use" },
      usage, warnings: [],
    }),
  });
  const r = await generateText({ model, tools: fuseboxTools(), prompt: "Can you pay Kano Cotton 0.05 USDT0?" });
  // the model was offered all four tools with JSON schemas
  const offered = model.doGenerateCalls[0].tools.map((t) => t.name).sort();
  assert.deepEqual(offered, ["fusebox_check", "fusebox_fetch", "fusebox_pay", "fusebox_status"]);
  const checkDef = model.doGenerateCalls[0].tools.find((t) => t.name === "fusebox_check");
  assert.deepEqual(Object.keys(checkDef.inputSchema.properties).sort(), ["amount", "to"]);
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolResults.length, 1);
  const out = r.toolResults[0].output;
  assert.equal(r.toolResults[0].toolName, "fusebox_check");
  assert.equal(out.data.allowed, true, out.summary);
  assert.match(out.summary, /Every fuse holds/);
});

test("generateText: a bad tool input is reported back, not thrown", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "tool-call", toolCallId: "call-2", toolName: "fusebox_check", input: JSON.stringify({ to: "0x123", amount: "1" }) }],
      finishReason: { unified: "tool-calls", raw: "tool_use" }, usage, warnings: [],
    }),
  });
  const r = await generateText({ model, tools: fuseboxTools(), prompt: "check 0x123" });
  assert.equal(r.toolResults[0].output.data.allowed, false);
  assert.match(r.toolResults[0].output.summary, /valid 0x address/);
});
