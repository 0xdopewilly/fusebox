"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { gsap, useGSAP, introDone } from "@/lib/gsap";
import Digits from "@/components/fx/Digits";
import SiteMenu from "./SiteMenu";
import { LangSwitch, useLang } from "@/lib/i18n";

function useBlock() {
  const [block, setBlock] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch("/api/block", { cache: "no-store" });
        const j = await r.json();
        if (alive && typeof j.block === "number") setBlock(j.block);
      } catch {}
    };
    pull();
    const id = setInterval(pull, 2500);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return block;
}

export function Logo() {
  return (
    <svg width="30" height="14" viewBox="0 0 30 14" aria-hidden="true">
      <rect x=".5" y="1.5" width="6" height="11" fill="#f2f2ee" />
      <rect x="23.5" y="1.5" width="6" height="11" fill="#f2f2ee" />
      <rect x="6.5" y="3.5" width="17" height="7" fill="none" stroke="#f2f2ee" />
      <path d="M6.5 7h4.5l1.6-2.6 2 5.2 1.6-2.6h7.3" fill="none" stroke="#bbfe2f" strokeWidth="1.4" />
    </svg>
  );
}

const NavLink = ({ href, label }: { href: string; label: string }) => (
  <a className="navlink" href={href}><span>{label}</span><span aria-hidden="true">{label}</span></a>
);

export default function Header() {
  const ref = useRef<HTMLElement>(null);
  const block = useBlock();
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  const { t } = useLang();

  useGSAP(() => {
    const el = ref.current!;
    const items = el.querySelectorAll("[data-h]");
    gsap.set(items, { autoAlpha: 0, y: -14 });
    introDone().then(() => {
      gsap.to(items, { autoAlpha: 1, y: 0, stagger: 0.07, duration: 0.9, delay: 0.15 });
      el.querySelectorAll<HTMLElement>(".tcol .scr").forEach((s, i) =>
        gsap.from(s, { scrambleText: { text: s.textContent || "", chars: "01", speed: 0.6 }, duration: 1.1, delay: 0.3 + i * 0.12 }),
      );
    });
    let last = 0;
    const onScroll = () => {
      const y = window.scrollY;
      el.classList.toggle("scrolled", y > 60);
      el.classList.toggle("hide", y > 400 && y > last + 2);
      if (y < last - 2) el.classList.remove("hide");
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const b = block ? block.toLocaleString("en-US") : "—";
  return (
    <header className="wrap cols top" ref={ref}>
      <a className="logo" href="#" data-h data-cursor="Top"><Logo />FUSEBOX<sup>®</sup></a>
      <div className="tcol m mute" data-h><span className="scr">{t("Circuit fuses", "电路保险丝")}</span><br /><span className="scr">{t("for AI agent wallets", "守护 AI 智能体钱包")}</span></div>
      <div className="tcol m mute" data-h><span className="scr">{t("X Layer · chain 196", "X Layer · 链 196")}</span><br /><span className="scr">{t("Taped out on TapeOut", "在 TapeOut 上流片")}</span></div>
      <div className="tcol m mute" data-h><span className="live" />{t("Block", "区块")} {block ? <Digits value={b} /> : <span style={{ color: "#f2f2ee" }}>{b}</span>}<br />{t("X Layer mainnet · live", "X Layer 主网 · 运行中")}</div>
      <nav className="m" style={{ gridColumn: "5 / 7" }} data-h aria-label={t("Site", "网站")}>
        <NavLink href="#how" label={t("How", "原理")} />
        <NavLink href="#tapeout" label="TapeOut" />
        <NavLink href="#fuses" label={t("Fuses", "保险丝")} />
        <NavLink href="#designers" label={t("Designers", "设计者")} />
        <NavLink href="/docs" label={t("Docs", "文档")} />
        <LangSwitch className="navlang" />
        <a className="btn lime" href="/app" data-cursor="Enter"><span className="roll"><span>{t("Open app", "打开应用")}</span><span aria-hidden="true">{t("Open app", "打开应用")}</span></span> <span className="k">↗</span></a>
        <button className="menu-btn m" onClick={() => setMenu(true)} aria-label={t("Open the menu", "打开菜单")} aria-expanded={menu}><span>{t("Menu", "菜单")}</span><i /><i /></button>
      </nav>
      <SiteMenu open={menu} onClose={closeMenu} />
    </header>
  );
}
