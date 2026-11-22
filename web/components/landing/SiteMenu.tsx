"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap, reduced } from "@/lib/gsap";

/** Full-screen menu for the site (phones, and anywhere the header collapses). Sections hang off one lime wire, like
 *  fuses on a line; it draws in as the panel opens. `home` is "" on the landing page and "/" elsewhere. */
const SECTIONS = [["#how", "How it works", "One call, four fuses, one verdict"], ["#tapeout", "Built on TapeOut", "Every fuse is a TapeOut circuit on X Layer"], ["#fuses", "The fuses", "Four circuits taped out on TapeOut"], ["#who", "Who it's for", "And how Fusebox earns"],
  ["#designers", "For designers", "Sell a fuse, earn on every decision"], ["#build", "For builders", "One call before every payment"]] as const;
const PAGES = [["/docs", "Docs"], ["/app/market", "Fuse market"], ["/app/try", "Try to scam it"], ["/app/rob", "Rob the agent"], ["/app/x402", "Pay per call"], ["/onchain", "DeWEB edition"]] as const;

export default function SiteMenu({ open, onClose, home = "" }: { open: boolean; onClose: () => void; home?: string }) {
  const root = useRef<HTMLDivElement>(null);
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
    <div className="sm" ref={root} role="dialog" aria-label="Menu">
      <div className="sm-top">
        <Link className="logo" href="/" onClick={onClose}><svg width="30" height="14" viewBox="0 0 30 14" aria-hidden="true"><rect x=".5" y="1.5" width="6" height="11" fill="#f2f2ee" /><rect x="23.5" y="1.5" width="6" height="11" fill="#f2f2ee" /><rect x="6.5" y="3.5" width="17" height="7" fill="none" stroke="#f2f2ee" /><path d="M6.5 7h4.5l1.6-2.6 2 5.2 1.6-2.6h7.3" fill="none" stroke="#bbfe2f" strokeWidth="1.4" /></svg>FUSEBOX</Link>
        <button className="sm-x m" onClick={onClose} aria-label="Close the menu"><span>Close</span><i /></button>
      </div>
      <div className="sm-body">
        <div className="sm-label">On this page<span>{String(SECTIONS.length).padStart(2, "0")}</span></div>
        <div className="sm-list">
          <span className="sm-wire" aria-hidden="true" />
          {SECTIONS.map(([h, t, s], i) => (
            <a key={h} className="sm-item" href={`${home}${h}`} onClick={(e) => go(e, h)}>
              <span className="node" aria-hidden="true" /><span className="n m">{String(i + 1).padStart(2, "0")}</span>
              <span className="t"><b>{t}</b><small>{s}</small></span>
            </a>
          ))}
        </div>
        <div className="sm-label sm-pages-l">Pages</div>
        <div className="sm-pages">
          {PAGES.map(([h, t]) => <Link key={h} className="sm-page m" href={h} onClick={onClose}>{t}<span className="k" aria-hidden="true">→</span></Link>)}
        </div>
      </div>
      <div className="sm-foot">
        <Link className="btn lime sm-cta" href="/app" onClick={onClose}><span>Open the app</span><span className="k">↗</span></Link>
        <div className="m mute sm-meta"><span><span className="live" />Built on TapeOut · X Layer</span><a href="https://x.com/fuseboxhq" target="_blank" rel="noreferrer">@fuseboxhq ↗</a><a href="https://github.com/0xdopewilly/fusebox" target="_blank" rel="noreferrer">GitHub ↗</a></div>
      </div>
    </div>,
    document.body,
  );
}
