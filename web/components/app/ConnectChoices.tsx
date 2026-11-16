"use client";
import { useEffect, useRef, useState } from "react";
import { OKX_APP, useWallet } from "./WalletProvider";
import { APP_LINKS, OKX_DOWNLOAD } from "@/lib/walletLinks";

/** Every way to connect, wherever Fusebox asks for a wallet:
 *  - wallets injected in this browser (extensions on desktop, or a wallet app's own browser on a phone);
 *  - the OKX Wallet app over OKX Connect (a QR on desktop, a hand-off to the app on a phone), unless OKX is injected;
 *  - on a phone with nothing injected, links that reopen this page inside a wallet's built-in browser.
 *  `menu` renders plain rows for the app bar's popover, `sheet` full-width buttons for the phone panel. */
export default function ConnectChoices({ variant = "row", cta = "Connect", onDone }: { variant?: "row" | "menu" | "sheet"; cta?: string; onDone?: () => void }) {
  const { wallets, mobile, hasOkx, connect, error } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // wallets announce within a moment of load; don't flash "no wallet" before they have had the chance
  const [settled, setSettled] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSettled(true), 600); return () => clearTimeout(t); }, []);

  const go = async (rdns: string) => {
    setBusy(rdns);
    try { await connect(rdns); } finally { setBusy(null); onDone?.(); }
  };
  const label = (name: string) => (cta ? `${cta} ${name}` : name);
  const cls = (primary: boolean) => (variant === "menu" ? undefined : `btn${primary ? " lime" : ""}`);

  // okx:// does nothing visible when the app is missing, so offer the download if the page is still in front.
  const openIn = (id: string, href: (u: string) => string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.href = href(location.href);
    if (id !== "okx") return;
    setMissed(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (document.visibilityState === "visible") setMissed(true); }, 1800);
  };

  return (
    <div className={`cc cc-${variant}`}>
      <div className="cc-list">
        {wallets.map((w) => (
          <button key={w.info.rdns} className={cls(true)} onClick={() => go(w.info.rdns)} data-cursor="Connect">
            {w.info.icon ? <img src={w.info.icon} alt="" width={18} height={18} /> : variant === "menu" ? <span className="wdot" /> : null}
            {busy === w.info.rdns ? "Connecting…" : label(w.info.name)}
          </button>
        ))}
        {!hasOkx && (
          <button className={cls(!wallets.length)} onClick={() => go(OKX_APP)} data-cursor="Connect">
            {variant === "menu" && <span className="wdot" />}
            {busy === OKX_APP ? "Waiting for OKX Wallet…" : mobile ? label("OKX Wallet app") : "Scan with OKX Wallet app"}
          </button>
        )}
      </div>
      {settled && mobile && !wallets.length && (
        <div className="cc-open">
          <span className="m mute">Or open Fusebox inside your wallet&apos;s browser</span>
          <div className="cc-chips">
            {APP_LINKS.map((l) => <a key={l.id} className="cc-chip m" href={l.href(location.href)} onClick={openIn(l.id, l.href)}>{l.name} <span aria-hidden="true">↗</span></a>)}
          </div>
          {missed && <p className="cc-hint">OKX Wallet didn&apos;t open. <a className="lime" href={OKX_DOWNLOAD} target="_blank" rel="noreferrer">Get OKX Wallet ↗</a></p>}
        </div>
      )}
      {settled && !mobile && !wallets.length && <p className="cc-get">No wallet extension in this browser. Scan with the app, or <a className="lime" href={OKX_DOWNLOAD} target="_blank" rel="noreferrer">get OKX Wallet ↗</a> and reload.</p>}
      {variant === "row" && error && <p className="cc-err m" role="alert">{error}</p>}
    </div>
  );
}
