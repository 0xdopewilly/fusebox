# Fusebox

**English** · [中文](README.zh.md)

**Your agent pays. Circuits decide.**

Fusebox wires an AI agent's wallet through small logic circuits taped out on [TapeOut](https://tapeout.net) on X Layer. A payment reaches the payee only if every fuse on the line holds, and every fuse that checks a payment pays its designer, the no's included.

[![Fusebox MCP server](https://mcprush.com/badge/fusebox-mcp/card.svg)](https://mcprush.com/to/fusebox-mcp?ref=badge)

## For judges (X Layer TapeOut Accelerate)

| | |
|---|---|
| **Demo video (2:30)** | https://youtu.be/vcopkuNdhkc |
| **Live app** | https://fusebox-xlayer.vercel.app/app · try it with no wallet: [/app/try](https://fusebox-xlayer.vercel.app/app/try) |
| **On DeWEB** | https://15-2-272.tapekit.org/ (`15.2.272.tape`, stored in circuit #15's container, served by TapeKit) |
| **TapeOut processor** | `0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355` (OrderGuard, X Layer chain 196) |
| **Circuit IDs** | 15, 16, 17, 18, 21 (fuses 1–5) · 22, 23, 24, 25 (rival fuses 6–9) |
| **TapeOut features used** | Circuits: every payment calls the processor's `eval`/`step` on X Layer, in the same transaction. **DeWEB + TapeKit**: the on-chain edition. **TapeSend**: every stopped payment is posted to the wallet's inbox from circuit #15. |
| **Business** | [docs/BUSINESS.md](docs/BUSINESS.md): who it's for, how we reach them, how it earns (90% of every check fee to the circuit's designer), why they keep paying |
| **Usage, live** | [/app/status](https://fusebox-xlayer.vercel.app/app/status) (Usage on mainnet): wallets, payments checked, circuit evaluations, fees paid to designers, on-chain alerts |
| **Assurance** | Contracts verified on Sourcify; invariant suite, mutation tests and a complete Payee Guard proof in [docs/ASSURANCE.md](docs/ASSURANCE.md) |
| **Built during the event** | First commit 2026-11-13; all of Fusebox is event work |
| **Follow** | [@fuseboxhq](https://x.com/fuseboxhq) |

- **Live site:** https://fusebox-xlayer.vercel.app
- **Live app:** https://fusebox-xlayer.vercel.app/app (Atlas, a real agent wallet on X Layer mainnet)
- **On X:** [@fuseboxhq](https://x.com/fuseboxhq)
- **For agents:** `claude mcp add fusebox -- npx -y fusebox-mcp` ([npm](https://www.npmjs.com/package/fusebox-mcp)), the TypeScript SDK `npm install fusebox-sdk viem` ([npm](https://www.npmjs.com/package/fusebox-sdk), [source](sdk)) for check, pay (checked first), pay-per-call, approve, freeze, watch and history, or ready-made tools for the Vercel AI SDK, LangChain and ElizaOS: `npm install fusebox-tools` ([source](tools)). Not on a Fusebox wallet yet? Pre-flight runs any payment through TapeOut circuits before your agent signs it from any wallet (`preflight()` in the SDK, `fusebox_preflight` in the MCP)
- **Pay per call (x402):** agents pay for APIs over HTTP 402, and the price goes through the wallet's fuses first. Two [live demo sellers](https://fusebox-xlayer.vercel.app/app/x402) (an honest price sheet and a scam), a seller helper in the SDK and a hosted verifier for the `fusebox` scheme.
- **Plain-English guardrails:** describe your agent in the wizard and get a proposed line of fuses with reasons and test payments, checked on TapeOut's circuits before you sign.
- **Rob the agent:** https://fusebox-xlayer.vercel.app/app/rob. Write the scam; an AI payables agent reads it and decides, and whatever it tries to pay goes through Atlas's real fuses, read-only.
- **Try to scam it:** https://fusebox-xlayer.vercel.app/app/try. Write the payment an agent might be tricked into; the app runs the real `check()` of Atlas's v2 wallet on X Layer (Atlas's limits plus the Repeat Guard, five fuses). It's free, needs no wallet, and nothing moves. The same invoice sent twice is stopped: that wallet really paid it, and the Repeat Guard remembers.
- **For approvers:** [Approvals](https://fusebox-xlayer.vercel.app/app/approve) is an inbox of every payment waiting on your signature, across all the wallets where you hold a seat, with a feed you can subscribe to. Install Fusebox as an app and turn on alerts: when an agent hits the approval threshold, your phone buzzes with that exact payment.
- **For owners:** [My wallets](https://fusebox-xlayer.vercel.app/app/mine) is a fleet view (fees left, blown fuses, today's stops, freeze every agent); the wizard starts from tested lines (invoice agent, procurement bot, refund desk, small allowance); every wallet page has an owner console (fuses, payees, agents, approvers, money, ownership), spending analytics (paid vs stopped per day, top payees, what each fuse stopped), an Atom feed of its decisions, a full CSV export and browser alerts for stopped payments. The [line simulator](https://fusebox-xlayer.vercel.app/app/simulate) runs any line of fuses on a sequence of payments with TapeOut's own `eval`/`step`, and matches a real wallet fuse for fuse.
- **For designers:** [Fuse Studio](https://fusebox-xlayer.vercel.app/app/studio) builds a fuse from rules (or from 13 ready-made ones), compiles it to NAND gates, proves the bytes on every input in the browser (all 2^33 for Payee Guard, by BDD equivalence), then mints, tapes out and lists it from your wallet. All five live fuses come out of it byte-identical (circuits #15, #16, #17, #18 and #21). Every fuse has its own page (e.g. [/app/fuse/1](https://fusebox-xlayer.vercel.app/app/fuse/1)), installs from the market in one signature, and describes itself on-chain (`fusebox-fuse/1` metadata as a data URI).

## New to Fusebox?

AI agents now hold wallets and send real money, and one convincing message can make an agent pay a scammer. Fusebox gives the agent a wallet where every payment must pass a few small circuits called **fuses** (a daily limit, known payees only, two signers for big payments). If any fuse says no, nothing moves.

**Atlas** is the live demo wallet: an AI agent pays a supplier from it on X Layer mainnet, through four fuses. Start by trying to trick it in *Try to scam it*: free, no wallet, nothing moves. First-time visitors get a three-card intro that ends there, and every screen has an **i** button and tap-to-explain terms (the full glossary is in the docs).

- **Phones** get an app layout: a dock (Wallet, Try, Market, Sell, your account), one job per screen, details in bottom sheets, and the wizard as one step per screen.
- **Connecting:** any browser wallet (EIP-6963 or injected), the **OKX Wallet app** over OKX Connect (a QR code on desktop, a hand-off on phones), or reopen Fusebox inside OKX Wallet, MetaMask, Trust Wallet or Bitget Wallet. Fusebox adds and switches to X Layer itself.
- **Genuine use, in minutes:** Wire up can make your agent's key in the browser, send it gas, and finish with a ready setup for Claude Code, Claude Desktop, Cursor or the SDK. A first-payment guide then has your agent pay a saved payee for real and shows a stranger being stopped (read-only).
- **The Fusebox assistant:** pay by chatting ("pay Kano Cotton 2"). It only proposes; your wallet's fuses check each payment on X Layer, you tap Pay, and the agent key in your browser signs. It only pays saved payees or addresses you type, and never sees a key on the server.
- **Before you wire up** a wallet you need: a wallet on X Layer (the owner), an agent key (the address your agent signs with), USD₮0 on X Layer for fees and payments, and a little OKB for gas. The wizard's first step checks these.

## Live on X Layer mainnet (chain 196)

| What | Address / id |
|---|---|
| TapeOut processor (OrderGuard) | [`0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355`](https://www.oklink.com/xlayer/address/0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355) |
| Circuits | **#15** Daily Cap · **#16** Payee Guard · **#17** Breaker · **#18** Two of Three · **#21** Repeat Guard |
| FuseRegistry v2 (new wallets, the fuse market) | [`0x2583928546a614A2fD993B5C106ED9aD0E781AB6`](https://www.oklink.com/xlayer/address/0x2583928546a614A2fD993B5C106ED9aD0E781AB6) |
| FuseboxFactory v2 | [`0xdFc9b1d715efB2bCDAd8f848A5E3b4e2c243EE9B`](https://www.oklink.com/xlayer/address/0xdFc9b1d715efB2bCDAd8f848A5E3b4e2c243EE9B) |
| FuseboxSetup (a whole wallet in one transaction) | [`0x3B31e35bf9157413Bb50884009c415b27e3a6DA9`](https://www.oklink.com/xlayer/address/0x3B31e35bf9157413Bb50884009c415b27e3a6DA9) |
| FuseboxHerald (holds circuit #15; posts fuse alerts over TapeSend) | [`0xBf385a2A9368cC08EA234FF1965B6a486a6b0b81`](https://www.oklink.com/xlayer/address/0xBf385a2A9368cC08EA234FF1965B6a486a6b0b81) |
| FuseRegistry v1 (Atlas and the first wallets) | [`0x852a278322667BB86A2665a38CbC5Bfd551B20d7`](https://www.oklink.com/xlayer/address/0x852a278322667BB86A2665a38CbC5Bfd551B20d7) |
| FuseboxFactory v1 | [`0x192C099a18ed42612b6e74f243f8dF1EE0E3E7a5`](https://www.oklink.com/xlayer/address/0x192C099a18ed42612b6e74f243f8dF1EE0E3E7a5) |
| Atlas (demo wallet) | [`0x0Db0457715a6445D8a65F820d717a6B39Be66800`](https://www.oklink.com/xlayer/address/0x0Db0457715a6445D8a65F820d717a6B39Be66800) |
| Fees | USDT0 [`0x779Ded0c9e1022225f8E0630b35a9b54bE713736`](https://www.oklink.com/xlayer/address/0x779Ded0c9e1022225f8E0630b35a9b54bE713736) |

Every address is in [`deployments/xlayer-mainnet.json`](deployments/xlayer-mainnet.json). **Setting up a wallet takes three taps:** a free USD₮0 permit signature, one `FuseboxSetup.setUpWallet` transaction that creates the wallet, splices in its fuses, saves payees, seats approvers, prepays fees, funds it and sends the agent gas, then `acceptOwnership()`. The first one on mainnet, [`0x63d5…48fa`](https://fusebox-xlayer.vercel.app/app/w/0x63d5033569101B320A088680629cF0E10b3E48fa), took 5.02M gas (about 0.0001 OKB) for all five fuses. **Telegram alerts:** follow any wallet through [@FuseboxAlertsBot](https://t.me/FuseboxAlertsBot) and every payment its agent tries arrives as a message, paid or stopped and why. v2 (Nov 20) stores socket pinouts as data and adds the Repeat Guard; v1 (Nov 15) keeps running Atlas unchanged. See [docs/V2-REPEAT-GUARD.md](docs/V2-REPEAT-GUARD.md). The first v2 wallet, [`0x6292…577c`](https://fusebox-xlayer.vercel.app/app/w/0x6292Ea57a1d50c74A5E918CfDC4Dc1Dbf87a577c), had its agent send the same invoice twice on mainnet: the first payment went through and the Repeat Guard [stopped the second](https://www.oklink.com/xlayer/tx/0x502bd9f3fe577c7a74f0c43696003559f95d2cff3929f45a5e88ec678baf22ad).

## The fuses: 5 sockets, 9 circuits

A **socket** is one kind of rule: it fixes what the wallet tells the circuit and what the owner's settings mean. Fusebox defines five sockets, and any circuit taped out for one can be listed as a fuse. **Nine fuses are live:** Fusebox's five originals, one per socket, and four rival designs that compete with them on sockets 1 to 4. A wallet owner picks which design to install. All nine are TapeOut circuits on the OrderGuard processor `0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355` on X Layer.

**The five originals (fuses 1 to 5)**

| Fuse | TapeOut circuit | What it does | Fee / check |
|---|---|---|---|
| [Daily Cap](https://fusebox-xlayer.vercel.app/app/fuse/1) | #15 · 24 inputs · 108 NAND | No more than the owner's cap in a UTC day, however the agent is asked. | 0.001 USDT0 |
| [Payee Guard](https://fusebox-xlayer.vercel.app/app/fuse/2) | #16 · 33 inputs · 79 NAND | Saved payees only; a new payee gets a small trial amount until its cooling-off ends. | 0.001 USDT0 |
| [Breaker](https://fusebox-xlayer.vercel.app/app/fuse/3) | #17 · 4 inputs · 10 NAND + 1 LATCH | Trips on a payment to a stranger and stays blown until the owner resets it. | 0.0005 USDT0 |
| [Two of Three](https://fusebox-xlayer.vercel.app/app/fuse/4) | #18 · 19 inputs · 46 NAND | Above a threshold, two of three approvers must sign that exact payment. | 0.002 USDT0 |
| [Repeat Guard](https://fusebox-xlayer.vercel.app/app/fuse/5) (v2) | #21 · 2 inputs · 2 NAND | The same invoice sent twice gets paid once: the same amount to the same payee inside the owner's window is stopped, unless the owner clears one repeat. | 0.0005 USDT0 |

**The four rivals (fuses 6 to 9)**, same sockets, different policies. The Fusebox team taped them out to show designs competing on one socket; outside designers can list their own the same way.

| Fuse | Socket | TapeOut circuit | What it does | Fee / check |
|---|---|---|---|---|
| [Per-Payment Cap](https://fusebox-xlayer.vercel.app/app/fuse/6) | Daily Cap | #22 · 24 inputs · 37 NAND | However many invoices arrive, no single payment can be bigger than the cap. | 0.001 USDT0 |
| [Strict Payee Book](https://fusebox-xlayer.vercel.app/app/fuse/7) | Payee Guard | #23 · 33 inputs · 39 NAND | A newly saved payee gets nothing, not even a test payment, until its cooling-off is over. | 0.001 USDT0 |
| [Two-Strike Breaker](https://fusebox-xlayer.vercel.app/app/fuse/8) | Breaker | #24 · 4 inputs · 16 NAND + 2 LATCH | One odd payee is a typo; two is a pattern. The first is refused, the second blows the breaker. | 0.0005 USDT0 |
| [Lead Approver](https://fusebox-xlayer.vercel.app/app/fuse/9) | Two of Three | #25 · 19 inputs · 43 NAND | Above the threshold, two must sign and one of them must be seat 1. | 0.002 USDT0 |

**Check them yourself.** Each fuse's page reads it live from X Layer: its netlist from the TapeOut processor (checked against the hash the registry pinned at listing), gates, decisions and earnings, with links to [the processor](https://www.oklink.com/x-layer/evm/address/0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355) and [the circuit-NFT collection](https://www.oklink.com/x-layer/evm/token/0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355) on OKLink. On [tapeout.net](https://tapeout.net): switch to X Layer, open Processors, then OrderGuard and the circuit number.

The Atlas demo wallet (made with v1) runs the first four originals; its v2 twin, which *Try to scam it* checks against, runs all five.

## How a payment works

1. **The agent asks to pay.** It sends the payee, the amount and a one-line memo. That's all it gets to say, and the fuses never read the memo.
2. **Every fuse checks it on X Layer, in the same call.** `FuseboxWallet.pay()` builds each fuse's inputs from the wallet's own state, then calls `eval` (or `step` for latches) on TapeOut's processor.
3. **One no stops the payment.** The decision is recorded either way, along with which fuse blew. The Breaker's latch state lives in the wallet.
4. **Designers are paid.** `FuseRegistry.charge()` takes each fuse's fee from the wallet's prepaid USDT0 balance. 90% goes to whoever owns the circuit NFT, and the protocol keeps 10% (capped at 20%).

## Built on TapeOut

- **Every fuse is a TapeOut circuit.** All nine (circuits #15–18, #21 and the rivals #22–25) live on TapeOut's OrderGuard processor `0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355`, and every payment calls the processor's `eval` or `step` on X Layer.
- **TAP-02 toolchain.** [`circuits/`](circuits) builds, encodes and simulates TAP-02 netlists, and its tests pass TapeOut's official test vectors.
- **Netlist integrity in the app.** The [fuse market](https://fusebox-xlayer.vercel.app/app/market) reads each fuse's netlist straight from its TapeOut processor and checks it against the hash the registry pinned when the fuse was listed. Fuses without a hand-drawn schematic get their real wiring drawn from those bytes.
- **DeWEB and TapeKit.** [`deweb/`](deweb) is a version of Fusebox stored on X Layer in circuit #15's container and opened through TapeKit: **[https://15-2-272.tapekit.org/](https://15-2-272.tapekit.org/)** (`15.2.272.tape`). It has no off-chain references, and your browser reads every number, including a live "scam Atlas" `check()`, from X Layer.
  - Published on mainnet 2026-11-21: the container was opened (0.08 OKB to TapeOut), all 7 chunks stored and the name bound, and the SHA-256 read back from the chain matched (`0xdd038cb2…41ae`). The same file is also previewed at [/onchain](https://fusebox-xlayer.vercel.app/onchain).
- **TapeSend alerts.** Every payment a Fusebox wallet's fuses stop is posted, once, to that wallet's TapeSend inbox on X Layer (endpoint `uint32(0) ‖ uint64(196) ‖ wallet` on the DeWEB hub `0xe61A…25ee`), as a public TapeSend message from circuit #15's container. The wallet page reads the inbox back from the hub and checks each message against its on-chain digest; messages from any other sender are never shown as Fusebox's.
  - TapeSend only lets a circuit's holder send, so circuit #15 sits in [`FuseboxHerald`](contracts/src/FuseboxHerald.sol) (Sourcify-verified). The server holds only the herald's *crier* key, which can post and nothing else; the admin (a cold key) claims the fuse's designer fees, runs the DeWEB site and can take the circuit back. A leaked crier key costs spam, not the circuit. 10 fork tests against the live hub ([`HeraldFork.t.sol`](contracts/test/fork/HeraldFork.t.sol)).
  - Posted right after a payment (the app, SDK and MCP call `/api/telegram/notify`), and by a sweep every 10 minutes for agents that pay some other way. At most 6 posts per wallet per hour; each costs about 0.000004 OKB of gas.

## Repository

| Folder | What's in it |
|---|---|
| [`circuits/`](circuits) | The TAP-02 netlist toolchain (builder, encoder, simulator), the four shipped fuses and four rival designs for the same sockets ([`src/rivals.ts`](circuits/src/rivals.ts)), all with exhaustive tests. `scripts/publish-rivals.mjs` tapes the rivals out and lists them (rehearsed on a fork; `--dry` prices it). |
| [`contracts/`](contracts) | `FuseRegistry`, `FuseboxWallet` and `FuseboxFactory` (Foundry), the unit and fuzz tests, the X Layer fork tests, and the launch scripts. |
| [`sdk/`](sdk) | [`fusebox-sdk`](sdk/README.md): a typed client for agents and services (viem). Tested against a mainnet fork. |
| [`mcp/`](mcp) | [`fusebox-mcp`](https://www.npmjs.com/package/fusebox-mcp): `fusebox_check`, `fusebox_pay`, `fusebox_status` and `fusebox_fetch` (x402) for any MCP agent (`npx -y fusebox-mcp`). |
| [`tools/`](tools) | [`fusebox-tools`](tools/README.md): the same four tools for the Vercel AI SDK, LangChain and ElizaOS, or framework-free. |
| [`web/`](web) | The site and app (Next.js, GSAP, three.js, viem). They read X Layer mainnet directly. |
| [`deweb/`](deweb) | The DeWEB edition: one self-contained page with no backend, built for circuit #15's container (`15.2.272.tape`, served by TapeKit), plus a resumable publisher. |
| [`deployments/`](deployments) | Deployed addresses. |
| [`docs/`](docs) | [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) (sockets, circuits, fee flow, threat model, gas), [`BUSINESS.md`](docs/BUSINESS.md) (who it's for, how it earns, milestones), [`STATUS.md`](docs/STATUS.md) and [`tapeout-ecosystem-research.md`](docs/tapeout-ecosystem-research.md). |
| [`design/`](design) | Design directions and the landing mock. |

## Run it

```bash
git clone --recursive https://github.com/0xdopewilly/fusebox.git && cd fusebox

# circuits: build the netlists and run the exhaustive tests
(cd circuits && npm ci && npm test)

# contracts: unit, fuzz, invariant and X Layer mainnet-fork tests, then the mutation check
(cd contracts && forge test && forge test --match-path test/fork/XLayerFork.t.sol --fork-url https://rpc.xlayer.tech)
(cd contracts && python3 test/invariant/mutation.py)

# rehearse the whole launch on a local fork of X Layer mainnet (no keys or funds: it makes throwaway keys)
anvil --fork-url https://rpc.xlayer.tech --port 8547 --chain-id 196 --auto-impersonate &
RPC=http://127.0.0.1:8547 contracts/script/launch.sh

# web: reads X Layer mainnet by default
(cd web && pnpm install && pnpm dev)   # http://localhost:3120

# DeWEB edition: build the self-contained page; it fails on any off-chain reference
(cd deweb && npm ci && npm run build)   # deweb/dist/index.html, same SHA-256 on every build
```

X Layer's public RPCs cap `eth_getLogs` ranges (1,000 blocks on tapeout.net, about 100 on rpc.xlayer.tech and drpc), and tapeout.net sometimes hangs. The app therefore reads event history from a small block index ([`web/lib/deployments/mainnet-index.json`](web/lib/deployments/mainnet-index.json)), scans forward from there in cached windows, and races the three RPCs when one is slow. Refresh the index with `node web/scripts/index-logs.mjs`.

## Status

The contracts are deployed and working on X Layer mainnet. They have no third-party audit yet. What stands in for one is in [docs/ASSURANCE.md](docs/ASSURANCE.md): 12 invariants checked over 786,432 random calls from every role, long walks that must reach every path, a mutation check that catches all 14 planted bugs, a review of the web app, SDK and MCP server with every finding fixed, and a Slither triage. Atlas is a public demo wallet with small balances.

## License

MIT
