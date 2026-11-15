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
| Agents (`mcp/`) | An MCP server for Claude Code, Claude Desktop, Cursor and any MCP client. Without a key it is read-only; `fusebox_check` dry-runs a payment for free, and with an agent key `fusebox_pay` sends it. |
| DeWEB (`deweb/`) | One self-contained page with no off-chain references, plus a resumable publisher. The publish was rehearsed on a mainnet fork: the SHA-256 read back from the chain matched. |
| Reliability | Event history comes from a block index plus cached 1,000-block windows. Reads race three X Layer RPCs (tapeout.net, drpc, rpc.xlayer.tech), because one of them intermittently hangs. An hourly GitHub Action keeps the cache warm. |

## Tests and checks

| Check | Result |
|---|---|
| `circuits`: `npm test` | 17/17 pass. These include TAP-02's official vectors, all 2^24 Daily Cap inputs, all 2^19 Two of Three inputs, Payee Guard block-exhaustive plus 4M random, every Breaker state and input pair, and stuck-at fault coverage. |
| `contracts`: `forge test` | 61 pass offline, including fuzz tests for the daily cap, quantisation and registry solvency. The X Layer fork suite passes 4/4 against mainnet state (re-run 2026-11-15). |
| End to end, on a mainnet fork | 19 desktop flows and 11 phone flows pass, driven by a test wallet: the wizard, agent payments, the Breaker blowing and being reset, payees, fee withdrawal, freeze, My wallets, 2-of-3 approve and revoke, the playground, no-wallet, wrong-network and declined-signature paths. |
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
| Fees for our fuses | Daily Cap and Payee Guard 0.001 USDT0 per check, Breaker 0.0005, Two of Three 0.002. |
| Who can freeze | The owner, agents and approvers can freeze; only the owner can reset. |
| Registry admin | The deployer for now; a multisig before any real value. |

## Known gaps

- The contracts are unaudited. Atlas is a public demo wallet with small balances.
- The DeWEB edition's mainnet publish waits on TapeOut's one-time 0.08 OKB container fee.
- An OKX Agentic Wallet has not been tested as the agent key. It needs to send `pay` on X Layer with a ~3M gas limit.
- A release-after-delivery fuse isn't built: it needs a delivery attestation source and a new socket.
- Delisting a fuse stops new installs only; there is no designer-side kill switch, by design.
- The app shows the latest 60 decisions per wallet and links to OKLink for the rest.

## Against the rivals (read 2026-11-13)

| Project | What it does | What Fusebox has that it lacks |
|---|---|---|
| IntentGuard (CPU 414, circuit 4) | One 1,766-gate, 451-input spending-policy circuit (about 4.2M gas per eval) plus off-chain GenLayer review | Small composable fuses (11 to 108 gates, ~0.9M gas for all four), a designer marketplace, per-decision fees, LATCH state |
| Hardline | Compiles yes/no rules to NAND chips, proves them exhaustively, demo vault calls `eval` | Stackable fuses, sequential circuits (Breaker), on-chain derived numeric inputs, designer income |
| TapeSafe | 74-NAND team-approval circuit; its executor and vault are not deployed (per its README) | Live on mainnet, approvals as one fuse among several, designer income |

None of them lets a third party sell a circuit as a product and earn every time it is used.
