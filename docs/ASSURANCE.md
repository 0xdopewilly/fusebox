# How the contracts are checked

Fusebox makes a handful of promises about money. The circuits are proved on every input
([ARCHITECTURE.md §4](ARCHITECTURE.md)). This page covers everything around them:
- the contracts: `FuseboxWallet`, `FuseRegistry` and `FuseboxSetup`;
- the off-chain parts: the web app, the SDK and the MCP server;
- the admin key and the keys on the build machine.

There has been no third-party audit yet. What follows is what stands in for one today, and how to rerun every
part of it.

## The promises

Each promise is an invariant in [`contracts/test/invariant/WalletInvariants.t.sol`](../contracts/test/invariant/WalletInvariants.t.sol).
It must hold after every call of every random sequence.

| The wallet promises | Invariant |
|---|---|
| It decides every payment exactly as the fuses' rules say, charges exactly the right fee, and reverts exactly when it should. Its stored state (each slot's fuse, settings and accepted fee, each cap's spend, each breaker's latch, the owner, the agents, the pause) always matches the model | `wallet_matches_the_spec` |
| No more than its cap leaves through any cap in a UTC day (the highest the cap was set to since its count last reset) | `daily_cap_is_never_exceeded` |
| Only saved payees are paid, and one still cooling off gets no more than the trial amount | `only_saved_payees_get_paid` |
| A blown breaker, or any freeze, stops every payment until the owner unfreezes or unpauses | `breaker_and_freeze_stop_everything` |
| Above the threshold, two of the three seated approvers signed this exact payment, and their approvals were still valid | `big_payments_need_two_approvals` |
| The same payment (token, payee, amount) inside the window goes out again only when the owner clears it, once | `no_repeat_without_clearance` |
| If TapeOut runs an implementation nobody attested, nothing is paid and nothing is charged | `untrusted_processor_fails_closed` |
| Only an agent that is switched on can pay. Only seated approvers approve. Only the current owner changes settings or moves funds (not the former owner, not the pending one). Only the circuit owner claims or reprices. Nobody withdraws another account's fees or takes the wallet without a handover | `nobody_exceeds_their_role` |
| Every token that left, USD₮0 or native OKB, went through an allowed payment or the owner's own transfer | `money_is_conserved` |
| A decision never costs more than the fees the owner accepted, whatever the designer sets | `fees_never_exceed_what_was_accepted` |
| The registry holds every token it owes, and its books add up | `registry_is_solvent` |
| Every recorded decision is either allowed or blocked, and none is lost | `decisions_add_up` |

## How they are tested

**One wallet, every role.** A handler drives a `FuseboxWallet` that starts with all five shipped fuses.
Their real netlists run on a Solidity TAP-02 processor, so the circuits in the test are the circuits on
mainnet. The handler plays:
- two agents (the owner switches them on and off) paying saved payees, fresh payees, strangers and a scammer,
  sometimes in native OKB;
- the owner. They change every setting and remove or reinstall fuses, duplicates included, up to the limit of
  8. They switch what a fuse measures (unit, or native OKB instead of USD₮0), save and remove payees, pause,
  unfreeze, clear repeats, reseat approvers, move funds, drain or top up fees, and hand the wallet to a second
  owner and back;
- three approver seats and a former approver, approving and revoking;
- the designer repricing and claiming;
- TapeOut upgrading its processor to code nobody attested, and back;
- an attacker, a hijacked agent and the approvers trying 19 things they must not be able to do;
- the clock.

**A separate model.** Alongside the wallet, the handler keeps its own model, one entry per installed slot.
It's written from the socket definitions rather than copied from the wallet's code. Before every payment the
model predicts allowed, blocked or reverted, and the exact fee. The real wallet must agree every time, and
after every call its stored state must match the model's.

**Two kinds of run.**
- *Random campaign:* Foundry calls the handler in random order, 256 runs × 256 calls for each of the 12
  invariants (786,432 calls). The paths random calls rarely line up are added as scenarios: two approvals
  then the payment; the same approved payment again after the repeat window; the same invoice twice; a
  repeat the owner cleared.
- *Long walks:* 8 fixed seeds × 600 steps, with every promise checked after every step. The test also fails
  if any path was never exercised, so a green run can't mean "never got there". The latest run made 725
  decisions:
  - 116 allowed and 609 blocked;
  - 1,443 attempts that reverted as predicted (paused 477, decision budget 216, blocked budget 229, fee balance
    147, wallet balance 43, agent switched off 270, no fuses 61);
  - 27 approved big payments, 4 cleared repeats and 191 decisions blocked by an untrusted processor;
  - 25 freezes, 103 fuses removed, 92 installed and 96 caps re-measured;
  - 6 native OKB payments, 6 payments by the second agent and 14 ownership handovers.

  Each fuse was the only one to say no at least once: daily cap 78 times, payee guard 16, breaker 55, two of
  three 69, repeat guard 8.

## Does it catch real bugs?

A green suite only means something if it goes red when the code is wrong.
[`mutation.py`](../contracts/test/invariant/mutation.py) plants one realistic bug at a time and reruns the
long walks:

| Planted bug | Caught by |
|---|---|
| The breaker forgets a stranger when the payment was blocked | the wallet allowed a payment the spec blocks |
| The registry ignores the fee the owner accepted | the fee differs from the spec |
| Approvals are not used up after a payment | the wallet decided a payment the spec says must revert |
| The day's spending is not recorded | the wallet decided a payment the spec says must revert |
| An untrusted processor is still asked | the fee differs from the spec |
| The decision budget is off by one | the wallet decided a payment the spec says must revert |
| A repeat clearance is not used up | the wallet allowed a payment the spec blocks |
| Anyone can clear a repeat | an attack succeeded |
| A payee's age is counted in minutes, not hours | the wallet allowed a payment the spec blocks |
| A remeasured cap keeps its old count | a slot counts a different spend today |
| Removing a fuse swaps the last one into its place | a slot holds another fuse |
| A switched-off agent can still pay | the agents differ from the model |
| Ownership changes hands in one step | the owner differs from the model |
| A fee withdrawal skips the balance check | an attack succeeded |

All 14 are caught. The first version of the suite missed the third one. A reused approval only shows up when
the same payment comes again after the Repeat Guard's window but before the approval expires, so in random
runs the Repeat Guard hid it. The suite now plays that exact scenario.

## Off-chain: the web app, the SDK and the MCP server

A separate review read every API route, the server code behind them, the SDK and the MCP server. No server
holds a private key: "Try to scam it" and "Rob the agent" only run a read-only `check()`, and the assistant
only proposes payments, which the browser signs. What it found, and what changed:

| Finding | Fix |
|---|---|
| Medium: anyone watching the chain could redeem a buyer's x402 payment first. The proof was only the transaction and nonce, and both are public | The proof now carries the paying agent's signature over the nonce and transaction (`x402.proofMessage`). Sellers, the SDK's `requirePayment` and the hosted facilitator check that it recovers to the Decision's `agent`. The facilitator keeps its own used-payment record per payee. Tested on a fork: an unsigned proof, one signed by another key and a facilitator settle are all refused; the real buyer redeems once |
| Medium: anyone could register push alerts to any https URL, and the sweeps were open | Subscriptions go only to the browsers' own push services (Google, Mozilla, Microsoft, Apple). Only an address that holds an approver seat can subscribe, on up to 5 devices. Sends time out. Both sweeps need the workflows' `CRON_SECRET` and refuse without one in production. The push sweep reads the seats once and stops within its time budget |
| Medium: AI cost caps were per instance only, and guardrails had none | Each feature (Rob, the assistant, guardrails) has a daily budget shared by every instance through the store, on top of its own hourly and daily caps. Per-visitor limits count an IPv6 /64 as one visitor |
| Medium: `fusebox_fetch` paid whatever a remote server asked | It pays at most 0.10 USD₮0 per call unless the model sets `max_price`. It fetches public hosts only (no localhost, private or link-local addresses) and refuses redirects. The fuses decide first, then the price limit |
| Low: the RPC proxy was open to anyone | 240 requests a minute per visitor; `eth_getLogs` limited to 5,000 blocks or a block hash; refused when a browser marks the request as coming from another site |
| Low: listing metadata reads weren't bounded | A hard 16 KB streamed read, https to public hosts only (every live listing uses an on-chain `data:` URI anyway) |
| Low: no security headers | Every page has a Content Security Policy (scripts and styles from the site only; no framing, plugins or outside forms), plus `nosniff`, `X-Frame-Options`, a referrer policy, HSTS and a permissions policy. 40 page loads, desktop and phone: 0 violations |
| Low: approval alerts could be repeated by respelling the amount | Amounts are normalised, a request is announced at most once an hour, and a wallet can ask 10 times an hour |
| Low: the approve page accepted any payee and amount from a link | It warns when no agent of that wallet has tried that exact payment |
| Note: event history read from a third-party RPC was cached for good | Logs from a third-party RPC are checked against their transaction receipts on another RPC before they're kept, so a source can't invent a decision. It could still leave one out; balances and settings come from contract calls, not logs |

Two suggestions weren't taken:
- *`fusebox_pay` should check before sending.* It sends on purpose. When an AI agent has been tricked, a refused
  attempt recorded on-chain trips the Breaker and alerts the owner; a quiet check would hide it. The daily
  decision budget bounds what refused attempts cost.
- *An approval alert should require a refused on-chain decision.* The SDK checks before paying, so a payment
  held for approval never reaches the chain. Requiring one would break the approval flow.

The dependency audits (`pnpm audit --prod` in `web/`, `npm audit --omit=dev` in `sdk/` and `mcp/`) find no
known vulnerabilities.

The setup wizard also stops a wallet with no amount limit. Only the Daily Cap and Two of Three measure how
much goes to every payee, so with neither on, a saved payee could be sent the whole balance. The wizard now
refuses that, and the owner console warns about any wallet in that state and before removing its last
amount limit.

## The admin key and the keys here

**Registry admin.** Both registries answer to a 2-of-2 Safe multisig,
[`0xCd2fd44A9f78e0fA45F3051494Fa79E49bD7F73d`](https://www.oklink.com/xlayer/address/0xCd2fd44A9f78e0fA45F3051494Fa79E49bD7F73d) (Safe 1.4.1). Its owners are the
deployer and the project owner's own wallet, so the deployer key on the build machine can't change trust settings
or the protocol fee by itself. The admin role never touches anyone's funds or fee balances.

[`contracts/script/registry-to-safe.sh`](../contracts/script/registry-to-safe.sh) made the move on 2026-11-21. It
created the Safe at threshold 1 with the deployer as an owner, handed both registries over, accepted them from the
Safe, then raised the threshold to 2.
- *Rehearsed first on a mainnet fork:* the deployer's direct call was refused; a single signature through the
  Safe was refused (`GS020`); both owners without approval were refused (`GS025`); an action the second owner
  approved and the deployer executed went through.
- *Checked on mainnet afterwards:* both registries are owned by the Safe with no handover pending, the
  threshold is 2, and the deployer's direct admin call reverts.

Later admin actions are signed in the Safe app, which supports X Layer (`xlayer:0xCd2fd44A9f78e0fA45F3051494Fa79E49bD7F73d`). An example is attesting
a new TapeOut implementation. Both owner keys must stay recoverable; a third owner can be added with both
signatures.

**Keys on the build machine.** No key, mnemonic or `.env` file has ever been committed (the whole git history
was scanned), and the key files are readable by their owner only. The plain-text backups of the hackathon
wallets were made on request; encrypting them is the owner's call.

## Static analysis

- **`forge lint`:** no findings in `src/`. Two rules are switched off in `foundry.toml`, each with its reason
  written there: bit-mask shifts, and timestamps used at hour and day resolution.
- **Slither 0.11.6** (102 detectors): 37 results. None is a defect. The contracts are deployed and verified
  on Sourcify, so the source is changed only for a real bug, never to quiet a tool.

| Finding | Count | Verdict |
|---|---|---|
| `arbitrary-send-eth` in `pay` (High) | 1 | By design: paying an address is the wallet's job. Only an agent can call it, only in a token the owner enabled, and only when every fuse outputs 1. Native OKB reads as a saturated amount to fuses set up for USD₮0, so it can't pass them (the invariant suite checks this). |
| `incorrect-equality` | 3 | Comparisons of UTC day numbers (`spentDay == today`), not of balances. |
| `uninitialized-local` | 6 | Counters and caches that start at zero on purpose. `lastProcessor` starts empty, and no installed fuse can have a zero processor, because the registry refuses unknown fuses. |
| `unused-return` in `FuseboxSetup` | 2 | `addFuse`'s slot index isn't needed. `deposit` returns the amount received, which for USD₮0 is the amount sent. |
| `missing-zero-check` | 2 | `transferOwnership(0)` cancels a pending handover; nobody can accept as address zero. `execute` is the owner's own call. |
| `calls-loop` | 6 | Bounded loops: at most 8 fuses, with the trust check cached per processor, or the setup caller's own list. The callee is Fusebox's own registry. |
| `reentrancy-events` in `FuseboxSetup` | 1 | Event order only. The setup contract keeps no state and holds nothing between calls. The calls go to the wallet it just created, the factory, the registry and the caller's chosen token. |
| `timestamp` | 7 | Hours and UTC days, far coarser than any sequencer drift. |
| Informational (assembly, low-level calls, complexity, naming) | 9 | The bounded `staticcall` and return decoding are deliberate (see the threat model in [ARCHITECTURE.md §7](ARCHITECTURE.md)). |

## Run it

```sh
cd contracts
forge test --match-contract WalletInvariants        # the 12 invariants and the long walks (~3 min)
forge test --match-test test_long_walks -vv         # the walks, with their coverage numbers
python3 test/invariant/mutation.py                  # the 14 planted bugs (~6 min)
slither . --filter-paths lib/ --exclude-dependencies
```
