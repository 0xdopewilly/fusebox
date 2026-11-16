/** Phones have no browser extension, so a wallet lives in its app. These links open the current page inside a wallet's
 *  built-in browser, where the wallet is injected and Fusebox connects like it does on desktop. Formats from each
 *  wallet's developer docs (OKX App Universal Link, MetaMask deeplinks, Trust Wallet deeplinking, Bitget BKConnect). */
export interface AppLink { id: string; name: string; href: (url: string) => string }

export const APP_LINKS: AppLink[] = [
  { id: "okx", name: "OKX Wallet", href: (u) => `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(u)}` },
  { id: "metamask", name: "MetaMask", href: (u) => `https://metamask.app.link/dapp/${u.replace(/^https?:\/\//, "")}` },
  { id: "trust", name: "Trust Wallet", href: (u) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(u)}` },
  { id: "bitget", name: "Bitget Wallet", href: (u) => `https://bkcode.vip?action=dapp&url=${encodeURIComponent(u)}` },
];

export const OKX_DOWNLOAD = "https://web3.okx.com/download";

/** A phone or tablet browser (iPadOS reports itself as a Mac with touch). */
export function isMobileUA(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** The name an injected provider goes by, for wallets that don't announce themselves through EIP-6963. */
export function legacyName(p: Record<string, unknown>): { name: string; rdns: string } {
  if (p.isOkxWallet || p.isOKExWallet) return { name: "OKX Wallet", rdns: "legacy:okx" };
  if (p.isBitKeep || p.isBitgetWallet) return { name: "Bitget Wallet", rdns: "legacy:bitget" };
  if (p.isTrust || p.isTrustWallet) return { name: "Trust Wallet", rdns: "legacy:trust" };
  if (p.isCoinbaseWallet) return { name: "Coinbase Wallet", rdns: "legacy:coinbase" };
  if (p.isBinance) return { name: "Binance Wallet", rdns: "legacy:binance" };
  if (p.isRabby) return { name: "Rabby", rdns: "legacy:rabby" };
  if (p.isMetaMask) return { name: "MetaMask", rdns: "legacy:metamask" };
  return { name: "Browser wallet", rdns: "legacy:injected" };
}

/** Wallet errors arrive in many shapes (EIP-1193 code, MetaMask's nested originalError, viem's cause chain). */
export function errCode(e: unknown): number | undefined {
  const x = e as { code?: unknown; data?: { originalError?: { code?: unknown }; code?: unknown }; cause?: unknown } | undefined;
  for (const c of [x?.code, x?.data?.originalError?.code, x?.data?.code]) if (typeof c === "number") return c;
  return x?.cause ? errCode(x.cause) : undefined;
}
export const errText = (e: unknown) => String((e as { shortMessage?: string })?.shortMessage ?? (e as Error)?.message ?? e ?? "");

/** One plain sentence for a failed connect or chain switch. */
export function friendlyError(e: unknown): string {
  const c = errCode(e), m = errText(e);
  if (c === 4001 || /user (rejected|denied|cancel)|rejected the request|request rejected|cancell?ed by user/i.test(m)) return "You declined the request in your wallet.";
  if (c === -32002 || /already pending|request.*pending/i.test(m)) return "Your wallet already has a request open. Open the wallet, finish or cancel it, then try again.";
  if (c === 4100) return "Your wallet is locked or hasn't approved this site yet. Unlock it and try again.";
  return m.split("\n")[0].slice(0, 160) || "Couldn't connect. Try again.";
}
