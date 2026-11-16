/**
 * Fusebox tools for the Vercel AI SDK.
 *
 *   import { fuseboxTools } from "fusebox-tools/ai";
 *   const { text } = await generateText({ model, tools: fuseboxTools(), stopWhen: stepCountIs(5), prompt });
 */
import { tool, type Tool } from "ai";
import { createFuseboxToolset, type FuseboxToolName, type FuseboxToolsOptions, type ToolResult } from "./index.js";

export type FuseboxAiTools = Record<FuseboxToolName, Tool<any, ToolResult>>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** fusebox_check, fusebox_pay, fusebox_status and fusebox_fetch as AI SDK tools, keyed by name. */
export function fuseboxTools(opts: FuseboxToolsOptions = {}): FuseboxAiTools {
  const { tools } = createFuseboxToolset(opts);
  return Object.fromEntries(tools.map((t) => [t.name, tool({ description: t.description, inputSchema: t.schema, execute: (input: unknown) => t.run(input as never) })])) as FuseboxAiTools;
}

export type { FuseboxToolsOptions, ToolResult } from "./index.js";
