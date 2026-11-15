import "server-only";
import { createPublicClient, fallback, http, type Address } from "viem";
import { xLayer } from "viem/chains";
import fork from "./deployments/fork.json";
import mainnet from "./deployments/mainnet.json";

export interface Deployment {
  chainId: number; tag: string; fromBlock: number; block: number;
  registry: Address; factory: Address; processor: Address; circuitIds: number[]; fuseIds: number[];
  atlas: Address; owner: Address; agent: Address; supplier: Address; approvers: Address[]; usdt0: Address;
}

/** Which Fusebox deployment the app reads: X Layer mainnet, or the local fork rehearsal with FUSEBOX_DEPLOYMENT=fork. */
export const DEPLOYMENT: Deployment = (process.env.FUSEBOX_DEPLOYMENT === "fork" ? fork : mainnet) as Deployment;
export const IS_FORK = DEPLOYMENT.tag === "fork";
export const RPC = process.env.FUSEBOX_RPC || (IS_FORK ? "http://127.0.0.1:8547" : "https://rpc.xlayer.tech");

/** X Layer's public RPCs intermittently answer with a CDN error page, so reads fall back across three of them. */
export const RPCS = IS_FORK || process.env.FUSEBOX_RPC ? [RPC] : ["https://rpc.xlayer.tech", "https://tapeout.net/rpc-xlayer", "https://xlayer.drpc.org"];
export const client = createPublicClient({
  chain: { ...xLayer, rpcUrls: { default: { http: [RPC] } } },
  transport: fallback(RPCS.map((u) => http(u, { timeout: 10_000, retryCount: 1 })), { retryCount: 1 }),
  batch: { multicall: true },
});
