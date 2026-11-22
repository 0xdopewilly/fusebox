"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap, reduced } from "@/lib/gsap";
import { LangSwitch, useLang } from "@/lib/i18n";

/** Full-screen menu for the site (phones, and anywhere the header collapses). Sections hang off one lime wire, like
 *  fuses on a line; it draws in as the panel opens. `home` is "" on the landing page and "/" elsewhere. */
export default function SiteMenu({ open, onClose, home = "" }: { open: boolean; onClose: () => void; home?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const { t } = useLang();
  // the header re-renders on every new block (it shows the live block number) and hands down a new onClose each time:
  // keep it in a ref so the open animation runs once per open instead of replaying on every block
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add("menu-open");
    const lenis = (window as unknown as { __lenis?: { stop(): void; start(): void } }).__lenis;
    lenis?.stop();
    const el = root.current!;
    // explicit start and end values, scoped and reverted on close: an interrupted tween can't leave items half-faded
    const ctx = gsap.context(() => {
      if (reduced()) return;
      gsap.fromTo(el, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.55, ease: "expo.inOut", clearProps: "clipPath" });
      gsap.fromTo(".sm-wire", { scaleY: 0 }, { scaleY: 1, transformOrigin: "top", duration: 0.8, ease: "power3.inOut", delay: 0.2 });
      gsap.fromTo(".sm-item", { x: 18, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, stagger: 0.05, ease: "power3.out", delay: 0.25, clearProps: "transform" });
      gsap.fromTo(".sm-label, .sm-page", { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, stagger: 0.03, ease: "power3.out", delay: 0.4, clearProps: "transform" });
      gsap.fromTo(".sm-foot > *", { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, stagger: 0.06, delay: 0.45, clearProps: "transform" });
    }, el);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", esc);
    return () => { ctx.revert(); document.documentElement.classList.remove("menu-open"); lenis?.start(); window.removeEventListener("keydown", esc); };
  }, [open]);
  if (!open) return null;

  const SECTIONS = [["#how", t("How it works", "工作原理"), t("One call, four fuses, one verdict", "一次调用，四个保险丝，一个结论")], ["#tapeout", t("Built on TapeOut", "基于 TapeOut 构建"), t("Every fuse is a TapeOut circuit on X Layer", "每个保险丝都是 X Layer 上的 TapeOut 电路")], ["#fuses", t("The fuses", "保险丝"), t("Four circuits taped out on TapeOut", "在 TapeOut 上流片的四个电路")], ["#who", t("Who it's for", "适用对象"), t("And how Fusebox earns", "以及 Fusebox 如何盈利")],
    ["#designers", t("For designers", "面向设计者"), t("Sell a fuse, earn on every decision", "出售保险丝，每次决策都有收入")], ["#build", t("For builders", "面向开发者"), t("One call before every payment", "每笔付款前，只需一次调用")]] as const;
  const PAGES = [["/docs", t("Docs", "文档")], ["/app/market", t("Fuse market", "Fuse Market 保险丝市场")], ["/app/try", t("Try to scam it", "试着骗它")], ["/app/rob", t("Rob the agent", "打劫智能体")], ["/app/x402", t("Pay per call", "按次付费")], ["/onchain", t("DeWEB edition", "DeWEB 版")]] as const;

  const go = (e: React.MouseEvent, hash: string) => {
    if (home) return onClose(); // another page: let the link navigate to /#section
    e.preventDefault();
    onClose();
    const target = document.querySelector(hash);
    const lenis = (window as unknown as { __lenis?: { scrollTo(t: Element, o?: object): void } }).__lenis;
    setTimeout(() => { if (target) lenis ? lenis.scrollTo(target, { offset: -40, duration: 1.2 }) : target.scrollIntoView({ behavior: "smooth" }); }, 60);
  };
  // portalled to <body>: the header's backdrop-filter would otherwise trap this fixed panel inside the bar
  return createPortal(
    <div className="sm" ref={root} role="dialog" aria-label={t("Menu", "菜单")}>
      <div className="sm-top">
        <Link className="logo" href="/" onClick={onClose}><svg width="30" height="14" viewBox="0 0 30 14" aria-hidden="true"><rect x=".5" y="1.5" width="6" height="11" fill="#f2f2ee" /><rect x="23.5" y="1.5" width="6" height="11" fill="#f2f2ee" /><rect x="6.5" y="3.5" width="17" height="7" fill="none" stroke="#f2f2ee" /><path d="M6.5 7h4.5l1.6-2.6 2 5.2 1.6-2.6h7.3" fill="none" stroke="#bbfe2f" strokeWidth="1.4" /></svg>FUSEBOX</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LangSwitch />
          <button className="sm-x m" onClick={onClose} aria-label={t("Close the menu", "关闭菜单")}><span>{t("Close", "关闭")}</span><i /></button>
        </div>
      </div>
      <div className="sm-body">
        <div className="sm-label">{t("On this page", "本页内容")}<span>{String(SECTIONS.length).padStart(2, "0")}</span></div>
        <div className="sm-list">
          <span className="sm-wire" aria-hidden="true" />
          {SECTIONS.map(([h, label, s], i) => (
            <a key={h} className="sm-item" href={`${home}${h}`} onClick={(e) => go(e, h)}>
              <span className="node" aria-hidden="true" /><span className="n m">{String(i + 1).padStart(2, "0")}</span>
              <span className="t"><b>{label}</b><small>{s}</small></span>
            </a>
          ))}
        </div>
        <div className="sm-label sm-pages-l">{t("Pages", "页面")}</div>
        <div className="sm-pages">
          {PAGES.map(([h, label]) => <Link key={h} className="sm-page m" href={h} onClick={onClose}>{label}<span className="k" aria-hidden="true">→</span></Link>)}
        </div>
      </div>
      <div className="sm-foot">
        <Link className="btn lime sm-cta" href="/app" onClick={onClose}><span>{t("Open the app", "打开应用")}</span><span className="k">↗</span></Link>
        <div className="m mute sm-meta"><span><span className="live" />{t("Built on TapeOut · X Layer", "基于 TapeOut · X Layer 构建")}</span><a href="https://x.com/fuseboxhq" target="_blank" rel="noreferrer">@fuseboxhq ↗</a><a href="https://github.com/0xdopewilly/fusebox" target="_blank" rel="noreferrer">GitHub ↗</a></div>
      </div>
    </div>,
    document.body,
  );
}
