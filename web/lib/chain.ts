import "server-only";
import { createPublicClient, http, type Address } from "viem";
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

export const client = createPublicClient({
  chain: { ...xLayer, rpcUrls: { default: { http: [RPC] } } },
  transport: http(RPC, { timeout: 12_000, retryCount: 2 }),
  batch: { multicall: true },
});
