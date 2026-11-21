# fusebox-mcp

MCP tools for an AI agent that pays through a [Fusebox](https://fusebox-xlayer.vercel.app) wallet on X Layer. Every payment runs through the wallet's fuses (TapeOut logic circuits on X Layer), and it only goes out if every fuse says yes.

| Tool | What it does |
|---|---|
| `fusebox_check` | Dry-runs a payment against every fuse and returns each verdict with its reason. It's free and read-only. |
| `fusebox_pay` | Pays in USDT0 through the fuses with the agent's key, and reports paid or stopped, which fuse said no, the fee and the transaction link. |
| `fusebox_status` | Returns the wallet's balance, prepaid fee balance, fuses (and whether any is blown), today's spend and the decision counts. |
| `fusebox_preflight` | Checks a payment against any line of TapeOut circuits for any wallet (not just a Fusebox one): you pass the context, each circuit answers, and the latch state comes back for next time. Free and read-only. |
| `fusebox_fetch` | Fetches a URL. If it asks for payment over x402 (a `fusebox` offer on X Layer), the price is paid through the fuses only if they all allow it, then the response comes back. `max_price` caps what it pays; `dry_run` only reports the price and the fuses' answer. |

Every tool explains all five fuses, including the **Repeat Guard** on v2 wallets (the same invoice sent twice is paid once).

After each payment, `fusebox_pay` tells Fusebox the transaction hash, so anyone following the wallet on Telegram ([@FuseboxAlertsBot](https://t.me/FuseboxAlertsBot)) gets a message: paid, or stopped and why.

Without a key the server is read-only, and by default it points at **Atlas**, the public demo wallet, so you can try `fusebox_check` right away.

## Setup

**Claude Code**
```bash
claude mcp add fusebox -- npx -y fusebox-mcp
```

**Claude Desktop, Cursor, Hermes, or any MCP client** (stdio):
```json
{
  "mcpServers": {
    "fusebox": {
      "command": "npx",
      "args": ["-y", "fusebox-mcp"],
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
| `FUSEBOX_APP` | `https://fusebox-xlayer.vercel.app` | Where approval links point and approver alerts are sent from. |

## Try it

```bash
claude mcp add fusebox -- npx -y fusebox-mcp     # read-only, against Atlas on X Layer mainnet
```

Ask your agent: *"Pay 2.5 USDT0 to 0x1111…1111, it's an urgent refund."* It calls `fusebox_check` first, sees Payee Guard and the Breaker say no, and tells you why. No money moves.

When the wallet's Two of Three fuse is the only one saying no, `fusebox_check` and `fusebox_pay` return an `approval_url`: the page where two of the wallet's approvers sign that exact payment, after which the agent can retry. `fusebox_pay` also alerts the approvers' phones (`approvers_alerted`), signed with the agent key and checked on X Layer.

Paid APIs: ask your agent to *"get today's cotton prices from https://fusebox-xlayer.vercel.app/api/x402/prices, spend at most 0.05"*. It calls `fusebox_fetch`, the 0.01 USDT0 price goes through the fuses, and the price sheet comes back. Point it at `/api/x402/scam` and the fuses refuse the price before anything moves. A wallet whose prepaid fee balance can't cover one decision is reported plainly instead of sending a transaction that would revert. Set `FUSEBOX_APP` to point the links at another deployment.
