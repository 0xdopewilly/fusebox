/** Ready-to-paste setups that hand an agent its Fusebox wallet: the fusebox-mcp server for Claude and Cursor, or the
 *  SDK in your own code. With no key, a placeholder shows where it goes. */
export interface Setup { id: string; name: string; where: string; file?: string; text: string }

export function setups(wallet: string, key?: string): Setup[] {
  const k = key ?? "0xYOUR_AGENT_PRIVATE_KEY";
  const mcp = JSON.stringify({ mcpServers: { fusebox: { command: "npx", args: ["-y", "fusebox-mcp"], env: { FUSEBOX_WALLET: wallet, FUSEBOX_AGENT_KEY: k } } } }, null, 2);
  return [
    { id: "claude-code", name: "Claude Code", where: "Run this once in a terminal, then ask Claude to pay someone.", text: `claude mcp add fusebox -e FUSEBOX_WALLET=${wallet} -e FUSEBOX_AGENT_KEY=${k} -- npx -y fusebox-mcp` },
    { id: "claude-desktop", name: "Claude Desktop", where: "Settings → Developer → Edit Config: paste into claude_desktop_config.json (merge with any servers already there), then restart Claude.", file: "claude_desktop_config.json", text: mcp },
    { id: "cursor", name: "Cursor", where: "Paste into ~/.cursor/mcp.json (or .cursor/mcp.json in a project), then reload Cursor.", file: "mcp.json", text: mcp },
    { id: "sdk", name: "Your code", where: "npm install fusebox-sdk viem, then:", file: "fusebox-agent.ts", text: `import { Fusebox } from "fusebox-sdk";

const agent = new Fusebox({
  wallet: "${wallet}",
  account: process.env.FUSEBOX_AGENT_KEY as \`0x\${string}\`, // ${key ? "the key you downloaded" : "your agent's private key"}
});

// every payment goes through the wallet's fuses on X Layer
const r = await agent.pay("0xPayee…", "2.5", "Invoice INV-001");
console.log(r.paid ? \`paid, decision #\${r.decisionId}\` : r.summary);` },
  ];
}
