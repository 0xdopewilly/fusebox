# Repeat Guard and Fusebox v2

**Status: built and tested on a mainnet fork. Not deployed.** Mainnet Fusebox (registry `0x852a…20d7`, factory
`0x192C…E3E7a5`, Atlas and every wallet made so far) is v1 and is unchanged. The v1 sources are tagged `v1-mainnet`.

## The gap it closes

Fuses check facts, not memos. So the same invoice sent twice looks exactly like a normal payment, and v1 pays it
twice. *Try to scam it* shows this on purpose.

## How it works

A new socket, `REPEAT_GUARD` (5), with two input bits that the wallet works out itself:

| Pin | Meaning |
|---|---|
| `repeat` | an allowed payment with the same token, payee and amount went out within the install's window |
| `cleared` | the owner cleared this exact repeat: one-shot, and it expires with the approval TTL |

The shipped circuit is `allow iff not repeat or cleared`, which is two NAND gates (`NAND(repeat, NOT cleared)`).
Its parameter `a` is the window in hours (1 to 254). It takes no token and no unit, because a repeat is the
exact (token, payee, amount).

Wallet changes (`FuseboxWallet.sol`):
- `lastPaidAt[repeatKey]` records the time of every allowed payment. A stopped payment is not recorded.
- `clearRepeat(token, to, amount, clear)` is owner-only. It lets the next payment of exactly that amount through
  once, and the clearance is used up by that payment.
- `repeatKey(token, to, amount)` and `repeatClearedUntil` are public, for apps.

## Why v2 needs a new registry, and why it's the last time

The v1 registry has the four socket pinouts compiled in, so it can't list a fifth. In v2 the registry stores socket
pinouts as data. It defines sockets 1 to 5 at deploy, and the admin may add new ones later but never change one, so
every listing stays valid. A future socket needs new wallet code (a new factory), never another registry, so the
fuse market stays in one place.

## Tests

- Circuits: all 4 input vectors, and every gate stuck at 0 and at 1 (`circuits/test/fuses.test.ts`).
- Contracts: 14 unit tests in `contracts/test/RepeatGuard.t.sol`. They cover paid once, the window,
  clearing once, expiry and withdrawal, owner only, the parameters, designer fees and append-only sockets.
- Real TapeOut processor on a mainnet fork (`test/fork/XLayerFork.t.sol`): the circuit is taped out, matches every
  spec vector and stops the duplicate. A payment through all five fuses costs about 1.35M gas.
- End to end on a fork: `script/dev/rehearse-v2.sh`. It deploys v2, makes a wallet with all five fuses and sends
  invoice 7793 twice. The supplier is paid once, the owner clears a real repeat, it goes through, and the
  clearance is used up.

## Deploying it

`contracts/script/DeployV2.s.sol` does it all in one broadcast from the v1 deployer, which owns circuits #15–18:
1. It deploys the v2 registry and factory.
2. It re-lists the four v1 circuits with their v1 fees and metadata, so they keep fuse ids 1 to 4.
3. It mints 2 NAND transistors, then tapes out and lists the Repeat Guard as fuse 5.

Measured on a fork: **0.002295 OKB including gas** (0.00216 in TapeOut fees). Fees and gas can move. The
script prints the cost and refuses to run if the balance is short.

The app reads v1 today, so v2 also needs app support, which ships with the deploy:
- the v2 registry and factory in the deployment config
- the new socket's copy, the simulator, pre-flight, Studio and the owner's "clear this repeat" action
- an agent gas reserve of about 3.5M for five fuses
