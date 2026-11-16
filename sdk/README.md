# fusebox-sdk

TypeScript client for [Fusebox](https://fusebox-xlayer.vercel.app) wallets on X Layer. An AI agent holds a key
that can only ask the wallet to pay, and every payment has to pass the wallet's **fuses**: small logic circuits
taped out on [TapeOut](https://tapeout.net) and evaluated on X Layer in the same transaction. One no, and nothing moves.

```bash
npm install fusebox-sdk viem
```

## Check a payment (free, no key)

```ts
import { Fusebox } from "fusebox-sdk";

const fb = new Fusebox(); // Atlas, the public demo wallet, on X Layer mainnet
const c = await fb.check("0x9f3e71b8D05A2c6E94f13B7d5E0A8C2F6B19c41A", "2.5");
console.log(c.allowed); // false
console.log(c.summary);
// Stopped: Payee Guard (not a saved payee); Breaker (a payment to a stranger trips it, and it stays blown
// until the owner resets it). Nothing would move.
```

`check` runs the wallet's own `check()` on X Layer: every fuse answers, with the reason, and nothing is sent.

## Pay as the agent

```ts
const agent = new Fusebox({ wallet: "0xYourFuseboxWallet", account: process.env.FUSEBOX_AGENT_KEY as `0x${string}` });

const r = await agent.pay("0x69dB89385E8a69278a49335C432d0c70ec86A6C4", "12.5", "Invoice INV-7790, Kano Cotton");
if (r.paid) console.log(`paid, decision #${r.decisionId}`, r.txUrl);
else console.log(r.summary); // "Not sent. Stopped: Daily Cap (…)" — ask the owner, don't retry
```

`pay` checks first and doesn't send a payment the fuses would refuse, because a refused payment is still recorded
on-chain and its checks are still paid for. Pass `{ checkFirst: false }` to record the attempt anyway. The memo
is stored with the decision; no fuse ever reads it, so a convincing story can't talk a payment through.

## Follow the wallet

```ts
const stop = fb.watch((d) => {
  if (!d.paid) console.log(`Stopped ${d.amount} USDT0 to ${d.to}: ${d.fuses.filter((f) => f.verdict !== "pass").map((f) => f.name).join(", ")}`);
});

const s = await fb.status();   // balance, prepaid fees, each fuse (and whether it's blown), counts, daily budgets
const h = await fb.history();  // every decision, oldest first
```

## Approve and freeze

```ts
const approver = new Fusebox({ wallet, account: approverKey });
await approver.approve(payee, "40");  // Two of Three: this exact payee and amount

await agent.freeze();                  // agent, approver or owner: stop everything now (only the owner can reset)
```

## API

| | |
|---|---|
| `new Fusebox({ wallet?, rpc?, account?, api?, publicClient?, walletClient? })` | `account` is a private key or any viem `Account`; without it the client is read-only |
| `check(to, amount)` | `{ allowed, fuses: [{ name, verdict, why }], summary, block }` |
| `pay(to, amount, memo, { checkFirst? })` | `{ paid, sent, decisionId, txUrl, feePaid, fuses, summary }` |
| `status()` / `fuses()` | the wallet and its line of fuses |
| `history()` | decisions from Fusebox's indexed log (X Layer RPCs cap log ranges) |
| `watch(onDecision, { pollingInterval? })` | returns a function that stops watching |
| `approve(to, amount)` / `freeze()` | approver sign-off, emergency stop |
| `xLayer`, `ADDRESSES`, the contract ABIs | for your own viem calls |

Amounts are USDT0 with up to 6 decimals. Fuses from any designer work; ones that aren't Fusebox's own are named
from their on-chain metadata. For MCP clients (Claude Code, Cursor and others) there's
[`fusebox-mcp`](https://www.npmjs.com/package/fusebox-mcp). Docs: https://fusebox-xlayer.vercel.app/docs

MIT
