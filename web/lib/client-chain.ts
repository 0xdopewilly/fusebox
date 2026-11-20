"use client";
import { createPublicClient, defineChain, http } from "viem";
import mainnet from "./deployments/mainnet.json";
import fork from "./deployments/fork.json";
import { versionsOf } from "./versions";

/** The deployment the browser talks to (NEXT_PUBLIC_FUSEBOX_DEPLOYMENT=fork for local rehearsals). */
export const DEP = (process.env.NEXT_PUBLIC_FUSEBOX_DEPLOYMENT === "fork" ? fork : mainnet) as typeof mainnet;
export const { V1, V2, VERSIONS, CURRENT, versionOf, isBuiltIn } = versionsOf(DEP);
/** Browser reads go through our own /api/rpc (read-only methods, server-side fallback across X Layer RPCs). */
export const BROWSER_RPC = process.env.NEXT_PUBLIC_FUSEBOX_RPC || (DEP.tag === "fork" ? "http://127.0.0.1:8547" : "/api/rpc");
export const XLAYER = defineChain({
  id: 196, name: "X Layer", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [BROWSER_RPC] } }, blockExplorers: { default: { name: "OKLink", url: "https://www.oklink.com/xlayer" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});
export const pub = createPublicClient({ chain: XLAYER, transport: http(BROWSER_RPC, { retryCount: 2 }), batch: { multicall: true }, pollingInterval: 2_000 });
