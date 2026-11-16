"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { gsap } from "@/lib/gsap";
import { useWallet } from "./WalletProvider";
import ConnectChoices from "./ConnectChoices";
import { short } from "@/lib/hooks";

export default function Connect() {
  const { account, disconnect, connecting, error } = useWallet();
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
              <Link href="/app/approve" onClick={() => setOpen(false)}>Approvals</Link>
              <button onClick={() => { navigator.clipboard?.writeText(account); setOpen(false); }}>Copy address</button>
              <button onClick={() => { disconnect(); setOpen(false); }}>Disconnect</button>
            </>
          ) : (
            <ConnectChoices variant="menu" cta="" onDone={() => setOpen(false)} />
          )}
          {error && <div className="cerr">{error}</div>}
        </div>
      )}
    </div>
  );
}
