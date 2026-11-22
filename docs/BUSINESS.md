# Fusebox: who it's for and how it earns

Fusebox is a wallet for AI agents. The agent's key can only ask the wallet to pay, and the wallet pays only if every
fuse on its line says yes. Each fuse is a small logic circuit taped out on TapeOut and checked on X Layer in the
same call. Every check pays the circuit's designer a small fee, and Fusebox keeps a share.

This page covers who uses it, how we reach them, where the money comes from, and why people keep paying. All the
fees and addresses below are read from X Layer mainnet (chain 196). The forecasts are marked as assumptions.

## Who it's for

| Who | Their problem | What Fusebox gives them | Pays or earns |
|---|---|---|---|
| **Builders who give an AI agent money** (assistants, shopping and booking agents, bots that buy APIs over x402) | An agent with a funded key can be talked into paying a scammer, can overspend, or can pay the same invoice twice. A prompt filter can be argued with. | Hard limits the agent can't argue with: a daily cap, a payee book with trial amounts for new payees, a breaker that trips on strangers, two-of-three approvals above a threshold, and a repeat guard. The memo the agent writes never reaches a fuse. | **Pays** the check fees (prepaid) and gas |
| **Teams, DAOs and small businesses that let a bot spend** (paying suppliers, settling invoices, topping up services) | One leaked or confused key can drain the treasury. Big payments need a second person, and duplicate invoices slip through. | Approvers sign the exact payment from an inbox, phones get a push, and every attempt shows up in Telegram as paid or stopped, with the reason. The owner can freeze or reset with one tap. | **Pays** the check fees and gas |
| **API sellers who want agent customers** (x402) | They need proof that a payment really happened and was meant for them, from buyers whose spending is bounded. | The `fusebox` x402 scheme: the on-chain Decision is the proof, signed by the agent that paid, so nobody watching the chain can redeem it first. A seller adds one call (`x402.requirePayment` in `fusebox-sdk`), or uses the hosted facilitator. | Pays Fusebox **nothing**: the scheme and the facilitator are free |
| **Circuit designers** (the TapeOut community) | A taped-out circuit earns nothing unless an app calls it. | A market where every check pays the designer, the no's included. The income follows the circuit NFT, so it can be sold. Fuse Studio builds, proves and tapes out a rule with no code. | **Earns** 90% of every fee their fuse is charged |

## How we reach them

These channels exist today. We haven't announced any partnerships, and none are listed here.

- **Where agent builders already look.**
  - Packages on npm:
    - [`fusebox-sdk`](https://www.npmjs.com/package/fusebox-sdk) (TypeScript);
    - [`fusebox-mcp`](https://www.npmjs.com/package/fusebox-mcp) (an MCP server for Claude, Cursor and other MCP clients);
    - [`fusebox-tools`](https://www.npmjs.com/package/fusebox-tools) (ready-made tools for the Vercel AI SDK, LangChain and ElizaOS).
  - Claude Code users get it with one line: `claude mcp add fusebox -- npx -y fusebox-mcp`.
- **Try it before you sign up.** Several pages need no wallet:
  - [Try to scam it](https://fusebox-xlayer.vercel.app/app/try) runs the real on-chain `check()` of a live wallet;
  - [Rob the agent](https://fusebox-xlayer.vercel.app/app/rob) lets you write the scam for an AI payables agent and watch what Atlas's real fuses do with whatever it tries to pay;
  - the MCP server starts read-only against the public demo wallet, Atlas.
  - Every one of these pages is a link someone can share.
- **Through x402 sellers.** Every seller that accepts the `fusebox` scheme is a place where a Fusebox wallet can shop, and every Fusebox wallet is a customer that seller can trust. The SDK covers both sides, and the docs show a seller route in a few lines.
- **Through the TapeOut designer community.**
  - [Fuse Studio](https://fusebox-xlayer.vercel.app/app/studio), the [fuse market](https://fusebox-xlayer.vercel.app/app/market) and the [designers page](https://fusebox-xlayer.vercel.app/app/designers) give designers a reason to build here and a way to get paid.
  - Designers who earn per check have a reason to promote their own fuses.
  - Fusebox is in the TapeOut Builder Camp.
- **Inside the X Layer and OKX Wallet ecosystem.**
  - Fees and payments are in USD₮0 on X Layer, the token people withdraw there from exchanges.
  - The app connects OKX Wallet (including OKX Connect by QR code and open-in-app links on phones).
  - The [DeWEB edition](https://15-2-272.tapekit.org/) is stored on X Layer and served by TapeKit, where TapeOut users browse.
- **Alerts that travel.** Anyone can follow a wallet through [@FuseboxAlertsBot](https://t.me/FuseboxAlertsBot) on Telegram. Each "stopped, and here's why" message shows the product working.

## How it earns

**Check fees.** Each fuse charges a fee in USD₮0 every time it decides a payment, paid from the wallet's prepaid
balance in the registry. Blocked attempts pay too: the no is the product. These are the fees listed in the v2
market (`fuse(id)` on registry [`0x2583…1AB6`](https://www.oklink.com/xlayer/address/0x2583928546a614A2fD993B5C106ED9aD0E781AB6)):

| Fuse | Circuit | Fee per check |
|---|---|---|
| 1 · Daily Cap | #15 | 0.001 |
| 2 · Payee Guard | #16 | 0.001 |
| 3 · Breaker | #17 | 0.0005 |
| 4 · Two of Three | #18 | 0.002 |
| 5 · Repeat Guard | #21 | 0.0005 |
| 6 · Per-Payment Cap | #22 | 0.001 |
| 7 · Strict Payee Book | #23 | 0.001 |
| 8 · Two-Strike Breaker | #24 | 0.0005 |
| 9 · Lead Approver | #25 | 0.002 |

A wallet splices in up to eight fuses, and a payment costs the fees of the fuses that decide it. That's 0.0005
USD₮0 with only the Breaker and 0.005 USD₮0 with the five original fuses. Gas is separate: a payment costs the
agent about 0.00002 OKB.

**The split.**
- 90% of each fee goes to the fuse's designer: whoever holds the circuit NFT when they claim.
- 10% goes to Fusebox (`protocolFeeBps` = 1000 on both registries).
- The contract caps Fusebox's share at 20% (`MAX_PROTOCOL_FEE_BPS`).
- Today the Fusebox team also holds the circuit NFTs of all nine listed fuses, so it currently collects the designer share as well.
- As outside designers list fuses, that share moves to them.

**Bounded by design.**
- A wallet records at most 100 decisions and 20 blocks per UTC day by default (`setDailyLimits`).
- Past those limits an attempt reverts and costs nothing.
- So with the five original fuses and the default limits, one wallet's check fees top out at 100 × 0.005 = 0.50 USD₮0 a day.
- A fee increase only applies once the owner accepts it.

**x402 pay per call.** When an agent buys an API call over x402 with the `fusebox` scheme, the price goes through
the wallet's fuses like any other payment, so every purchase is a checked payment that pays the check fees. The
demo seller charges 0.01 USD₮0 per call. For calls that small, a lighter line makes sense: Payee Guard plus Daily
Cap costs 0.002 per purchase. Sellers pay Fusebox nothing.

**A worked example (assumptions, not measurements).**
- Say an agent makes 20 payments a day through all five fuses.
  - Fees: 20 × 0.005 = 0.10 USD₮0 a day, or 3.00 USD₮0 over 30 days.
  - Of that, 2.70 goes to the fuses' designers and 0.30 to Fusebox.
  - Gas: 20 × 0.00002 = 0.0004 OKB a day.
- Now say 1,000 agents like that:
  - fees reach 3,000 USD₮0 a month;
  - 2,700 goes to designers and 300 to Fusebox.
- The protocol's income is a cut of payment volume. It grows with the number of agents paying through
  Fusebox and with designers adding fuses that owners want to splice in.

## Why people pay, and keep paying

- **The money and the rules live in the wallet.**
  - The agent's spending money, the payee book, the approvers and the limits are all on X Layer, in the wallet contract.
  - Every payment goes through the fuses. There is no "just this once" path the agent can talk its way into.
- **Stateful fuses get more useful with history.**
  - The Breaker remembers a stranger until the owner resets it.
  - The Repeat Guard remembers recent payments, so a duplicate invoice is stopped.
  - The Payee Guard knows how long each payee has been saved and lifts the trial limit when the cooling-off ends.
  - The daily spend carries through the day.
  - Starting over somewhere else means starting that memory from zero.
- **It's where the owner works day to day.**
  - The approvals inbox lists every payment waiting on your signature, across wallets.
  - Phones get push alerts.
  - Telegram shows every attempt, paid or stopped and why.
  - The owner console can freeze every agent at once.
- **The cost is small and predictable.**
  - Fees are prepaid, capped per day, and can't rise without the owner's say.
  - Next to one stopped scam payment, a month of checks is cheap.
- **Designers keep improving the supply.**
  - The income follows the circuit NFT, so a good fuse is an asset its designer wants to keep and promote.
  - Several designs can compete for one socket: four rival fuses are already live next to the originals.
  - Owners get better fuses over time without changing wallets.

## What runs on TapeOut, and what doesn't

**On TapeOut, on X Layer:**
- Every fuse is a TapeOut circuit on processor [`0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355`](https://www.oklink.com/xlayer/address/0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355):
  - circuits 15, 16, 17, 18 and 21 are fuses 1 to 5;
  - circuits 22 to 25 are the rival fuses 6 to 9.
- Every payment calls the processor's `eval` (or `step`, for fuses with memory) inside `FuseboxWallet.pay()`.
- The registry pins each fuse's netlist hash, and the market checks it against the bytes on TapeOut.
- Designers are paid through the circuit NFT.
- The DeWEB edition is stored in circuit #15's container and served by TapeKit at https://15-2-272.tapekit.org/.
- Stopped payments are posted to each wallet's TapeSend inbox on X Layer, from circuit #15's container (held by FuseboxHerald), and read back on the wallet page.

**Also on X Layer, our own contracts:** the wallets, the registry (fees and the market), the factory and the
one-transaction setup.

**Off-chain:**
- the website and app;
- the event indexer;
- the Telegram and phone alerts;
- the assistant;
- Fuse Studio's compiler and prover (they run in the browser);
- the SDK, MCP server and framework tools.

None of these can move money or change a fuse's answer.

## Where it stands, and the next three months

**Fusebox is early.** Everything above runs on mainnet today:

| Live since | What |
|---|---|
| 2026-11-15 | Wallets, registry and factory |
| 2026-11-20 | v2 with the Repeat Guard |
| 2026-11-21 | Three-tap wallet setup, Telegram alerts, the DeWEB edition, four rival fuses, and SDK and MCP server 0.6.0 |

The next three months are about getting Fusebox into other people's agents.

Every milestone below can be counted from public X Layer events (`WalletCreated`, `Decision`, `FuseListed`,
`Claimed`), so anyone can check them. The numbers are targets.

| By | Milestone |
|---|---|
| 2026-12-31 | 25 wallets on mainnet owned by people outside the team; 500 recorded decisions from those wallets; 2 x402 sellers outside Fusebox accepting the `fusebox` scheme |
| 2027-01-31 | 100 outside wallets; the first fuse listed by a designer outside the team; 3,000 recorded decisions from outside wallets |
| 2027-02-28 | 250 outside wallets; 5 outside designers with listed fuses, and the first designer claim paid to someone outside the team; 10,000 decisions a month from outside wallets |
