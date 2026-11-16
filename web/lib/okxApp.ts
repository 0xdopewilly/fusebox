"use client";
/** OKX Connect: a browser with no wallet (any phone browser, or a desktop without the extension) pairs with the OKX
 *  Wallet app over OKX's relay. Desktop shows the pairing link as a QR; phones hand off to the app. The SDK loads
 *  only when someone picks this route, or when they paired before (it restores the saved session). */
import { toHex, type EIP1193Provider } from "viem";
import { pub } from "./client-chain";

type Universal = import("@okxconnect/universal-provider").OKXUniversalProvider;
const CHAIN = "eip155:196";
// Signing and account methods go to the OKX app; plain reads go to Fusebox's own RPC like every other read.
const WALLET = new Set(["eth_requestAccounts", "eth_accounts", "eth_sendTransaction", "eth_signTransaction", "eth_sign", "personal_sign", "eth_signTypedData", "eth_signTypedData_v4", "wallet_watchAsset"]);

/** The pairing request as links: `universal` (https, for the QR and iPhones) and `deep` (the app's own scheme, which
 *  Android hands straight to the app). */
export interface PairLinks { universal: string; deep: string | null }
let inst: Promise<Universal> | null = null;
let onLinks: ((l: PairLinks) => void) | null = null;
let wrapped: EIP1193Provider | null = null;
let appLinks: PairLinks | null = null;
let teardown: Promise<unknown> = Promise.resolve();
const settle = (p: Promise<unknown>, ms: number) => Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
// methods that wait on a tap in the OKX app
const NEEDS_TAP = new Set(["eth_sendTransaction", "eth_signTransaction", "eth_sign", "personal_sign", "eth_signTypedData", "eth_signTypedData_v4"]);
let onPending: ((open: PairLinks | null) => void) | null = null;
/** Told when a request waits on the OKX app (with links that open it), and when it's answered (null). */
export const onOkxPending = (f: typeof onPending) => { onPending = f; };

function universal(): Promise<Universal> {
  inst ??= import("@okxconnect/universal-provider")
    .then(async ({ OKXUniversalProvider }) => {
      const u = await OKXUniversalProvider.init({ dappMetaData: { name: "Fusebox", icon: `${location.origin}/icon-192.png` } });
      const { getOKXLink, ConnectWalletType } = await import("@okxconnect/core");
      const base = getOKXLink(undefined as unknown as Parameters<typeof getOKXLink>[0], ConnectWalletType.OKX_APP_COMMON);
      appLinks = { universal: base.universalLink, deep: base.deepLink ?? null };
      u.on("okx_engine_connect_params", (info: { connectRequest?: unknown }) => {
        if (!info?.connectRequest) return;
        const l = getOKXLink(info.connectRequest as Parameters<typeof getOKXLink>[0], ConnectWalletType.OKX_APP_COMMON);
        onLinks?.({ universal: l.universalLink, deep: l.deepLink ?? null });
      });
      return u;
    })
    .catch((e) => { inst = null; throw e; });
  return inst;
}

type Session = { namespaces?: Record<string, { accounts?: string[] }> } | undefined;
const accountsOf = (s: Session) => [...new Set((s?.namespaces?.eip155?.accounts ?? []).map((a) => a.split(":").pop()!).filter(Boolean))];

/** The OKX session as an EIP-1193 provider, pinned to X Layer (the session is only ever opened for chain 196). */
function wrap(u: Universal): EIP1193Provider {
  if (wrapped) return wrapped;
  const subs = new Map<string, Set<(x: unknown) => void>>();
  const emit = (ev: string, x: unknown) => subs.get(ev)?.forEach((f) => f(x));
  u.on("session_update", (s: Session) => emit("accountsChanged", accountsOf(s)));
  u.on("session_delete", () => emit("accountsChanged", []));
  wrapped = {
    async request({ method, params }: { method: string; params?: unknown }) {
      if (method === "eth_chainId") return toHex(196);
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
      if (method === "eth_accounts" || method === "eth_requestAccounts") return accountsOf(u.session as Session);
      if (NEEDS_TAP.has(method)) {
        // The SDK's own app switch is off (see okxAppConnect), so say where to tap and give the way to the app.
        onPending?.(appLinks);
        try { return await u.request({ method, params: params as unknown[] }, CHAIN); } finally { onPending?.(null); }
      }
      if (WALLET.has(method)) return u.request({ method, params: params as unknown[] }, CHAIN);
      return pub.request({ method, params } as never);
    },
    on(ev: string, f: (x: unknown) => void) { if (!subs.has(ev)) subs.set(ev, new Set()); subs.get(ev)!.add(f); },
    removeListener(ev: string, f: (x: unknown) => void) { subs.get(ev)?.delete(f); },
  } as unknown as EIP1193Provider;
  return wrapped;
}

/** Pair with the OKX Wallet app. `links` receives the pairing request: desktop renders it as a QR, a phone shows it as
 *  the tap that opens the app. The SDK's own auto-open is off: browsers block an app switch that no tap started, and on
 *  iPhones it would replace this page with OKX's when the app is missing. */
export async function okxAppConnect(links: (l: PairLinks) => void): Promise<EIP1193Provider> {
  const u = await universal();
  onLinks = links;
  try {
    // a cancelled pairing's socket has to be closed before the next one opens, or its late close takes the new one down
    await teardown;
    if (!u.connected()) {
      await u.connect({
        namespaces: { eip155: { chains: [CHAIN], defaultChain: "196", rpcMap: { 196: "https://rpc.xlayer.tech" } } },
        sessionConfig: { redirect: "none", openUniversalUrl: false },
      } as Parameters<Universal["connect"]>[0]);
    }
  } finally { if (onLinks === links) onLinks = null; }
  if (!accountsOf(u.session as Session).length) throw new Error("OKX Wallet didn't share an X Layer account.");
  return wrap(u);
}

/** The session saved by an earlier pairing, if it is still live. */
export async function okxAppRestore(): Promise<EIP1193Provider | null> {
  const u = await universal();
  return u.connected() && accountsOf(u.session as Session).length ? wrap(u) : null;
}

/** Drop a pairing nobody approved: close its relay socket (the SDK would keep re-sending the request otherwise). */
export function okxAppAbort() {
  if (!inst) return;
  teardown = inst.then((u) => (u.connected() ? undefined : settle(u.getEngine().connectManagerDisconnect(), 3000))).catch(() => {});
}

export async function okxAppDisconnect() {
  if (!inst) return;
  // the SDK's disconnect waits on the app's ack for up to a day; the session is cleared locally either way
  try { await settle((await inst).disconnect(), 3000); } catch { /* already gone */ }
}
