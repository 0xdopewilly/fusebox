/**
 * Fusebox tools for LangChain (and LangGraph).
 *
 *   import { fuseboxLangchainTools } from "fusebox-tools/langchain";
 *   const agent = createReactAgent({ llm, tools: fuseboxLangchainTools() });
 */
import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { createFuseboxToolset, type FuseboxToolsOptions } from "./index.js";

/** The four Fusebox tools as LangChain tools. Each returns the one-line summary, then the details as JSON. */
export function fuseboxLangchainTools(opts: FuseboxToolsOptions = {}): StructuredToolInterface[] {
  const { tools } = createFuseboxToolset(opts);
  return tools.map((t) =>
    tool(async (input: unknown) => { const r = await t.run(input as never); return `${r.summary}\n\n${JSON.stringify(r.data, null, 2)}`; }, { name: t.name, description: t.description, schema: t.schema as never }) as unknown as StructuredToolInterface,
  );
}

export type { FuseboxToolsOptions } from "./index.js";
