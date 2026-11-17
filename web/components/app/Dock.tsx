"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { gsap, reduced } from "@/lib/gsap";
import { useBlock, short } from "@/lib/hooks";
import { useWallet } from "./WalletProvider";
import ConnectChoices from "./ConnectChoices";
import AccountCard from "./AccountCard";
import { Glyph, type GlyphName } from "./Pixel";

/** Phones only: a fuse strip in the thumb zone. Each section is a cartridge whose filament lights when you're on it;
 *  the fifth key opens the panel (wallet, every other page, network). Desktop keeps the top bar. */
const TABS = [["/app", "Wallet"], ["/app/try", "Try"], ["/app/market", "Market"], ["/app/designers", "Sell"]] as const;
const GO: readonly [string, string, GlyphName][] = [
  ["/app/assistant", "Assistant", "rob"],
  ["/app/mine", "My wallets", "mine"],
  ["/app/new", "Wire up a wallet", "new"],
  ["/app/approve", "Approvals", "approve"],
  ["/app/studio", "Fuse Studio", "studio"],
  ["/app/simulate", "Line simulator", "sim"],
  ["/app/rob", "Rob the agent", "rob"],
  ["/app/x402", "Pay per call", "x402"],
];
const MORE = [["/app/status", "Status"], ["/docs", "Docs"], ["/onchain", "DeWEB edition"], ["/", "Fusebox home"]] as const;

export const openPanel = () => window.dispatchEvent(new Event("fusebox:panel"));

function Cartridge({ on }: { on: boolean }) {
  return (
    <svg width="34" height="16" viewBox="0 0 34 16" aria-hidden="true" className="cart">
      <rect x="0.5" y="2.5" width="6" height="11" className="cap" />
      <rect x="27.5" y="2.5" width="6" height="11" className="cap" />
      <rect x="6.5" y="4.5" width="21" height="7" className="glass" />
      <path d="M6.5 8h4l1.5-2.6 2.2 5.2 2.2-5.2 2.2 5.2 1.5-2.6h4.4" className={`fil${on ? " on" : ""}`} />
    </svg>
  );
}

export default function Dock() {
  const path = usePathname() || "/app";
  const { account, connecting, error } = useWallet();
  const block = useBlock();
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const active = (h: string) => (h === "/app" ? path === "/app" || path.startsWith("/app/w/") : path.startsWith(h) || (h === "/app/market" && path.startsWith("/app/fuse/")) || (h === "/app/try" && (path.startsWith("/app/simulate") || path.startsWith("/app/rob"))) || (h === "/app/designers" && path.startsWith("/app/studio")));

  const close = useCallback(() => {
    if (!sheet.current || reduced()) { setOpen(false); return; }
    gsap.to(sheet.current, { yPercent: 100, duration: 0.35, ease: "power3.in" });
    gsap.to(shade.current, { autoAlpha: 0, duration: 0.3, onComplete: () => setOpen(false) });
  }, []);
  useEffect(() => { const f = () => setOpen(true); window.addEventListener("fusebox:panel", f); return () => window.removeEventListener("fusebox:panel", f); }, []);
  // the counts on the tiles: wallets this account owns and approvals waiting on it, read each time the panel opens
  const [counts, setCounts] = useState<{ wallets?: number; waiting?: number }>({});
  useEffect(() => {
    if (!open || !account) { setCounts({}); return; }
    let live = true;
    fetch(`/api/fleet?owner=${account}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (live && Array.isArray(j.wallets)) setCounts((c) => ({ ...c, wallets: j.wallets.length })); }).catch(() => {});
    fetch(`/api/approvals?approver=${account}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (live && Array.isArray(j.open)) setCounts((c) => ({ ...c, waiting: j.open.length })); }).catch(() => {});
    return () => { live = false; };
  }, [open, account]);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add("panel-open");
    if (!reduced() && sheet.current) {
      gsap.fromTo(shade.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 });
      gsap.fromTo(sheet.current, { yPercent: 100 }, { yPercent: 0, duration: 0.55, ease: "expo.out" });
      gsap.from(sheet.current.querySelectorAll(".kc-card, .kc-acts, .pl-acct, .pl-lbl, .pl-tile, .pl-more"), { y: 18, autoAlpha: 0, duration: 0.45, stagger: 0.035, delay: 0.12, ease: "power3.out" });
    }
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => { document.documentElement.classList.remove("panel-open"); window.removeEventListener("keydown", esc); };
  }, [open, close]);

  // drag the grab bar down to dismiss
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { drag.current = { y: e.clientY, dy: 0 }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { if (!drag.current || !sheet.current) return; drag.current.dy = Math.max(0, e.clientY - drag.current.y); sheet.current.style.transform = `translateY(${drag.current.dy}px)`; };
  const onUp = () => { if (!drag.current || !sheet.current) return; const far = drag.current.dy > 90; drag.current = null; if (far) close(); else gsap.to(sheet.current, { y: 0, duration: 0.3, clearProps: "transform" }); };

  return (
    <>
      <nav className="dock m" aria-label="App sections">
        {TABS.map(([h, label]) => (
          <Link key={h} href={h} className={`dk${active(h) ? " on" : ""}`} aria-current={active(h) ? "page" : undefined}>
            <Cartridge on={active(h)} /><span>{label}</span>
          </Link>
        ))}
        <button className={`dk more${open ? " on" : ""}`} onClick={() => (open ? close() : setOpen(true))} aria-expanded={open} aria-label="Open the panel">
          <svg width="34" height="16" viewBox="0 0 34 16" aria-hidden="true" className="cart"><rect x="10.5" y="1.5" width="13" height="13" className="glass" /><path d="M13 5.5h8M13 8h8M13 10.5h5" className="fil on" /></svg>
          <span>{account ? short(account).slice(0, 6) : "Panel"}</span>
          {account && <i className="dot-on" />}
        </button>
      </nav>

      {open && (
        <div className="pl-shade" ref={shade} onClick={close}>
          <div className="pl-sheet" ref={sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Fusebox panel">
            <div className="pl-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}><i /></div>
            {account ? <AccountCard /> : (
              <>
                <div className="pl-head m"><span className="lime">Fusebox panel</span><span className="mute"><span className="live" />Block {block ? block.toLocaleString("en-US") : "…"} · chain 196</span></div>
                <div className="pl-acct">
                  <div className="who"><span className="m mute">{connecting ? "Connecting…" : "Connect a wallet"}</span><b>To own wallets, approve and sell fuses</b></div>
                  <div className="wl"><ConnectChoices variant="sheet" cta="" /></div>
                </div>
              </>
            )}
            {error && <p className="m pl-err" role="alert">{error}</p>}
            <div className="pl-lbl m"><span>Go to</span><span>{String(GO.length).padStart(2, "0")}</span></div>
            <nav className="pl-grid" aria-label="Fusebox pages">
              {GO.map(([h, t, g]) => (
                <Link key={h} href={h} className={`pl-tile${path.startsWith(h) ? " on" : ""}`} aria-current={path.startsWith(h) ? "page" : undefined} onClick={close}>
                  <Glyph name={g} size={18} /><b>{t}</b>
                  {h === "/app/mine" && counts.wallets != null && <span className="cnt m">{counts.wallets}</span>}
                  {h === "/app/approve" && !!counts.waiting && <span className="cnt m lime">{counts.waiting} waiting</span>}
                </Link>
              ))}
            </nav>
            <div className="pl-more m">{MORE.map(([h, t]) => <Link key={h} href={h} onClick={close}>{t}</Link>)}</div>
          </div>
        </div>
      )}
    </>
  );
}
