"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BaseError, ContractFunctionRevertedError, createWalletClient, custom, getAddress, toHex, type Address, type EIP1193Provider, type Hash, type Hex, type TypedDataDefinition } from "viem";
import { XLAYER, pub } from "@/lib/client-chain";
import { errCode, friendlyError, isMobileUA, legacyName } from "@/lib/walletLinks";
import { okxAppAbort, okxAppConnect, okxAppDisconnect, okxAppRestore, onOkxPending, type PairLinks } from "@/lib/okxApp";
import PairSheet, { ApproveNudge } from "./PairSheet";

interface Info { uuid: string; name: string; icon: string; rdns: string }
interface Detail { info: Info; provider: EIP1193Provider }
type WriteArgs = Parameters<ReturnType<typeof createWalletClient>["writeContract"]>[0];
interface Ctx {
  wallets: Detail[]; account: Address | null; chainId: number | null; connecting: boolean; error: string | null;
  /** a phone or tablet browser: no extensions, so wallets are reached through their apps */
  mobile: boolean;
  /** an OKX wallet is injected here (the extension, or OKX Wallet's own browser) */
  hasOkx: boolean;
  /** how the current account is connected: an injected wallet's rdns, or OKX_APP */
  via: string | null;
  /** the connected wallet's name, for display */
  walletName: string | null;
  /** pass an injected wallet's rdns, or OKX_APP to pair with the OKX Wallet app */
  connect: (rdns: string) => Promise<void>; disconnect: () => void; write: (a: Omit<WriteArgs, "account" | "chain">) => Promise<Hash>;
  /** personal_sign a plain-text message with the connected account (free: no transaction) */
  sign: (message: string) => Promise<Hex>;
  /** eth_signTypedData_v4 with the connected account, e.g. a token permit (free: no transaction) */
  signTyped: (typed: TypedDataDefinition) => Promise<Hex>;
  /** send OKB (wei) from the connected account, e.g. gas for an agent key */
  send: (to: Address, value: bigint) => Promise<Hash>;
}
const C = createContext<Ctx | null>(null);
export const useWallet = () => { const c = useContext(C); if (!c) throw new Error("WalletProvider missing"); return c; };
const KEY = "fusebox:wallet";
export const OKX_APP = "okx-app";
const ADD_XLAYER = { chainId: "0xc4", chainName: "X Layer Mainnet", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, rpcUrls: ["https://rpc.xlayer.tech"], blockExplorerUrls: ["https://www.oklink.com/xlayer"] };
/** Wallets answer eth_chainId as hex, and a few as a number or a decimal string. */
const toChain = (c: unknown) => (typeof c === "number" ? c : String(c).startsWith("0x") ? parseInt(String(c), 16) : parseInt(String(c), 10));
const save = (v: string | null) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch {} };
/** The same wallet can announce itself under a different id after a reload (EIP-6963 vs the injected fallback). */
const family = (rdns: string) => (/okx|okex/i.test(rdns) ? "okx" : rdns.replace(/^legacy:/, "").split(".").slice(-1)[0]);
/** Inside a wallet's own in-app browser (OKX Wallet's dApp browser), where a site it approved before connects without a prompt. */
const inWalletBrowser = () => typeof navigator !== "undefined" && /OKApp|OKEx/i.test(navigator.userAgent);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Browser wallets (EIP-6963 first, then any injected provider), the OKX Wallet app over OKX Connect, switched onto
 *  X Layer, with silent reconnect. */
export default function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Detail[]>([]);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [via, setVia] = useState<string | null>(null);
  const [pair, setPair] = useState<{ links: PairLinks | null } | null>(null);
  const [nudge, setNudge] = useState<PairLinks | null>(null);
  // a saved connection is being restored: the button says so, so nobody starts a second pairing over it
  const [restoring, setRestoring] = useState(false);
  const active = useRef<EIP1193Provider | null>(null);
  const detach = useRef<() => void>(() => {});
  const pairGen = useRef(0);
  const stopPair = useRef<() => void>(() => {});
  const restored = useRef(false);

  useEffect(() => { setMobile(isMobileUA()); onOkxPending(setNudge); return () => onOkxPending(null); }, []);

  useEffect(() => {
    const seen = new Map<string, Detail>();
    const publish = () => setWallets([...seen.values()].sort((a, b) => Number(/okx|okex/i.test(b.info.rdns)) - Number(/okx|okex/i.test(a.info.rdns))));
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<Detail>).detail;
      if (!d?.info?.rdns || !d.provider || seen.has(d.info.rdns)) return;
      // a wallet that announces itself replaces any guess made from window.ethereum
      for (const k of [...seen.keys()]) if (k.startsWith("legacy:")) seen.delete(k);
      seen.set(d.info.rdns, d); publish();
    };
    // Wallets that never announce (older extensions, some in-app browsers) still inject window.ethereum, sometimes late.
    const legacy = () => {
      if ([...seen.keys()].some((k) => !k.startsWith("legacy:"))) return;
      const w = window as unknown as { okxwallet?: EIP1193Provider; ethereum?: EIP1193Provider };
      const p = w.okxwallet ?? w.ethereum;
      if (!p || [...seen.values()].some((d) => d.provider === p)) return;
      const { name, rdns } = w.okxwallet ? { name: "OKX Wallet", rdns: "legacy:okx" } : legacyName(p as unknown as Record<string, unknown>);
      seen.set(rdns, { info: { uuid: rdns, name, icon: "", rdns }, provider: p }); publish();
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.addEventListener("ethereum#initialized", legacy);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const timers = [400, 1500, 4000].map((ms) => setTimeout(legacy, ms));
    return () => { window.removeEventListener("eip6963:announceProvider", onAnnounce); window.removeEventListener("ethereum#initialized", legacy); timers.forEach(clearTimeout); };
  }, []);

  const attach = useCallback(async (p: EIP1193Provider, prompt: boolean) => {
    const accts = (await p.request({ method: prompt ? "eth_requestAccounts" : "eth_accounts" })) as string[];
    if (!accts?.length) return false;
    detach.current();
    active.current = p;
    setAccount(getAddress(accts[0]));
    setChainId(toChain(await p.request({ method: "eth_chainId" })));
    const onAcc = (a: unknown) => { const l = a as string[]; setAccount(l?.length ? getAddress(l[0]) : null); };
    const onChain = (c: unknown) => setChainId(toChain(c));
    p.on?.("accountsChanged", onAcc); p.on?.("chainChanged", onChain);
    detach.current = () => { p.removeListener?.("accountsChanged", onAcc); p.removeListener?.("chainChanged", onChain); };
    return true;
  }, []);

  // silent reconnect to the last wallet used
  const restoreApp = useCallback(() => {
    if (restored.current) return;
    restored.current = true; setRestoring(true);
    okxAppRestore()
      .then(async (p) => {
        if (p === "gone") { save(null); return; } // unpaired from the app's side: nothing left to restore
        if (p && (await attach(p, false))) setVia(OKX_APP);
      })
      .catch(() => {})
      .finally(() => { restored.current = false; setRestoring(false); });
  }, [attach]);
  useEffect(() => {
    if (account) return;
    let saved: string | null = null; try { saved = localStorage.getItem(KEY); } catch {}
    if (!saved) return;
    if (saved === OKX_APP) { restoreApp(); return; }
    const d = wallets.find((x) => x.info.rdns === saved) ?? wallets.find((x) => family(x.info.rdns) === family(saved!));
    if (!d) return;
    attach(d.provider, false)
      // OKX Wallet's own browser can forget a site's permission when the tab is closed; asking again for a site it
      // approved before returns the account without a prompt
      .then((ok) => (ok || !inWalletBrowser() ? ok : attach(d.provider, true)))
      .then((ok) => { if (ok) { setVia(d.info.rdns); save(d.info.rdns); } })
      .catch(() => {});
  }, [wallets, account, attach, restoreApp]);
  // a phone page brought back from the background, or back online, gets another go at the OKX app session
  useEffect(() => {
    const again = () => {
      if (document.visibilityState !== "visible" || account) return;
      let saved: string | null = null; try { saved = localStorage.getItem(KEY); } catch {}
      if (saved === OKX_APP) restoreApp();
    };
    document.addEventListener("visibilitychange", again); window.addEventListener("online", again); window.addEventListener("pageshow", again);
    return () => { document.removeEventListener("visibilitychange", again); window.removeEventListener("online", again); window.removeEventListener("pageshow", again); };
  }, [account, restoreApp]);

  const ensureChain = useCallback(async () => {
    const p = active.current!;
    const now = async () => toChain(await p.request({ method: "eth_chainId" }));
    if ((await now()) === 196) { setChainId(196); return; }
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xc4" }] });
    } catch (e) {
      const c = errCode(e);
      if (c === 4001 || c === -32002) throw e;
      // X Layer isn't in this wallet yet (4902, or MetaMask mobile's -32603 wrapping it), or the wallet can't switch
      // by itself: adding the chain also switches to it in every major wallet.
      try { await p.request({ method: "wallet_addEthereumChain", params: [ADD_XLAYER] }); }
      catch (e2) { throw errCode(e2) === 4001 ? e2 : e; }
    }
    let id = await now();
    if (id !== 196) { // some wallets add the chain without switching to it, or report the new chain a moment late
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xc4" }] }).catch(() => {});
      for (let i = 0; i < 4 && (id = await now()) !== 196; i++) await sleep(300);
    }
    setChainId(id);
    if (id !== 196) throw new Error("Your wallet is still on another network. Switch it to X Layer (chain 196) and try again.");
  }, []);

  const connect = useCallback(async (rdns: string) => {
    setError(null);
    if (rdns === OKX_APP) {
      const gen = ++pairGen.current;
      setConnecting(true); setPair({ links: null });
      try {
        // OKX's connect only settles when the app answers, so a cancel has to end the wait from this side
        const cancelled = new Promise<null>((r) => { stopPair.current = () => r(null); });
        const p = await Promise.race([okxAppConnect((links) => { if (pairGen.current === gen) setPair({ links }); }), cancelled]);
        if (!p || pairGen.current !== gen) return; // cancelled while waiting
        if (await attach(p, false)) { setVia(OKX_APP); save(OKX_APP); }
      } catch (e) {
        if (pairGen.current === gen) setError(friendlyError(e));
      } finally {
        if (pairGen.current === gen) { setConnecting(false); setPair(null); }
      }
      return;
    }
    const d = wallets.find((x) => x.info.rdns === rdns); if (!d) return;
    setConnecting(true);
    try {
      if (await attach(d.provider, true)) { setVia(rdns); save(rdns); await ensureChain(); }
    } catch (e) { setError(friendlyError(e)); } finally { setConnecting(false); }
  }, [wallets, attach, ensureChain]);

  const cancelPair = useCallback(() => { pairGen.current++; stopPair.current(); setPair(null); setConnecting(false); okxAppAbort(); }, []);

  const disconnect = useCallback(() => {
    detach.current(); detach.current = () => {};
    if (via === OKX_APP) okxAppDisconnect();
    setAccount(null); setVia(null); setError(null); active.current = null; save(null);
  }, [via]);


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
  const signTyped = useCallback(async (typed: TypedDataDefinition) => {
    if (!active.current || !account) throw new Error("Connect a wallet first.");
    await ensureChain();
    const wc = createWalletClient({ chain: XLAYER, transport: custom(active.current) });
    return wc.signTypedData({ ...(typed as TypedDataDefinition), account } as Parameters<typeof wc.signTypedData>[0]);
  }, [account, ensureChain]);
  const send = useCallback(async (to: Address, value: bigint) => {
    if (!active.current || !account) throw new Error("Connect a wallet first.");
    await ensureChain();
    const wc = createWalletClient({ chain: XLAYER, transport: custom(active.current) });
    return wc.sendTransaction({ account, to, value, chain: XLAYER });
  }, [account, ensureChain]);
  const hasOkx = useMemo(() => wallets.some((w) => /okx|okex/i.test(w.info.rdns)), [wallets]);
  const walletName = via === OKX_APP ? "OKX Wallet app" : (wallets.find((w) => w.info.rdns === via)?.info.name ?? null);
  const value = useMemo(() => ({ wallets, account, chainId, connecting: connecting || (restoring && !account), error, mobile, hasOkx, via, walletName, connect, disconnect, write, sign, signTyped, send }), [wallets, account, chainId, connecting, error, mobile, hasOkx, via, walletName, connect, disconnect, write, sign, signTyped, send, restoring]);
  return <C.Provider value={value}>{children}{pair && <PairSheet links={pair.links} mobile={mobile} onCancel={cancelPair} />}{nudge && via === OKX_APP && <ApproveNudge links={nudge} mobile={mobile} />}</C.Provider>;
}
