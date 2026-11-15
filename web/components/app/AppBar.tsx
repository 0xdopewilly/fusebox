"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { gsap } from "@/lib/gsap";
import { useBlock } from "@/lib/hooks";
import Digits from "@/components/fx/Digits";
import { Logo } from "@/components/landing/Header";
import Connect from "./Connect";
import { openPanel } from "./Dock";
import { useWallet } from "./WalletProvider";
import { short } from "@/lib/hooks";

const TABS = [["/app", "Wallet", "Wallet"], ["/app/try", "Try to scam it", "Try"], ["/app/market", "Fuse market", "Market"], ["/app/designers", "Designers", "Sell"]] as const;

export default function AppBar() {
  const path = usePathname();
  const block = useBlock();
  const nav = useRef<HTMLElement>(null);
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => { fetch("/api/atlas").then((r) => r.json()).then((j) => setSource(j.source ?? null)).catch(() => {}); }, []);
  useEffect(() => {
    const el = nav.current!; const on = el.querySelector<HTMLElement>("a.on"); const ink = el.querySelector<HTMLElement>(".ink")!;
    if (on) gsap.to(ink, { left: on.offsetLeft + 16, width: on.offsetWidth - 32, duration: 0.6, ease: "snap", autoAlpha: 1 });
    else gsap.to(ink, { autoAlpha: 0, duration: 0.2 });
  }, [path]);
  const active = (h: string) => (h === "/app" ? path === "/app" : path?.startsWith(h));
  const { account } = useWallet();
  // phones show the page's name in the bar; the sections live in the dock at the bottom
  const title = path === "/app" ? "Atlas" : path?.startsWith("/app/w/") ? "Wallet" : path?.startsWith("/app/try") ? "Try to scam it" : path?.startsWith("/app/market") ? "Fuse market"
    : path?.startsWith("/app/designers") ? "Sell a fuse" : path?.startsWith("/app/approve") ? "Approvals" : path?.startsWith("/app/new") ? "Wire up a wallet" : path?.startsWith("/app/mine") ? "My wallets" : "App";
  return (
    <header className="appbar">
      <Link className="logo" href="/" data-cursor="Home"><Logo />FUSEBOX</Link>
      <span className="m slash">/ app</span>
      <nav className="tabs-nav m" ref={nav}>
        {TABS.map(([h, l, sh]) => <Link key={h} href={h} className={active(h) ? "on" : ""}><span className="lg">{l}</span><span className="sh">{sh}</span></Link>)}
        <span className="ink" style={{ left: 0, width: 0 }} />
      </nav>
      <div className="right m">
        {source && <span className={`badge ${source === "mainnet" ? "main" : "warn"}`}>{source === "mainnet" ? "X Layer mainnet" : source === "fork" ? "Mainnet fork · rehearsal" : "Rehearsal snapshot"}</span>}
        <span className="mute blk"><span className="live" />Block {block ? <Digits value={block.toLocaleString("en-US")} /> : "—"}</span>
      </div>
      <span className="pg disp">{title}</span>
      <button className={`chip-acct m${account ? " on" : ""}`} onClick={openPanel} aria-label={account ? "Account and pages" : "Connect a wallet"}>{account ? <><span className="live" />{short(account)}</> : "Connect"}</button>
      <Connect />
    </header>
  );
}
