"use client";
import { createPublicClient, defineChain, http } from "viem";
import mainnet from "./deployments/mainnet.json";
import fork from "./deployments/fork.json";

/** The deployment the browser talks to (NEXT_PUBLIC_FUSEBOX_DEPLOYMENT=fork for local rehearsals). */
export const DEP = (process.env.NEXT_PUBLIC_FUSEBOX_DEPLOYMENT === "fork" ? fork : mainnet) as typeof mainnet;
export const BROWSER_RPC = process.env.NEXT_PUBLIC_FUSEBOX_RPC || (DEP.tag === "fork" ? "http://127.0.0.1:8547" : "https://rpc.xlayer.tech");
export const XLAYER = defineChain({
  id: 196, name: "X Layer", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [BROWSER_RPC] } }, blockExplorers: { default: { name: "OKLink", url: "https://www.oklink.com/xlayer" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});
export const pub = createPublicClient({ chain: XLAYER, transport: http(BROWSER_RPC), batch: { multicall: true } });
