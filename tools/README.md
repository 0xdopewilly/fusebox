# fusebox-tools

Ready-made [Fusebox](https://fusebox-xlayer.vercel.app) tools for agent frameworks: the **Vercel AI SDK**,
**LangChain** and **ElizaOS**, plus a framework-free core. Your agent spends from a Fusebox wallet on X Layer, and
every payment has to pass the wallet's **fuses**: small logic circuits taped out on [TapeOut](https://tapeout.net)
and evaluated on X Layer in the same transaction. One no, and nothing moves. However convincing the prompt.

```bash
npm install fusebox-tools viem zod
```

## Vercel AI SDK

```ts
import { fuseboxTools } from "fusebox-tools/ai";
const { text } = await generateText({ model, tools: fuseboxTools(), stopWhen: stepCountIs(5),
  prompt: "Pay Kano Cotton's invoice INV-7801: 0.05 USDT0 to 0x69dB89385E8a69278a49335C432d0c70ec86A6C4" });
```

## LangChain / LangGraph

```ts
import { fuseboxLangchainTools } from "fusebox-tools/langchain";
const agent = createReactAgent({ llm, tools: fuseboxLangchainTools() });
await agent.invoke({ messages: [{ role: "user", content: "How much is left in the Fusebox wallet?" }] });
```

## ElizaOS

```ts
import { fuseboxPlugin } from "fusebox-tools/eliza";
export const character = { name: "Ledger", plugins: [fuseboxPlugin],
  settings: { secrets: { FUSEBOX_WALLET: "0xYourFuseboxWallet", FUSEBOX_AGENT_KEY: process.env.FUSEBOX_AGENT_KEY } } };
```

Actions `FUSEBOX_CHECK`, `FUSEBOX_PAY`, `FUSEBOX_STATUS`, `FUSEBOX_FETCH`, and a `FUSEBOX_WALLET` provider that puts
the balance, fees and any blown fuse in the agent's context. Fields come out of the message with the agent's
`OBJECT_SMALL` model (an address or URL it made up is ignored), with a plain-text fallback.

## Anything else (core)

```ts
import { createFuseboxToolset } from "fusebox-tools";
const { tools } = createFuseboxToolset();          // [{ name, description, schema (zod), run(input) }, …]
const r = await tools[0].run({ to: "0x69dB89385E8a69278a49335C432d0c70ec86A6C4", amount: "0.05" }); // r.summary, r.data
```

## The tools

| Tool | What it does |
| --- | --- |
| `fusebox_check` | Dry-runs a USDT0 payment against every fuse, with each fuse's reason. Free; nothing moves. |
| `fusebox_pay` | Pays in USDT0 through the fuses (needs the agent key). Checks first and won't send what the fuses would refuse. |
| `fusebox_status` | Balance, prepaid fee balance, each fuse and whether it's blown, today's spend, decision counts. |
| `fusebox_fetch` | Calls a URL that may charge per call (x402). A Fusebox offer is paid only if every fuse allows the price, then the call is retried with the proof. Returns the status, up to 4 KB of the body and what was paid. |

Each returns `{ summary, data }`: one sentence for the model to read, and the details.

## Options

| Option | Env / Eliza setting | Default |
| --- | --- | --- |
| `wallet` | `FUSEBOX_WALLET` | Atlas, the public demo wallet |
| `agentKey` | `FUSEBOX_AGENT_KEY` | none: read-only (check, status, fetch prices) |
| `rpc` | `FUSEBOX_RPC` | `https://rpc.xlayer.tech` |
| `api` | `FUSEBOX_API` | `https://fusebox-xlayer.vercel.app` (approval links) |
| `maxPrice` | `FUSEBOX_MAX_PRICE` | none: only the fuses cap what `fusebox_fetch` pays |

## Safety

- The agent key can only ask the wallet to pay; the owner's fuses decide. Leaking it can't move more than they allow.
- A payment the fuses refuse costs nothing here (it's checked first and not sent). Sent anyway, it would still be
  recorded, cost fees and could blow the Breaker, which stops every payment until the owner resets it.
- When Two of Three needs approvers, the tools return an approval link. It's for a human: the agent can't sign it.
- `fusebox_fetch` lets the model call any http(s) URL. On a server, give it its own network policy or set
  `maxPrice` and keep it away from internal addresses.

MIT · [Docs](https://fusebox-xlayer.vercel.app/docs) · built on [fusebox-sdk](https://www.npmjs.com/package/fusebox-sdk)
