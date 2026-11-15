"use client";
import { useEffect, useRef, useState } from "react";
import { gsap, useGSAP, introDone } from "@/lib/gsap";
import Digits from "@/components/fx/Digits";

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
      <div className="tcol m mute" data-h><span className="scr">Circuit fuses</span><br /><span className="scr">for AI agent wallets</span></div>
      <div className="tcol m mute" data-h><span className="scr">X Layer · chain 196</span><br /><span className="scr">Taped out on TapeOut</span></div>
      <div className="tcol m mute" data-h><span className="live" />Block {block ? <Digits value={b} /> : <span style={{ color: "#f2f2ee" }}>{b}</span>}<br />X Layer mainnet · live</div>
      <nav className="m" style={{ gridColumn: "5 / 7" }} data-h>
        <NavLink href="#how" label="How" />
        <NavLink href="#fuses" label="Fuses" />
        <NavLink href="#designers" label="Designers" />
        <NavLink href="#build" label="Docs" />
        <a className="btn lime" href="/app" data-cursor="Enter"><span className="roll"><span>Open app</span><span aria-hidden="true">Open app</span></span> <span className="k">↗</span></a>
      </nav>
    </header>
  );
}
