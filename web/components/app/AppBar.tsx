"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { gsap, reduced } from "@/lib/gsap";
import { useBlock } from "@/lib/hooks";
import Digits from "@/components/fx/Digits";
import { Logo } from "@/components/landing/Header";
import Connect from "./Connect";
import { openPanel } from "./Dock";
import { useWallet } from "./WalletProvider";
import { short } from "@/lib/hooks";
import { useChrome } from "./m/chrome";
import { MSheet } from "./m/ui";
import { LangSwitch, useLang } from "@/lib/i18n";

const TABS = [["/app", "Start", "Start"], ["/app/try", "Try to scam it", "Try"], ["/app/studio", "Build a rule", "Build"], ["/app/market", "Fuse market", "Market"]] as const;
const TABS_ZH: Record<string, [string, string]> = { "/app": ["开始", "开始"], "/app/try": ["试着骗它", "试骗"], "/app/studio": ["设计规则", "设计"], "/app/market": ["保险丝市场", "市场"] };
/** everything else, one click away without crowding the bar */
const MORE_ZH: Record<string, string> = { "/app/mine": "我的钱包", "/app/new": "创建钱包", "/app/assistant": "聊天付款", "/app/approve": "审批", "/app/designers": "出售保险丝", "/app/simulate": "线路模拟器", "/app/rob": "打劫智能体", "/app/x402": "按次付费（x402）", "/app/status": "运行状态" };
const MORE = [["/app/mine", "My wallets"], ["/app/new", "Wire up a wallet"], ["/app/assistant", "Pay by chatting"], ["/app/approve", "Approvals"], ["/app/designers", "Sell a fuse"], ["/app/simulate", "Line simulator"], ["/app/rob", "Rob the agent"], ["/app/x402", "Pay per call (x402)"], ["/app/status", "Status"]] as const;

/** "More" powers on like a circuit: a lime wire draws across, the panel unrolls from it, a scan line sweeps down and
 *  every page name decodes from bits as it slides in. Closing runs it back. Reduced motion just opens and closes. */
let moreTl: gsap.core.Timeline | null = null;
function openMore(d: HTMLDetailsElement) {
  d.open = true;
  if (reduced()) return;
  const menu = d.querySelector<HTMLElement>(".more-menu")!;
  const rows = menu.querySelectorAll<HTMLElement>("a");
  const labels = menu.querySelectorAll<HTMLElement>(".mm-t");
  moreTl?.kill();
  gsap.set(menu, { clearProps: "clipPath" });
  moreTl = gsap.timeline()
    .fromTo(menu.querySelector(".mm-wire"), { scaleX: 0, transformOrigin: "right" }, { scaleX: 1, duration: 0.38, ease: "wire" })
    .fromTo(menu, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.6, ease: "snap", clearProps: "clipPath" }, 0.14)
    .fromTo(menu.querySelector(".mm-scan"), { y: 0, autoAlpha: 1 }, { y: menu.offsetHeight, duration: 0.7, ease: "power2.inOut" }, 0.14)
    .set(menu.querySelector(".mm-scan"), { autoAlpha: 0 })
    .fromTo(menu.querySelector(".mm-head"), { autoAlpha: 0, y: -6 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 0.2)
    .fromTo(rows, { x: 18, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, stagger: 0.04, ease: "snap" }, 0.22);
  labels.forEach((l, i) => {
    const text = l.dataset.t ?? l.textContent ?? "";
    moreTl!.to(l, { duration: 0.55, scrambleText: { text, chars: "01", speed: 0.9, revealDelay: 0.15 } }, 0.24 + i * 0.04);
  });
}
function closeMore(d: HTMLDetailsElement) {
  if (!d.open) return;
  if (reduced()) { d.open = false; return; }
  const menu = d.querySelector<HTMLElement>(".more-menu")!;
  moreTl?.kill();
  moreTl = gsap.timeline({ onComplete: () => { d.open = false; gsap.set([menu, ...menu.querySelectorAll("a, .mm-wire, .mm-head")], { clearProps: "all" }); } })
    .to(menu.querySelectorAll("a"), { x: 10, autoAlpha: 0, duration: 0.18, stagger: { each: 0.015, from: "end" }, ease: "power2.in" })
    .to(menu, { clipPath: "inset(0 0 100% 0)", duration: 0.32, ease: "wire" }, 0.06)
    .to(menu.querySelector(".mm-wire"), { scaleX: 0, transformOrigin: "left", duration: 0.26, ease: "wire" }, 0.24);
}

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
  const active = (h: string) => (h === "/app" ? path === "/app" : path?.startsWith(h) || (h === "/app/market" && !!path?.startsWith("/app/fuse/")) || (h === "/app/try" && (!!path?.startsWith("/app/simulate") || !!path?.startsWith("/app/rob"))) || (h === "/app/studio" && !!path?.startsWith("/app/designers")));
  const { account } = useWallet();
  const chrome = useChrome();
  const [info, setInfo] = useState(false);
  const { t: tr, zh } = useLang();
  useEffect(() => { setInfo(false); }, [path]);
  // "More" closes on a click anywhere else or on Escape
  useEffect(() => {
    const close = (e: Event) => { const d = document.querySelector<HTMLDetailsElement>(".more-l[open]"); if (d && !(e instanceof KeyboardEvent ? e.key !== "Escape" : d.contains(e.target as Node))) closeMore(d); };
    document.addEventListener("click", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
  }, []);
  // phones show the page's name in the bar; the sections live in the dock at the bottom
  const title = path === "/app" ? "Fusebox" : path?.startsWith("/app/w/") ? "Wallet" : path?.startsWith("/app/try") ? "Try to scam it" : path?.startsWith("/app/market") ? "Fuse market" : path?.startsWith("/app/fuse/") ? "Fuse" : path?.startsWith("/app/simulate") ? "Line simulator" : path?.startsWith("/app/rob") ? "Rob the agent" : path?.startsWith("/app/x402") ? "Pay per call" : path?.startsWith("/app/status") ? "Status" : path?.startsWith("/app/studio") ? "Fuse Studio"
    : path?.startsWith("/app/designers") ? "Sell a fuse" : path?.startsWith("/app/approve") ? "Approvals" : path?.startsWith("/app/new") ? "Wire up a wallet" : path?.startsWith("/app/mine") ? "My wallets" : "App";
  const TITLE_ZH: Record<string, string> = { Wallet: "钱包", "Try to scam it": "试着骗它", "Fuse market": "保险丝市场", Fuse: "保险丝", "Line simulator": "线路模拟器", "Rob the agent": "打劫智能体", "Pay per call": "按次付费", "Sell a fuse": "出售保险丝", Approvals: "审批", "Wire up a wallet": "搭建钱包", "My wallets": "我的钱包", App: "应用", Status: "运行状态", Assistant: "助手", "Fuse Studio": "Fuse Studio", "Your first payment": "第一笔付款" };
  const pageTitle = zh ? TITLE_ZH[title] ?? title : title;
  return (
    <header className={`appbar${chrome?.back ? " has-back" : ""}`}>
      <Link className="logo" href="/" data-cursor="Home"><Logo />FUSEBOX</Link>
      <span className="m slash">/ app</span>
      <nav className="tabs-nav m" ref={nav} aria-label={tr("App sections", "应用分区")}>
        {TABS.map(([h, l, sh]) => <Link key={h} href={h} className={active(h) ? "on" : ""}><span className="lg">{zh ? TABS_ZH[h][0] : l}</span><span className="sh">{zh ? TABS_ZH[h][1] : sh}</span></Link>)}
        <span className="ink" style={{ left: 0, width: 0 }} />
      </nav>
      <div className="right m">
        <details className="more-l" key={path}>
          <summary className="docs-l" onClick={(e) => { e.preventDefault(); const d = e.currentTarget.parentElement as HTMLDetailsElement; if (d.open) closeMore(d); else openMore(d); }}>{tr("More", "更多")}</summary>
          <div className="more-menu">
            <i className="mm-wire" aria-hidden="true" /><i className="mm-scan" aria-hidden="true" />
            <div className="mm-head" aria-hidden="true"><span>{tr("More pages", "更多页面")}</span><span>{String(MORE.length).padStart(2, "0")}</span></div>
            {MORE.map(([h, t], i) => { const l = zh ? MORE_ZH[h] : t; return <Link key={h} href={h} className={path?.startsWith(h) ? "on" : ""}><span className="mm-ix">{String(i + 1).padStart(2, "0")}</span><span className="mm-t" key={l} data-t={l}>{l}</span><span className="mm-go" aria-hidden="true">→</span></Link>; })}
          </div>
        </details>
        <LangSwitch className="docs-l" />
        <Link className="docs-l" href="/docs">{tr("Docs ↗", "文档 ↗")}</Link>
        <a className="badge tape" href="https://tapeout.net" target="_blank" rel="noreferrer" title={tr("Every fuse is a circuit taped out on TapeOut", "每个保险丝都是在 TapeOut 上流片的电路")}>{tr("Built on TapeOut ↗", "基于 TapeOut ↗")}</a>
        {source && <span className={`badge ${source === "mainnet" ? "main" : "warn"}`}>{source === "mainnet" ? tr("X Layer mainnet", "X Layer 主网") : source === "fork" ? "Mainnet fork · rehearsal" : "Rehearsal snapshot"}</span>}
        <span className="mute blk"><span className="live" />{tr("Block", "区块")} {block ? <Digits value={block.toLocaleString("en-US")} /> : "—"}</span>
      </div>
      <span className="pg">
        {chrome?.back && <Link className="pg-back" href={chrome.back} aria-label="Back">←</Link>}
        <span className="pg-tt">{chrome ? <h1 className="pg-t disp">{chrome.title ?? pageTitle}</h1> : <span className="pg-t disp">{pageTitle}</span>}{chrome?.sub && <span className="pg-sub m">{chrome.sub}</span>}</span>
      </span>
      {chrome?.info && <button className="pg-i" onClick={() => setInfo(true)} aria-label={tr("About this screen", "关于此页面")}>i</button>}
      {chrome?.info && <MSheet open={info} onClose={() => setInfo(false)} title={chrome.title ?? pageTitle}><div className="ms-info">{chrome.info}</div></MSheet>}
      <button className={`chip-acct m${account ? " on" : ""}`} onClick={openPanel} aria-label={account ? tr("Account and pages", "账户与页面") : tr("Connect a wallet", "连接钱包")}>{account ? <><span className="live" />{short(account)}</> : tr("Connect", "连接")}</button>
      <Connect />
    </header>
  );
}
