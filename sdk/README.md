# fusebox-sdk

TypeScript client for [Fusebox](https://fusebox-xlayer.vercel.app) wallets on X Layer. An AI agent holds a key
that can only ask the wallet to pay, and every payment has to pass the wallet's **fuses**: small logic circuits
taped out on [TapeOut](https://tapeout.net) and evaluated on X Layer in the same transaction. One no, and nothing moves.

```bash
npm install fusebox-sdk viem
```

**New in 0.5.0**
- **v2 contracts:** new wallets and the fuse market, including the Repeat Guard (fuse 5: the same invoice sent
  twice is paid once). v1 wallets such as Atlas keep working.
- **Telegram alerts:** `pay()` reports its transaction, so anyone following the wallet on Telegram gets a message.
- **x402 proofs are signed (breaking):** `fetch()` signs its payment proof with the agent key, and
  `requirePayment` / `verifyFuseboxPayment` require that signature from the agent that paid. Before this, anyone
  watching the chain could redeem a buyer's payment first. Buyers and sellers both need 0.5.0.

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

After each payment, `pay` tells Fusebox its transaction hash, so anyone following the wallet on Telegram
([@FuseboxAlertsBot](https://t.me/FuseboxAlertsBot)) gets a message: paid, or stopped and why. Fusebox reads the decision
back from X Layer itself; nothing else is sent.

## Five fuses

Wallets made since Nov 20 (v2, `ADDRESSES.factory`) can install five fuses: Daily Cap, Payee Guard, Breaker,
Two of Three and the **Repeat Guard**, which stops the same amount to the same payee inside the owner's window, so an
invoice sent twice is paid once. `check` and `pay` explain it like any other fuse:

```
Stopped: Repeat Guard (the same amount to this payee already went out in the last 24 h; the owner can clear one
repeat). Nothing would move.
```

Older wallets, Atlas included, keep their four fuses and keep working: a wallet always reads its own registry.

## Follow the wallet

```ts
const stop = fb.watch((d) => {
  if (!d.paid) console.log(`Stopped ${d.amount} USDT0 to ${d.to}: ${d.fuses.filter((f) => f.verdict !== "pass").map((f) => f.name).join(", ")}`);
});

const s = await fb.status();   // balance, prepaid fees, each fuse (and whether it's blown), counts, daily budgets
const h = await fb.history();  // every decision, oldest first
```

## Pay for APIs (x402)

`fetch()` works like `fetch`, except that when a URL answers `402` with an x402 offer that takes Fusebox payments,
the price goes through the wallet's fuses like any payment, and only a payment they allow is made. Then the request
is retried with the proof.

```ts
const { response, payment } = await agent.fetch("https://fusebox-xlayer.vercel.app/api/x402/prices", {}, { maxPrice: "0.05" });
console.log(payment?.summary);   // "Paid 0.01 USDT0 to 0x69dB… for …/prices (decision #7)."
const prices = await response.json();

await agent.fetch(url, {}, { dryRun: true });   // the price and what the fuses would say; nothing paid
```

Selling: gate any fetch-style route behind a Fusebox payment.

```ts
import { createPublicClient, http } from "viem";
import { xLayer, x402 } from "fusebox-sdk";
const client = createPublicClient({ chain: xLayer, transport: http() });

export async function GET(req: Request) {
  const g = await x402.requirePayment(req, { payTo: "0xYou", price: "0.01", secret: process.env.X402_SECRET!, client,
    markUsed: (tx) => db.insertIfAbsent("x402:" + tx) });   // one payment buys one response
  if (!g.paid) return g.response;                          // 402 with a fresh offer, or why it didn't count
  return Response.json(await getData(), { headers: g.headers });
}
```

The `fusebox` scheme: the offer carries a nonce the seller signed; the buyer pays through its fuses with
`x402 <nonce>` in the memo and retries with `PAYMENT-SIGNATURE`: the wallet, the transaction, and the paying agent's
signature over the nonce and transaction (`x402.proofMessage`). The seller checks on X Layer that the Fusebox factory
made the wallet, that its Decision allowed this payee and price with that nonce, that USDT0 moved, and that the
signature comes from the agent that paid, so nobody watching the chain can redeem the payment first. `x402.verifyFuseboxPayment()` does that check on its own, for your own stack. x402's `exact` scheme
doesn't fit a Fusebox wallet: it's a contract that only pays through its fuses, so the on-chain Decision is the proof.

## Pre-flight, for any wallet

Not using a Fusebox wallet yet? Run a payment through any line of TapeOut circuits before your agent signs it from
its own wallet. TapeOut's processor decides each fuse on X Layer, read-only and free; you send the context a
Fusebox wallet would keep on-chain, and the latch state comes back for next time.

```ts
import { preflight } from "fusebox-sdk";
const r = await preflight({
  line: [{ fuseId: 1, a: 50 }, { fuseId: 2, a: 24, b: 2 }, { fuseId: 3 }, { fuseId: 4, a: 20 }],
  payment: { amount: "2.5" },
  context: { spentToday: "10", payee: { saved: true, hoursSinceSaved: 72 }, approvals: 0, state: lastState },
});
if (r.allowed) { lastState = r.state; /* sign it */ }
```

## Approvals

When an approval fuse is what said no, `check` and `pay` say so and give the page where approvers sign. When
signatures are all that stand in the way, `pay()` also alerts the approvers' phones (the request is signed with the
agent's key and checked on X Layer; approvers turn alerts on at /app/approve):

```ts
const r = await agent.pay(payee, "40", "Q4 bulk order");
if (r.needsApproval) console.log(r.needsApproval.url, r.needsApproval.notified); // retry once two have signed

await agent.requestApproval(payee, "40", "Q4 bulk order"); // the same alert, on its own
const waiting = await fb.pending(approverAddress);        // everything waiting on this approver, across wallets
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
| `pay(to, amount, memo, { checkFirst?, notify? })` | `{ paid, sent, decisionId, txUrl, feePaid, fuses, summary, needsApproval? }` |
| `fetch(url, init?, { maxPrice?, dryRun?, memo? })` | `{ response, payment?: { paid, price, payTo, summary, fuses, tx, settlement } }` (x402) |
| `requestApproval(to, amount, memo?)` | alert the wallet's approvers about a payment an approval fuse holds |
| `preflight({ line, payment, context })` | any wallet: a payment through a line of TapeOut circuits, with the next latch state |
| `status()` / `fuses()` | the wallet and its line of fuses |
| `history()` | decisions from Fusebox's indexed log (X Layer RPCs cap log ranges) |
| `watch(onDecision, { pollingInterval? })` | returns a function that stops watching |
| `approve(to, amount)` / `freeze()` | approver sign-off, emergency stop |
| `pending(approver)` | payments waiting on an approver, across wallets |
| `x402.requirePayment(req, opts)` / `x402.verifyFuseboxPayment(client, payload, requirements)` | selling over x402 |
| `xLayer`, `ADDRESSES`, the contract ABIs | for your own viem calls |

Amounts are USDT0 with up to 6 decimals. Fuses from any designer work; ones that aren't Fusebox's own are named
from their on-chain metadata. For MCP clients (Claude Code, Cursor and others) there's
[`fusebox-mcp`](https://www.npmjs.com/package/fusebox-mcp); for the Vercel AI SDK, LangChain and ElizaOS,
[`fusebox-tools`](https://www.npmjs.com/package/fusebox-tools). Docs: https://fusebox-xlayer.vercel.app/docs

MIT
