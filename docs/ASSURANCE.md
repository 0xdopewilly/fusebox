# How the contracts are checked

Fusebox makes a handful of promises about money. The circuits are proved on every input
([ARCHITECTURE.md §4](ARCHITECTURE.md)); this page covers the contracts around them: `FuseboxWallet`,
`FuseRegistry` and `FuseboxSetup`. There has been no third-party audit yet. What follows is what stands in
for one today, and how to rerun every part of it.

## The promises

Each promise is an invariant in [`contracts/test/invariant/WalletInvariants.t.sol`](../contracts/test/invariant/WalletInvariants.t.sol).
It must hold after every call of every random sequence.

| The wallet promises | Invariant |
|---|---|
| It decides every payment exactly as the fuses' rules say, charges exactly the right fee, and reverts exactly when it should | `wallet_matches_the_spec` |
| No more than the daily cap leaves in a UTC day | `daily_cap_is_never_exceeded` |
| Only saved payees are paid, and one still cooling off gets no more than the trial amount | `only_saved_payees_get_paid` |
| A blown breaker, or any freeze, stops every payment until the owner unfreezes or unpauses | `breaker_and_freeze_stop_everything` |
| Above the threshold, two of the three seated approvers signed this exact payment, and their approvals were still valid | `big_payments_need_two_approvals` |
| The same payment (token, payee, amount) inside the window goes out again only when the owner clears it, once | `no_repeat_without_clearance` |
| If TapeOut runs an implementation nobody attested, nothing is paid and nothing is charged | `untrusted_processor_fails_closed` |
| The agent can only pay. Only seated approvers approve, only the owner changes settings or moves funds, only the circuit owner claims or reprices, and nobody withdraws another account's fees | `nobody_exceeds_their_role` |
| Every token that left went through an allowed payment or the owner's own transfer, and native OKB never leaves when the fuses measure USD₮0 | `money_is_conserved` |
| A decision never costs more than the fees the owner accepted, whatever the designer sets | `fees_never_exceed_what_was_accepted` |
| The registry holds every token it owes, and its books add up | `registry_is_solvent` |
| Every recorded decision is either allowed or blocked, and none is lost | `decisions_add_up` |

## How they are tested

**One wallet, every role.** A handler drives a `FuseboxWallet` with all five shipped fuses. Their real
netlists run on a Solidity TAP-02 processor, so the circuits in the test are the circuits on mainnet. The
handler plays:
- the agent paying saved payees, fresh payees, strangers and a scammer, sometimes in native OKB;
- the owner changing every setting, saving and removing payees, pausing, unfreezing, clearing repeats,
  reseating approvers, moving funds, and draining or topping up fees;
- three approver seats and a former approver, approving and revoking;
- the designer repricing and claiming;
- TapeOut upgrading its processor to code nobody attested, and back;
- an attacker, a hijacked agent and the approvers trying 19 things they must not be able to do;
- the clock.

**A separate model.** Alongside the wallet, the handler keeps its own model of what each fuse means,
written from the socket definitions rather than copied from the wallet's code. Before every payment the model
predicts allowed, blocked or reverted, and the exact fee. The real wallet must agree every time.

**Two kinds of run.**
- *Random campaign:* Foundry calls the handler in random order, 256 runs × 256 calls for each of the 12
  invariants (786,432 calls). The paths random calls rarely line up are added as scenarios: two approvals
  then the payment; the same approved payment again after the repeat window; the same invoice twice; a
  repeat the owner cleared.
- *Long walks:* 8 fixed seeds × 600 steps, with every promise checked after every step. The test also fails
  if any path was never exercised, so a green run can't mean "never got there". The latest run made 874
  decisions: 87 allowed, 787 blocked, and 1,759 attempts that reverted as predicted (paused 436, decision
  budget 456, blocked budget 699, fee balance 129, wallet balance 39). It included 23 approved big payments,
  8 cleared repeats, 134 decisions blocked by an untrusted processor and 21 freezes. Each fuse was the only
  one to say no at least once: daily cap 29 times, payee guard 7, breaker 62, two of three 41, repeat guard 19.

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
| A fee withdrawal skips the balance check | an attack succeeded |

All 10 are caught. The first version of the suite missed the third one. A reused approval only shows up when
the same payment comes again after the Repeat Guard's window but before the approval expires, so in random
runs the Repeat Guard hid it. The suite now plays that exact scenario.

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
python3 test/invariant/mutation.py                  # the 10 planted bugs (~4 min)
slither . --filter-paths lib/ --exclude-dependencies
```
