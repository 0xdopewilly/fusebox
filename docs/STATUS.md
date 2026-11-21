# Fusebox status

Last updated 2026-11-15. Hackathon: X Layer TapeOut Accelerate, due 2026-12-07 23:59 UTC.

Fusebox is live on X Layer mainnet (chain 196): the contracts, four TapeOut circuits, a public demo wallet,
the site and app, the docs and an MCP server for agents. Addresses are in the [README](../README.md) and
[`deployments/xlayer-mainnet.json`](../deployments/xlayer-mainnet.json).

## Live

| What | Where |
|---|---|
| Site | https://fusebox-xlayer.vercel.app |
| App | https://fusebox-xlayer.vercel.app/app: Atlas, the demo wallet, with its fuses, decisions and owner tools |
| Try to scam it | https://fusebox-xlayer.vercel.app/app/try: Atlas's real `check()` on mainnet, free, no wallet needed |
| Wire up a wallet | https://fusebox-xlayer.vercel.app/app/new: factory call, fuses, payees, approvers and fees, in one guided run |
| Fuse market and designers | https://fusebox-xlayer.vercel.app/app/market and /app/designers: netlists read from TapeOut, earnings, claims, listing |
| Docs | https://fusebox-xlayer.vercel.app/docs |
| MCP server | [`fusebox-mcp`](https://www.npmjs.com/package/fusebox-mcp) on npm: `fusebox_check`, `fusebox_pay`, `fusebox_status` |
| DeWEB edition | Built for circuit #15's container (`15.2.272.tape`); previewed at https://fusebox-xlayer.vercel.app/onchain |

On mainnet at the time of writing, Atlas has made 5 decisions (2 paid, 3 stopped), and its fuses have
been checked 20 times. They earned their designer 0.02025 USDT0, and the protocol earned 0.00225 USDT0.
The app always shows the live figures.

## What's built

| Area | What exists |
|---|---|
| Circuits (`circuits/`) | A TAP-02 toolchain (NAND/LATCH builder, encoder/decoder, evaluator, bitsliced simulator) and four fuses: Daily Cap (108 NAND), Payee Guard (79), Breaker (10 NAND + 1 LATCH) and Two of Three (46). |
| Contracts (`contracts/`) | `FuseRegistry` (listing with processor trust, pinned netlist hashes, per-decision USDT0 fees, prepaid balances, claims by the circuit NFT owner, 10% protocol share capped at 20%), `FuseboxWallet` (an owner, agents, up to 8 fuses, `pay` through `eval`/`step` with stored LATCH state, a payee book, 2-of-3 approvals bound to the exact payment, freeze/reset, a `check` dry run, daily decision budgets) and `FuseboxFactory`. Source verified on Sourcify. |
| Web (`web/`) | Next.js app reading X Layer directly: landing, Atlas, wallet pages for any factory wallet, the scam playground, the wallet wizard, My wallets, approvals, the fuse market, designer tools, docs and a 404. Wallet writes are simulated before you sign, and errors are explained in plain words. Each wallet link gets a live share card with its fuses and decisions. |
| Owners and designers | An owner console on every wallet page (all ~20 owner calls), install from the market, designer price/listing/description tools, per-fuse pages, Atom feeds, CSV export and browser alerts. Fuse descriptions are `fusebox-fuse/1` JSON stored on-chain as data URIs. |
| Fuse Studio (`/app/studio`) | Rules (OR across groups, AND within one; N strikes for the Breaker socket) compiled with the circuits toolchain, proved in the browser (2^24 inputs in about 2 s), then mint, tape-out and listing from the designer's wallet, with an on-chain description. Daily Cap, Per-Payment Cap and Two of Three rebuild byte-identical to the circuits on TapeOut. |
| Line simulator (`/app/simulate`) | Any listed fuses and settings, payments in order, every verdict from TapeOut's `eval`/`step` on X Layer with spend and latch state carried forward. |
| Approver inbox (`/app/approve`) | Every payment an approval fuse stopped, across all wallets where the connected address holds a seat, until a later decision pays it; signatures so far; one-tap approve and revoke; an Atom feed per approver. The SDK and MCP point agents to it. |
| Fleet view (`/app/mine`) | All of an owner's wallets: balances, fees left and decisions covered, blown fuses, today's activity, status flags, freeze every agent. |
| Starter lines and Studio drafts | The wizard starts from four tested lines; Studio drafts run in the simulator in the browser (identical to their taped-out twin) and travel as links. |
| Spending analytics | Paid vs stopped per day (one scale), top payees, what each fuse stopped, a range filter, tooltips and a table view; colours validated for colour-blind separation on the dark surface. |
| SDK (`sdk/`) | `fusebox-sdk`: check, pay (checked first by default), fetch (x402 pay-per-call), requestApproval, approve, freeze, watch, history, status; `x402.requirePayment` for sellers. |
| Pay per call (`/app/x402`) | x402 v2 with a `fusebox` scheme on eip155:196: a signed one-time nonce in the offer, the payment through the fuses with the nonce in the memo, the transaction as proof. Sellers verify on X Layer (factory-made wallet, allowed Decision, USDT0 moved, nonce, single use via Vercel Blob). Two live demo sellers and a hosted verify/settle facilitator. First real purchase on mainnet 2026-11-16: Atlas's agent paid 0.01 USDT0 through all four fuses for the price sheet (decision #6, tx `0x058bd5eb…1f94`), the seller answered 200 with a receipt, and a second settle of the same payment was refused. |
| Rob the agent (`/app/rob`) | A visitor writes the scam; the payables agent decides (Claude Haiku 5.5 on NEAR AI Cloud with a pay tool when `NEARAI_API_KEY` is set; Claude Opus 5.5 on the Anthropic API with `ANTHROPIC_API_KEY`; otherwise a scripted agent that believes every word); its payment, or the message's ask if it refused, goes through Atlas's `check()`. Shareable links. Capped at 6 tries a minute per visitor and 60 model calls an hour (400 a day) per server; out of credit or unreachable, the scripted agent answers. |
| Approver alerts | An installable app (manifest, service worker) and web push: an approver signs once per device; agents' signed requests (SDK `pay()`, MCP `fusebox_pay`) are checked on X Layer and pushed to every seat; an hourly sweep announces open requests once. Subscriptions live in a private Vercel Blob store. |
| Agent frameworks (`tools/`) | `fusebox-tools`: check/pay/status/fetch for the Vercel AI SDK, LangChain and ElizaOS 1.x, plus a framework-free core. |
| Pre-flight (`/api/preflight`) | Any agent wallet runs a payment through any line of listed TapeOut circuits before signing: eval/step on mainnet, read-only, caller-supplied context (today's spend, payee, approvals, latch state), next state returned. SDK `preflight()`, MCP `fusebox_preflight`. |
| Plain-English guardrails | The wizard proposes a line from a description: Claude Haiku 5.5 on NEAR AI (strict tool call, validated and clamped) or a rule reader; reasons per fuse, test payments that open in the simulator, one tap to fill the wizard. |
| Status (`/app/status`) | Live health: X Layer RPCs (latency, head), event index lag, TapeOut processor trust, Atlas's line and fee coverage, the AI agent, NEAR AI, x402 offers, alerts; cached 30 s; JSON at `/api/status`. |
| Gate golf (Fuse Studio) | `circuits/src/optimize.ts`: structural rules, BDD-based functional reduction and redundancy removal, latches untouched; every result proven identical on all inputs (exhaustive up to 24 bits, BDD above). Our eight circuits are already minimal; Studio rules shrink 5-75% (e.g. 74 → 35). Gas model ≈ 22,602 + 2,400 per gate. |
| Badges | `/api/badge/<wallet>`: an SVG with the wallet's fuses and whether any is blown or the wallet is paused, cached five minutes; copied from a wallet page as Markdown. |
| Rival fuses (`circuits/src/rivals.ts`) | Per-Payment Cap (37 NAND), Strict Payee Book (39), Two-Strike Breaker (16 NAND + 2 LATCH), Lead Approver (43). Exhaustively tested, taped out and listed on a mainnet fork, and paid through end to end. The mainnet tape-out (about 0.02 OKB) waits on funds. |
| Agents (`mcp/`) | An MCP server for Claude Code, Claude Desktop, Cursor and any MCP client. Without a key it is read-only; `fusebox_check` dry-runs a payment for free, with an agent key `fusebox_pay` sends it, and `fusebox_fetch` pays for x402 APIs through the fuses. |
| DeWEB (`deweb/`) | One self-contained page with no off-chain references, plus a resumable publisher. The publish was rehearsed on a mainnet fork: the SHA-256 read back from the chain matched. |
| Reliability | Event history comes from a block index plus cached 1,000-block windows. Reads race three X Layer RPCs (tapeout.net, drpc, rpc.xlayer.tech), because one of them intermittently hangs. An hourly GitHub Action keeps the cache warm. |

## Tests and checks

| Check | Result |
|---|---|
| `circuits`: `npm test` | 36/36 pass (five fuses). These include TAP-02's official vectors, all 2^24 Daily Cap inputs, all 2^19 Two of Three inputs, all 2^33 Payee Guard inputs by BDD proof (plus block-exhaustive and 4M random as a cross-check), every Breaker state and input pair, and stuck-at fault coverage. |
| `contracts`: `forge test` | 99 pass offline. They include 12 invariants, each over 256 runs of 256 random calls from every role (agent, owner, approvers, designer, TapeOut upgrading its processor, an attacker) against all five real fuses, with a separate model predicting every decision and fee. Long walks must reach every path, and fuzz tests cover the daily cap, quantisation and registry solvency. The X Layer fork suite passes 5/5 against mainnet state (re-run 2026-11-19). |
| Mutation check (`contracts/test/invariant/mutation.py`) | 14 realistic bugs planted one at a time (a breaker that forgets, approvals not used up, a fee above what the owner accepted, a missing access check, a remeasured cap that keeps its count, a one-step ownership change, and so on); all 14 are caught. See [ASSURANCE.md](ASSURANCE.md). |
| Off-chain review | Every API route, the SDK and the MCP server: 4 medium and 5 low findings, all fixed and tested on a mainnet fork (x402 proofs signed by the paying agent, push alerts locked to push services and approvers, sweeps behind a secret, shared AI budgets, a rate-limited RPC proxy, bounded metadata reads, a Content Security Policy). See [ASSURANCE.md](ASSURANCE.md). |
| Static analysis | `forge lint`: no findings in `src/`. Slither 0.11.6: 37 results, none a defect, each triaged in [ASSURANCE.md](ASSURANCE.md). |
| v2 deploy (2026-11-20) | Rehearsed on a fresh mainnet fork minutes before the broadcast, then 11/11 transactions landed. Live checks after: 5 fuses listed, sockets 1–5 defined, circuit #21 answers `eval` correctly for first, repeat and cleared payments. |
| End to end, on a mainnet fork | 19 desktop flows and 11 phone flows pass, driven by a test wallet: the wizard, agent payments, the Breaker blowing and being reset, payees, fee withdrawal, freeze, My wallets, 2-of-3 approve and revoke, the playground, no-wallet, wrong-network and declined-signature paths. |
| Owner console, market install, designer tools (fork) | 35 flows: every console action checked on-chain, install from a market card, set fee, delist/relist, the on-chain description. |
| Rival fuses (fork) | 17 flows: a wallet running all four rivals, one strike vs two, reset, names, setting labels, CSV, the fuse page. |
| Simulator vs wallet (fork) | 24 payments across the shipped and rival lines: every fuse's verdict in the simulator equals a real wallet's. |
| Fuse Studio (fork) | 17 flows: a rule built in the UI, proved on 2^24 inputs, minted, taped out and listed; TapeOut's processor gives the rule's answers; a 3-strike breaker from the Studio runs in a real wallet (strikes 1-2 refused without blowing, 3 blows, reset clears). |
| Approver inbox (fork) | 11 flows: stopped by Two of Three, in the right inbox and nobody else's, approved in the UI, second signature, cleared, the retry paid, moved to paid-after-approval, the feed. |
| Fleet, starters, drafts (fork) | 14 flows, including a Studio draft evaluated in the browser matching its taped-out twin on TapeOut payment for payment. |
| SDK (fork) | 6 groups: status, check, pay (not sent / sent / forced), approve, freeze, watch, history. |
| Safari engine | WebKit 18.2 on 12 pages at iPhone and desktop sizes: no script errors and no sideways overflow. |
| Accessibility | axe-core finds 0 violations on every page at desktop and phone sizes. Lighthouse accessibility scores 100. |
| Performance (Lighthouse, mobile) | Landing 68, app 75, fuse market 98, docs 99. |
| Load (fork) | With 33 wallets and 100 decisions on one wallet, My wallets lists in 0.3 s and the wallet page renders in 0.35 s. |
| Independent review | An earlier review pass found 7 issues (2 medium). All are fixed with regression tests; see ARCHITECTURE.md §7. |

What was verified against the real TapeOut contracts on a fork before launch:
- the processor's `eval`/`step` agree with our simulator on every spec vector, LATCH included;
- all four fuses tape out and their stored netlist hashes match the build;
- a change to TapeOut's beacon implementation makes every fuse fail closed and charge nothing.

## Product decisions

| Question | Decision |
|---|---|
| Which processor | OrderGuard (`0x57F3…A355`), TapeOut's OKB-priced processor, verified on the fork. |
| Do blocked attempts pay the designer? | Yes. A fuse that stops a scam has done its job. Each wallet records at most 100 decisions and 20 blocks per UTC day, so spam can't drain its fee balance. |
| Protocol share | 10% of every fee; the contract caps it at 20%. |
| Fees for our fuses | Daily Cap and Payee Guard 0.001 USDT0 per check, Breaker 0.0005, Two of Three 0.002, Repeat Guard 0.0005. |
| Who can freeze | The owner, agents and approvers can freeze; only the owner can reset. |
| Registry admin | The deployer for now. `contracts/script/registry-to-safe.sh` moves both registries to a Safe multisig, rehearsed on a mainnet fork; it waits on the owners' addresses. |

## Known gaps

- The contracts have no third-party audit yet; [ASSURANCE.md](ASSURANCE.md) lists what stands in for one. Atlas is a public demo wallet with small balances.
- The DeWEB edition's mainnet publish waits on TapeOut's one-time 0.08 OKB container fee.
- Atlas is a v1 wallet, so it can't run the Repeat Guard: *Try to scam it* still shows the duplicate-invoice gap on Atlas. Wallets made since 2026-11-20 are v2 and can. See [V2-REPEAT-GUARD.md](V2-REPEAT-GUARD.md).
- An OKX Agentic Wallet has not been tested as the agent key. It needs to send `pay` on X Layer with a ~3M gas limit.
- A release-after-delivery fuse isn't built: it needs a delivery attestation source and a new socket.
- Delisting a fuse stops new installs only; there is no designer-side kill switch, by design.
- The app shows the latest 60 decisions per wallet and links to OKLink for the rest.
- Rob the agent runs on NEAR AI Cloud's builder credit, which Veto shares; the caps keep a busy page from spending more than a few cents a day.
- The x402 `fusebox` scheme is Fusebox's own: standard `exact` sellers can't be paid by a contract wallet without `isValidSignature`, which FuseboxWallet doesn't implement (and shouldn't: a signature would skip the fuses).

## Against the rivals (read 2026-11-13)

| Project | What it does | What Fusebox has that it lacks |
|---|---|---|
| IntentGuard (CPU 414, circuit 4) | One 1,766-gate, 451-input spending-policy circuit (about 4.2M gas per eval) plus off-chain GenLayer review | Small composable fuses (11 to 108 gates, ~0.9M gas for all four), a designer marketplace, per-decision fees, LATCH state |
| Hardline | Compiles yes/no rules to NAND chips, proves them exhaustively, demo vault calls `eval` | Stackable fuses, sequential circuits (Breaker), on-chain derived numeric inputs, designer income |
| TapeSafe | 74-NAND team-approval circuit; its executor and vault are not deployed (per its README) | Live on mainnet, approvals as one fuse among several, designer income |

None of them lets a third party sell a circuit as a product and earn every time it is used.
