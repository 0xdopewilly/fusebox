"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BaseError, ContractFunctionRevertedError, createWalletClient, custom, getAddress, toHex, type Address, type EIP1193Provider, type Hash, type Hex } from "viem";
import { XLAYER, pub } from "@/lib/client-chain";

interface Info { uuid: string; name: string; icon: string; rdns: string }
interface Detail { info: Info; provider: EIP1193Provider }
type WriteArgs = Parameters<ReturnType<typeof createWalletClient>["writeContract"]>[0];
interface Ctx {
  wallets: Detail[]; account: Address | null; chainId: number | null; connecting: boolean; error: string | null;
  connect: (rdns: string) => Promise<void>; disconnect: () => void; write: (a: Omit<WriteArgs, "account" | "chain">) => Promise<Hash>;
  /** personal_sign a plain-text message with the connected account (free: no transaction) */
  sign: (message: string) => Promise<Hex>;
}
const C = createContext<Ctx | null>(null);
export const useWallet = () => { const c = useContext(C); if (!c) throw new Error("WalletProvider missing"); return c; };
const KEY = "fusebox:wallet";

/** Browser wallets via EIP-6963 (OKX Wallet first), switched onto X Layer, with silent reconnect. */
export default function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Detail[]>([]);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<EIP1193Provider | null>(null);

  useEffect(() => {
    const seen = new Map<string, Detail>();
    const add = (d: Detail) => { if (!d?.info?.rdns || seen.has(d.info.rdns)) return; seen.set(d.info.rdns, d); setWallets([...seen.values()].sort((a, b) => Number(b.info.rdns.includes("okx")) - Number(a.info.rdns.includes("okx")))); };
    const onAnnounce = (e: Event) => add((e as CustomEvent<Detail>).detail);
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const w = window as unknown as { okxwallet?: EIP1193Provider; ethereum?: EIP1193Provider };
    const t = setTimeout(() => {
      if (!seen.size && w.okxwallet) add({ info: { uuid: "okx", name: "OKX Wallet", icon: "", rdns: "com.okex.wallet" }, provider: w.okxwallet });
      if (!seen.size && w.ethereum) add({ info: { uuid: "injected", name: "Browser wallet", icon: "", rdns: "injected" }, provider: w.ethereum });
    }, 400);
    return () => { window.removeEventListener("eip6963:announceProvider", onAnnounce); clearTimeout(t); };
  }, []);

  const attach = useCallback(async (p: EIP1193Provider, prompt: boolean) => {
    const accts = (await p.request({ method: prompt ? "eth_requestAccounts" : "eth_accounts" })) as string[];
    if (!accts?.length) return false;
    active.current = p;
    setAccount(getAddress(accts[0]));
    setChainId(parseInt((await p.request({ method: "eth_chainId" })) as string, 16));
    const onAcc = (a: unknown) => { const l = a as string[]; setAccount(l?.length ? getAddress(l[0]) : null); };
    const onChain = (c: unknown) => setChainId(parseInt(c as string, 16));
    p.on?.("accountsChanged", onAcc); p.on?.("chainChanged", onChain);
    return true;
  }, []);

  // silent reconnect to the last wallet used
  useEffect(() => {
    let saved: string | null = null; try { saved = localStorage.getItem(KEY); } catch {}
    const d = wallets.find((x) => x.info.rdns === saved);
    if (d && !account) attach(d.provider, false).catch(() => {});
  }, [wallets, account, attach]);

  const ensureChain = useCallback(async () => {
    const p = active.current!;
    if (parseInt((await p.request({ method: "eth_chainId" })) as string, 16) === 196) return;
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xc4" }] });
    } catch (e) {
      if ((e as { code?: number }).code !== 4902 && !String((e as Error).message).includes("Unrecognized")) throw e;
      await p.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0xc4", chainName: "X Layer Mainnet", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, rpcUrls: ["https://rpc.xlayer.tech"], blockExplorerUrls: ["https://www.oklink.com/xlayer"] }] });
    }
    setChainId(196);
  }, []);

  const connect = useCallback(async (rdns: string) => {
    const d = wallets.find((x) => x.info.rdns === rdns); if (!d) return;
    setConnecting(true); setError(null);
    try {
      if (await attach(d.provider, true)) { try { localStorage.setItem(KEY, rdns); } catch {} await ensureChain(); }
    } catch (e) { setError((e as Error).message?.split("\n")[0] ?? "Couldn't connect."); } finally { setConnecting(false); }
  }, [wallets, attach, ensureChain]);

  const disconnect = useCallback(() => { setAccount(null); active.current = null; try { localStorage.removeItem(KEY); } catch {} }, []);

  const write = useCallback(async (a: Omit<WriteArgs, "account" | "chain">) => {
    if (!active.current || !account) throw new Error("Connect a wallet first.");
    await ensureChain();
    // Dry-run first, so a doomed call fails here with the contract's reason instead of costing gas.
    // A revert must repeat 1.5 s later to count: a node one block behind can miss the previous step's effect.
    for (let i = 0; i < 2; i++) {
      try { await pub.simulateContract({ ...(a as WriteArgs), account } as Parameters<typeof pub.simulateContract>[0]); break; }
      catch (e) {
        const reverted = e instanceof BaseError && !!e.walk((x) => x instanceof ContractFunctionRevertedError);
        if (!reverted) break; // RPC trouble: let the wallet estimate as usual
        if (i === 1) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    const wc = createWalletClient({ chain: XLAYER, transport: custom(active.current) });
    return wc.writeContract({ ...(a as WriteArgs), account, chain: XLAYER });
  }, [account, ensureChain]);

  const sign = useCallback(async (message: string) => {
    const p = active.current;
    if (!p || !account) throw new Error("Connect a wallet first.");
    return (await p.request({ method: "personal_sign", params: [toHex(message), account] })) as Hex;
  }, [account]);
  const value = useMemo(() => ({ wallets, account, chainId, connecting, error, connect, disconnect, write, sign }), [wallets, account, chainId, connecting, error, connect, disconnect, write, sign]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
