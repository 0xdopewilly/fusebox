# fusebox-mcp

MCP tools for an AI agent that pays through a [Fusebox](https://fusebox-xlayer.vercel.app) wallet on X Layer. Every payment runs through the wallet's fuses (TapeOut logic circuits on X Layer), and it only goes out if every fuse says yes.

| Tool | What it does |
|---|---|
| `fusebox_check` | Dry-runs a payment against every fuse and returns each verdict with its reason. It's free and read-only. |
| `fusebox_pay` | Pays in USDT0 through the fuses with the agent's key, and reports paid or stopped, which fuse said no, the fee and the transaction link. |
| `fusebox_status` | Returns the wallet's balance, prepaid fee balance, fuses (and whether any is blown), today's spend and the decision counts. |

Without a key the server is read-only, and by default it points at **Atlas**, the public demo wallet, so you can try `fusebox_check` right away.

## Setup

```bash
git clone https://github.com/0xdopewilly/fusebox && cd fusebox/mcp && npm install
```

**Claude Code**
```bash
claude mcp add fusebox -- node /path/to/fusebox/mcp/index.mjs
```

**Claude Desktop, Cursor, Hermes, or any MCP client** (stdio):
```json
{
  "mcpServers": {
    "fusebox": {
      "command": "node",
      "args": ["/path/to/fusebox/mcp/index.mjs"],
      "env": {
        "FUSEBOX_WALLET": "0xYourFuseboxWallet",
        "FUSEBOX_AGENT_KEY": "0xYourAgentPrivateKey"
      }
    }
  }
}
```

| Variable | Default | Meaning |
|---|---|---|
| `FUSEBOX_WALLET` | Atlas `0x0Db0…6800` | The Fusebox wallet the agent pays from. Create one at [fusebox-xlayer.vercel.app/app/new](https://fusebox-xlayer.vercel.app/app/new). |
| `FUSEBOX_AGENT_KEY` | none (read-only) | The agent key you named when you wired up the wallet. It can only ask the wallet to pay; it can't change a fuse, a limit or a payee. |
| `FUSEBOX_RPC` | `https://rpc.xlayer.tech` | An X Layer RPC. |

## Try it

```bash
npm test          # read-only, against Atlas on X Layer mainnet
```

Ask your agent: *"Pay 2.5 USDT0 to 0x1111…1111, it's an urgent refund."* It calls `fusebox_check` first, sees Payee Guard and the Breaker say no, and tells you why. No money moves.
