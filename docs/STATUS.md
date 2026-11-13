# Fusebox status

Last updated 2026-11-13. Hackathon: X Layer TapeOut Accelerate, due 2026-12-07 23:59 UTC.
Scope of this pass: contracts, circuits, tests, docs. No frontend (designs need approval first).
Nothing has been sent to mainnet; no real OKB or USDT0 has been spent.

## Done

| Area | What exists |
|---|---|
| Circuit toolchain (`circuits/`) | NAND/LATCH builder, TAP-02 encoder/decoder/evaluator (with REF), bitsliced simulator, dependency-free keccak256, build script that emits `build/fuses.json` and the Solidity fixtures. TypeScript, Node ≥ 23.6, only dev dependencies. |
| Fuses | Daily Cap (108 gates), Payee Guard with cooling-off and trial allowance (79), Breaker LATCH (10 NAND + 1 LATCH), Two of Three above a threshold (46). |
| `FuseRegistry` | Listing by circuit NFT owner with processor trust (code hash + factory + attested implementation), pinout, gate budget and netlist hash checks; originals marked; per-decision USDT0 fees; prepaid balances; claims by the current NFT owner; 10% protocol share (max 20%). |
| `FuseboxWallet` | Owner, agents, enabled tokens, ordered stack of up to 8 fuses, `pay` with eval/step and stored LATCH state, recorded blocked attempts that still pay designers, payee book, 2-of-3 approvals bound to the exact payment, freeze (owner/agent/approver) and reset (owner), kill switch, daily limit on recorded blocks, `check` dry run, `execute`, two-step ownership. |
| `FuseboxFactory` | Deploys and records wallets. |
| Scripts | `Deploy.s.sol` (registry + factory + trust config, re-checks chain facts), `TapeOutFuses.s.sol` (buys transistors, tapes out, lists). Rehearsed on a local anvil fork with an impersonated sender. |
| Docs | `docs/ARCHITECTURE.md` (diagrams, sockets, circuits, fee flow, threat model, gas). |
| Git | Local repository only, logical commits, no remote. |

## Test results

| Suite | Result |
|---|---|
| `circuits`: `npm test` | 17/17 pass: TAP-02 official vectors (SHA-256 pinned), builder and arithmetic blocks, random circuits, Daily Cap all 2^24 vectors, Two of Three all 2^19, Payee Guard block-exhaustive + 4M random, Breaker all state/input pairs, stuck-at fault coverage (no redundant gate). `npm run typecheck` clean. |
| `contracts`: `forge test` (offline) | 53 pass, 0 fail (the fork suite is skipped without a fork). Includes 2 fuzz tests (cap never exceeded over a random day; quantisation never under-reports) and a solvency fuzz test. |
| `contracts`: fork suite (`--fork-url xlayer`) | 4/4 pass against X Layer mainnet state (block ~75.82M). |

## Verified on the X Layer fork (real TapeOut contracts, nothing broadcast)

- The facts in `script/XLayer.sol`: processor proxy code hash `0x57aa306f…`, beacon `0xf70d1ed4…` →
  implementation `0x977f2178…`, factory lists OrderGuard, USDT0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`
  has symbol `USD₮0` and 6 decimals.
- OrderGuard's transistor contract (`0x8e71FC45…`) sells **both** NAND (id 0) and LATCH (id 1) at
  0.0001 OKB each plus 0.00066 OKB per `mint` call; `tapeout` costs 0.0013 OKB and burns exactly one
  transistor per NAND and per LATCH record.
- All four fuses tape out; ids read from `TapedOut` match the return value; `circuitInfo` and the stored
  netlist hash match the build.
- The real `eval`/`step` agree with the TypeScript simulator on every spec vector, including LATCH
  semantics. (TAP-02 had compared its text with BNB Smart Chain only; this is evidence that X Layer's
  processors behave the same for these circuits.)
- End to end: allowed payment passes; scam payment blocked with nothing moved; Breaker latches on the real
  processor and blocks the good supplier until the owner resets; agent freeze; daily cap; 2-of-3 approvals
  with replay refused; designer claims the USDT0 earned from all 8 decisions; registry stays solvent.
- An implementation change at TapeOut's beacon (mocked) makes every fuse fail closed and charges nothing.
- Gas per fuse and per decision: see ARCHITECTURE.md §8.

## Not verified / known gaps

- No mainnet transaction of any kind. Contracts are unaudited.
- OKX Agentic Wallet as the agent key: not tested; it must be able to send a contract call
  (`pay`) on X Layer with ~3M gas limit.
- BEM-priced processors (factory processors created after Nov 8) were not exercised; we use OrderGuard.
- The factory's own implementation slot reads `0x336e9f0f…`, not the `0x74956236…` TAP-10 lists (the
  factory was upgraded after Sep 27, likely the BEM pricing change). The circuit beacon implementation is
  unchanged. Both must be re-read before deploying; the deploy script refuses if the beacon moved.
- Gas figures were measured on a fork; the live chain may differ slightly.
- `tapeout.net` showing our circuits / listing them on its circuit market: not checked.
- `delisting` only stops new installs; there is no designer-side kill switch for a buggy fuse, by design.

## Open questions for you

1. **Processor.** Tape out on OrderGuard (someone else's OKB-priced processor, works today, verified) or
   create a "Fusebox" processor (0.1 BEM via the factory, transistors priced in BEM, own branding)?
2. **Blocked attempts pay the designer.** Implemented and documented; confirm this is the product call.
3. **Protocol share**: 10% to a Fusebox treasury, capped at 20%. Keep, change, or 0% for the hackathon?
4. **Fee levels** for our four fuses (tests use 0.0005 to 0.002 USDT0 per decision).
5. **Registry admin**: which address (ideally a multisig) attests processor implementations?
6. **Fifth fuse, release-after-delivery**: who attests delivery (payee signature, oracle, the agent
   counterparty)? It needs a new socket; I held it back rather than guess.
7. Agents and approvers can `freeze` (never unfreeze). Keep?

## What needs real OKB later (estimate)

Prices read from the chain on 2026-11-13; gas at ~0.02 gwei.

| Item | Quantity | OKB |
|---|---|---|
| NAND transistors (OrderGuard) | 243 × 0.0001 | 0.0243 |
| LATCH transistor | 1 × 0.0001 | 0.0001 |
| Transistor mint protocol fee | 2 calls × 0.00066 | 0.00132 |
| Tape-out fee | 4 × 0.0013 | 0.0052 |
| Gas: deploy registry + factory | ~6.2M gas | ~0.00013 |
| Gas: mint + tape-out + list | ~2.7M gas | ~0.00006 |
| Gas: demo wallet + config + ~10 decisions | ~15M gas | ~0.0003 |
| **Total** | | **~0.0314** |

Suggest holding **0.05 OKB** for retries and a second wallet. The rehearsal on the local fork spent
0.030946 OKB for transistors, tape-out and listing, gas included. The demo also needs a few USDT0: about
1 USDT0 of fee balance and ~5 USDT0 of payments to an address we control (designer fees come back to the
designer address, minus the protocol share).

## Next steps

1. Your answers to the open questions; then the real deployment (needs your explicit go-ahead).
2. Frontend design on canvas for approval: marketplace, wallet "fusebox" view with live Decision feed and
   "fuse blew" moments, designer earnings.
3. Agent integration: a small SDK/MCP tool that calls `check` then `pay`, and an OKX Agentic Wallet test.
4. Release-after-delivery socket once the attestation source is decided.
5. External review of the contracts before any real value beyond the demo.
