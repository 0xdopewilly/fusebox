# Fusebox

**Your agent pays. Circuits decide.**

Fusebox wires an AI agent's wallet through small logic circuits taped out on [TapeOut](https://tapeout.net) on X Layer. A payment reaches the payee only if every fuse on the line holds, and every fuse that checks a payment pays its designer, the no's included.

- **Live site:** https://fusebox-xlayer.vercel.app
- **Live app:** https://fusebox-xlayer.vercel.app/app (Atlas, a real agent wallet on X Layer mainnet)
- **For agents:** `claude mcp add fusebox -- npx -y fusebox-mcp` ([npm](https://www.npmjs.com/package/fusebox-mcp))
- **Try to scam it:** https://fusebox-xlayer.vercel.app/app/try. Write the payment an agent might be tricked into; the app runs Atlas's real `check()` on X Layer. It's free, needs no wallet, and nothing moves.

## Live on X Layer mainnet (chain 196)

| What | Address / id |
|---|---|
| TapeOut processor (OrderGuard) | [`0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355`](https://www.oklink.com/xlayer/address/0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355) |
| Circuits | **#15** Daily Cap · **#16** Payee Guard · **#17** Breaker · **#18** Two of Three |
| FuseRegistry | [`0x852a278322667BB86A2665a38CbC5Bfd551B20d7`](https://www.oklink.com/xlayer/address/0x852a278322667BB86A2665a38CbC5Bfd551B20d7) |
| FuseboxFactory | [`0x192C099a18ed42612b6e74f243f8dF1EE0E3E7a5`](https://www.oklink.com/xlayer/address/0x192C099a18ed42612b6e74f243f8dF1EE0E3E7a5) |
| Atlas (demo wallet) | [`0x0Db0457715a6445D8a65F820d717a6B39Be66800`](https://www.oklink.com/xlayer/address/0x0Db0457715a6445D8a65F820d717a6B39Be66800) |
| Fees | USDT0 [`0x779Ded0c9e1022225f8E0630b35a9b54bE713736`](https://www.oklink.com/xlayer/address/0x779Ded0c9e1022225f8E0630b35a9b54bE713736) |

Every address is in [`deployments/xlayer-mainnet.json`](deployments/xlayer-mainnet.json).

## The four fuses

| Fuse | Circuit | What it does | Fee / check |
|---|---|---|---|
| Daily Cap | 24 inputs · 108 NAND | No more than the owner's cap in a UTC day, however the agent is asked. | 0.001 USDT0 |
| Payee Guard | 33 inputs · 79 NAND | Saved payees only; a new payee gets a small trial amount until its cooling-off ends. | 0.001 USDT0 |
| Breaker | 4 inputs · 10 NAND + 1 LATCH | Trips on a payment to a stranger and stays blown until the owner resets it. | 0.0005 USDT0 |
| Two of Three | 19 inputs · 46 NAND | Above a threshold, two of three approvers must sign that exact payment. | 0.002 USDT0 |

## How a payment works

1. **The agent asks to pay.** It sends the payee, the amount and a one-line memo. That's all it gets to say, and the fuses never read the memo.
2. **Every fuse checks it on X Layer, in the same call.** `FuseboxWallet.pay()` builds each fuse's inputs from the wallet's own state, then calls `eval` (or `step` for latches) on TapeOut's processor.
3. **One no stops the payment.** The decision is recorded either way, along with which fuse blew. The Breaker's latch state lives in the wallet.
4. **Designers are paid.** `FuseRegistry.charge()` takes each fuse's fee from the wallet's prepaid USDT0 balance. 90% goes to whoever owns the circuit NFT, and the protocol keeps 10% (capped at 20%).

## Built on TapeOut

- **Every fuse is a TapeOut circuit.** Circuits #15–18 live on TapeOut's OrderGuard processor, and every payment calls the processor's `eval` or `step` on X Layer.
- **TAP-02 toolchain.** [`circuits/`](circuits) builds, encodes and simulates TAP-02 netlists, and its tests pass TapeOut's official test vectors.
- **Netlist integrity in the app.** The [fuse market](https://fusebox-xlayer.vercel.app/app/market) reads each fuse's netlist straight from its TapeOut processor and checks it against the hash the registry pinned when the fuse was listed. Fuses without a hand-drawn schematic get their real wiring drawn from those bytes.
- **DeWEB and TapeKit.** [`deweb/`](deweb) is a version of Fusebox meant to be stored on X Layer in circuit #15's container and opened through TapeKit at `15-2-272.tapekit.org`. It has no off-chain references, and your browser reads every number, including a live "scam Atlas" `check()`, from X Layer.
  - The publish was rehearsed on a mainnet fork: the container was opened, all 7 chunks stored and the name bound, and the SHA-256 read back from the chain matched.
  - The mainnet publish waits on TapeOut's one-time 0.08 OKB container fee. Until then, the same file is previewed at [/onchain](https://fusebox-xlayer.vercel.app/onchain).

## Repository

| Folder | What's in it |
|---|---|
| [`circuits/`](circuits) | The TAP-02 netlist toolchain (builder, encoder, simulator) and the four fuses, with exhaustive tests. |
| [`contracts/`](contracts) | `FuseRegistry`, `FuseboxWallet` and `FuseboxFactory` (Foundry), the unit and fuzz tests, the X Layer fork tests, and the launch scripts. |
| [`mcp/`](mcp) | [`fusebox-mcp`](https://www.npmjs.com/package/fusebox-mcp): `fusebox_check`, `fusebox_pay` and `fusebox_status` for any MCP agent (`npx -y fusebox-mcp`). |
| [`web/`](web) | The site and app (Next.js, GSAP, three.js, viem). They read X Layer mainnet directly. |
| [`deweb/`](deweb) | The DeWEB edition: one self-contained page with no backend, built for circuit #15's container (`15.2.272.tape`, served by TapeKit), plus a resumable publisher. |
| [`deployments/`](deployments) | Deployed addresses. |
| [`docs/`](docs) | [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) (sockets, circuits, fee flow, threat model, gas), [`STATUS.md`](docs/STATUS.md) and [`tapeout-ecosystem-research.md`](docs/tapeout-ecosystem-research.md). |
| [`design/`](design) | Design directions and the landing mock. |

## Run it

```bash
# circuits: build the netlists and run the exhaustive tests
cd circuits && npm ci && npm test

# contracts: unit, fuzz and X Layer mainnet-fork tests
cd contracts && forge test && forge test --match-path test/fork/XLayerFork.t.sol --fork-url https://rpc.xlayer.tech

# rehearse the whole launch on a local fork of X Layer mainnet (no keys or funds needed beyond a local .env)
anvil --fork-url https://rpc.xlayer.tech --port 8547 --chain-id 196 --auto-impersonate &
RPC=http://127.0.0.1:8547 contracts/script/launch.sh

# web: reads X Layer mainnet by default
cd web && pnpm install && pnpm dev   # http://localhost:3120
```

X Layer's public RPCs cap `eth_getLogs` ranges (100 blocks on rpc.xlayer.tech, 1,000 on tapeout.net). The app therefore reads event history from a small block index ([`web/lib/deployments/mainnet-index.json`](web/lib/deployments/mainnet-index.json)) and scans forward from there. Refresh the index with `node web/scripts/index-logs.mjs`.

## Status

The contracts are deployed and working on X Layer mainnet, but they are unaudited. Atlas is a public demo wallet with small balances.

## License

MIT
