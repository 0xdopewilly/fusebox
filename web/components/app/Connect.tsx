"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { gsap } from "@/lib/gsap";
import { useWallet } from "./WalletProvider";
import { short } from "@/lib/hooks";

export default function Connect() {
  const { wallets, account, connect, disconnect, connecting, error } = useWallet();
  const [open, setOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open && pop.current) gsap.fromTo(pop.current, { y: -8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, ease: "snap" }); }, [open]);
  useEffect(() => { const f = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".connect")) setOpen(false); }; document.addEventListener("click", f); return () => document.removeEventListener("click", f); }, []);
  return (
    <div className="connect m">
      <button className={`btn ${account ? "" : "lime"} cbtn`} onClick={() => setOpen(!open)} data-cursor={account ? "Account" : "Connect"}>
        {account ? <><span className="live" />{short(account)}</> : connecting ? "Connecting…" : "Connect"}
      </button>
      {open && (
        <div className="pop" ref={pop}>
          {account ? (
            <>
              <Link href="/app/mine" onClick={() => setOpen(false)}>My wallets</Link>
              <Link href="/app/new" onClick={() => setOpen(false)}>Wire up a new wallet</Link>
              <button onClick={() => { navigator.clipboard?.writeText(account); setOpen(false); }}>Copy address</button>
              <button onClick={() => { disconnect(); setOpen(false); }}>Disconnect</button>
            </>
          ) : wallets.length ? (
            wallets.map((w) => (
              <button key={w.info.rdns} onClick={async () => { await connect(w.info.rdns); setOpen(false); }}>
                {w.info.icon ? <img src={w.info.icon} alt="" width={18} height={18} /> : <span className="wdot" />}{w.info.name}
              </button>
            ))
          ) : (
            <div className="none">No wallet found in this browser. <a href="https://web3.okx.com/download" target="_blank" rel="noreferrer">Get OKX Wallet ↗</a></div>
          )}
          {error && <div className="cerr">{error}</div>}
        </div>
      )}
    </div>
  );
}
