# Repeat Guard and Fusebox v2

**Status: live on X Layer mainnet since 2026-11-20.** v2 and v1 run side by side:

| | v2 (new wallets, the fuse market) | v1 (Atlas and the first wallets) |
|---|---|---|
| FuseRegistry | `0x2583928546a614A2fD993B5C106ED9aD0E781AB6` | `0x852a278322667BB86A2665a38CbC5Bfd551B20d7` |
| FuseboxFactory | `0xdFc9b1d715efB2bCDAd8f848A5E3b4e2c243EE9B` | `0x192C099a18ed42612b6e74f243f8dF1EE0E3E7a5` |
| Fuses | 1–4 (circuits #15–18) and 5, the Repeat Guard (circuit #21) | 1–4 (circuits #15–18) |

Both v2 contracts are verified on Sourcify (exact match). v1 is unchanged; its sources are tagged `v1-mainnet`.
The deploy was 11 transactions from the v1 deployer in blocks 76386997–76387028 and cost **0.002402 OKB**: 0.00216
in TapeOut fees (2 NAND, one mint fee, one tape-out) and 0.000242 in gas. Registry created in
`0xeb96a33a20c92bd8469a654a3cb3d11d345fef9a4912900e505fa50cc8deaa16`, factory in
`0x862f75a03e60348e98784ef13ada220b7167b90f3e438bff901a3fe6e81ad5ad`, the Repeat Guard taped out in
`0x529349fc34385b3a958a6d6bb2cdb7aeb43b1cc46747ba85b1e2d1383f94c185` and listed in
`0x06a70ac1de2df3a4a35275afb32d4297f929179a3281514a07943dfcef753249`.

## The gap it closes

Fuses check facts, not memos. So the same invoice sent twice looks exactly like a normal payment, and v1 pays it
twice. Since 2026-11-21, *Try to scam it* and *Rob the agent* run on Atlas's v2 wallet
(`0x6292Ea57a1d50c74A5E918CfDC4Dc1Dbf87a577c`: Atlas's limits plus the Repeat Guard, window 254 h). That wallet
really paid invoice INV-7790 ([`0xa836acd5…a7c8`](https://www.oklink.com/xlayer/tx/0xa836acd5f11dc16485fc3ad9ece43ba515a4c48b87e4b977ae62b235ea45a7c8)),
so "Same invoice, sent twice" is stopped by the Repeat Guard alone. The trick always replays the wallet's latest
real payment to the supplier.

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

Measured on a fork: 0.002295 OKB including gas. On mainnet it cost 0.002402, because gas was 0.04 gwei that day
rather than 0.02.

## In the app

- New wallets come from the v2 factory, and the wizard offers the Repeat Guard with a window in hours. It's on in
  the invoice, procurement and refund starters, and off for an agent that pays per call (the same price to the
  same seller is a repeat).
- Every wallet page reads the wallet's own registry, so v1 wallets (Atlas) and v2 wallets both work. A v1 wallet
  can install fuses 1–4 only, and says so.
- The fuse market is v2's registry. Fuses 1–4 add up their decisions and earnings from both registries (Atlas runs
  on v1), and designers claim from both.
- Owner console, Safety tab: **Repeats** lists the payments still inside the window, each with "Let it pay once
  more" (`clearRepeat`) or "Withdraw", plus a form for any payee and amount.
- The simulator, pre-flight (`context.samePaymentHoursAgo`, `context.repeatCleared`), Fuse Studio (socket 5) and
  the assistant all know the Repeat Guard. The agent's OKB check reserves 3.5M gas for five fuses.
- The SDK's `ADDRESSES.registry`/`factory` are now v2 (`registryV1`/`factoryV1` for v1), and x402 sellers accept
  wallets from either factory.

## First v2 wallet on mainnet

On Nov 20, 2026 the first v2 wallet was wired up through the live app's wizard, with all five fuses:
[`0x6292Ea57a1d50c74A5E918CfDC4Dc1Dbf87a577c`](https://fusebox-xlayer.vercel.app/app/w/0x6292Ea57a1d50c74A5E918CfDC4Dc1Dbf87a577c)
(12 owner transactions). Its agent then sent the same invoice twice, 0.002 USDT0 to the same saved payee:

| # | Result | Transaction |
|---|---|---|
| 1 | Paid: all five fuses passed | [`0xa158b8cc…d1cf`](https://www.oklink.com/xlayer/tx/0xa158b8cce251e548ef0e87d95fda8dcbf7d40c953aabd69af261c8223ad9d1cf) |
| 2 | Stopped by the Repeat Guard; the other four passed, and nothing moved | [`0x502bd9f3…22ad`](https://www.oklink.com/xlayer/tx/0x502bd9f3fe577c7a74f0c43696003559f95d2cff3929f45a5e88ec678baf22ad) |

The second transaction records the decision and a `FuseBlew(2, 5)` event: TapeOut circuit #21 answered 0.

## Limits

The repeat key is (token, payee, amount), not the memo. Two different invoices for the same amount to the same
payee inside the window look alike, and the second needs the owner to clear it. Pick the window to match how often
a payee is really paid the same amount.
