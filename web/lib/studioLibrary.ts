/**
 * Ready-made rules for Fuse Studio: common agent-payment policies, each a normal Studio rule. Loading one fills
 * the editor; from there it is compiled, proved on every input and taped out like any rule built by hand.
 *
 * The list lives in studioLibrary.json, which the SDK and the MCP server also ship (web/scripts/sync-rules.mjs),
 * so an agent can ask for a rule by name. `fuse` marks the rules whose circuit is already a live fuse in the v2
 * market (byte-identical to what Studio compiles), so a wallet can install it with nothing to tape out.
 */
import type { Rule } from "./studio";
import data from "./studioLibrary.json";

export interface Template {
  id: string;
  /** short name, also the default listing name */
  name: string;
  /** who reaches for it, in plain words */
  when: string;
  /** the live v2 fuse with exactly this circuit, if there is one */
  fuse?: number;
  rule: Rule;
}

export const LIBRARY: Template[] = data as Template[];
