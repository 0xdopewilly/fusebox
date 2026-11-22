"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { gsap } from "@/lib/gsap";
import { useWallet } from "./WalletProvider";
import ConnectChoices from "./ConnectChoices";
import AccountCard from "./AccountCard";
import { Glyph } from "./Pixel";
import { short } from "@/lib/hooks";

import { useLang } from "@/lib/i18n";

export default function Connect() {
  const { t: tr } = useLang();
  const { account, connecting, error } = useWallet();
  const [open, setOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open && pop.current) gsap.fromTo(pop.current, { y: -8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, ease: "snap" }); }, [open]);
  useEffect(() => { const f = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".connect")) setOpen(false); }; document.addEventListener("click", f); return () => document.removeEventListener("click", f); }, []);
  return (
    <div className="connect m">
      <button className={`btn ${account ? "" : "lime"} cbtn`} onClick={() => setOpen(!open)} data-cursor={account ? tr("Account", "账户") : tr("Connect", "连接")}>
        {account ? <><span className="live" />{short(account)}</> : connecting ? tr("Connecting…", "连接中…") : tr("Connect", "连接钱包")}
      </button>
      {open && (
        <div className={`pop${account ? " acct" : ""}`} ref={pop}>
          {account ? (
            <>
              <AccountCard compact />
              <nav className="pop-go" aria-label="Your wallets">
                {([["/app/assistant", "Assistant", "rob"], ["/app/mine", "My wallets", "mine"], ["/app/new", "Wire up a wallet", "new"], ["/app/approve", "Approvals", "approve"]] as const).map(([h, t, g]) => (
                  <Link key={h} href={h} onClick={() => setOpen(false)}><Glyph name={g} size={14} />{t}<span className="k" aria-hidden="true">→</span></Link>
                ))}
              </nav>
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
