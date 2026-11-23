"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { powerOn, powerOff, usePresence } from "@/lib/motion";
import { useWallet } from "./WalletProvider";
import ConnectChoices from "./ConnectChoices";
import AccountCard from "./AccountCard";
import { Glyph } from "./Pixel";
import { short } from "@/lib/hooks";

import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";

export default function Connect() {
  const { t: tr, zh } = useLang();
  const { account, connecting, error } = useWallet();
  const [open, setOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  // the panel powers on like a circuit (lib/motion): wire, unroll, scan, rows sliding in, link names decoding from bits
  const rowsOf = (el: HTMLElement) => el.querySelectorAll(":scope > .kc > *, :scope > .pop-go > a, :scope .cc-list > *, :scope .cc > :not(.cc-list), :scope > .cerr");
  const shown = usePresence(open, pop,
    (el) => powerOn(el, { rows: rowsOf(el), decode: el.querySelectorAll(".pw-t") }),
    (el, done) => powerOff(el, done, { rows: rowsOf(el) }));
  useEffect(() => {
    const f = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".connect")) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", f); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("click", f); document.removeEventListener("keydown", k); };
  }, []);
  return (
    <div className="connect m">
      <button className={`btn ${account ? "" : "lime"} cbtn`} onClick={() => setOpen(!open)} aria-expanded={open} data-cursor={account ? tr("Account", "账户") : tr("Connect", "连接")}>
        {account ? <><span className="live" />{short(account)}</> : connecting ? tr("Connecting…", "连接中…") : tr("Connect", "连接钱包")}
      </button>
      {shown && (
        <div className={`pop${account ? " acct" : ""}`} ref={pop}>
          <i className="pw-wire" aria-hidden="true" /><i className="pw-scan" aria-hidden="true" />
          {account ? (
            <>
              <AccountCard compact />
              <nav className="pop-go" aria-label={tr("Your wallets", "你的钱包")}>
                {([["/app/assistant", tr("Assistant", "助手"), "rob"], ["/app/mine", tr("My wallets", "我的钱包"), "mine"], ["/app/new", tr("Wire up a wallet", "搭建钱包"), "new"], ["/app/approve", tr("Approvals", "审批"), "approve"]] as const).map(([h, t, g]) => (
                  <Link key={h} href={h} onClick={() => setOpen(false)}><Glyph name={g} size={14} /><span className="pw-t" key={t} data-t={t}>{t}</span><span className="k" aria-hidden="true">→</span></Link>
                ))}
              </nav>
            </>
          ) : (
            <ConnectChoices variant="menu" cta="" onDone={() => setOpen(false)} />
          )}
          {error && <div className="cerr">{zh ? errZh(error) : error}</div>}
        </div>
      )}
    </div>
  );
}
