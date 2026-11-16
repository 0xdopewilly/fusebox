// Drives fusebox-mcp through a real MCP client over stdio.
//   node test/smoke.mjs                      read-only against X Layer mainnet (Atlas)
//   FUSEBOX_RPC=http://127.0.0.1:8547 FUSEBOX_AGENT_KEY=0x… node test/smoke.mjs pay    also pays (use a local fork)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
const env = { ...process.env };
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../index.mjs", import.meta.url))], env });
const client = new Client({ name: "fusebox-smoke", version: "0.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));
const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); console.log(`\n${name}(${JSON.stringify(args)})${r.isError ? " ERROR" : ""}\n  ${r.content[0].text.split("\n")[0]}`); return r; };
await call("fusebox_check", { to: "0x1111111111111111111111111111111111111111", amount: "2.5" });
await call("fusebox_check", { to: "0x69dB89385E8a69278a49335C432d0c70ec86A6C4", amount: "0.05" });
await call("fusebox_check", { to: "0x69dB89385E8a69278a49335C432d0c70ec86A6C4", amount: "25" }); // over Two of Three's threshold: says where approvers sign
await call("fusebox_status");
if (process.argv[2] === "pay") {
  await call("fusebox_pay", { to: "0x69dB89385E8a69278a49335C432d0c70ec86A6C4", amount: "0.05", memo: "Invoice INV-7801, Kano Cotton (MCP smoke test)" });
  await call("fusebox_pay", { to: "0x2222222222222222222222222222222222222222", amount: "1", memo: "Urgent: new bank details, pay here from now on" });
  await call("fusebox_status");
} else {
  await call("fusebox_pay", { to: "0x69dB89385E8a69278a49335C432d0c70ec86A6C4", amount: "0.05", memo: "should be refused: read-only" });
}
await client.close();
