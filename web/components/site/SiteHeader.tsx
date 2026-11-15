"use client";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/landing/Header";
import SiteMenu from "@/components/landing/SiteMenu";

/** The header for the site's inner pages (docs, 404). Same links as the landing page; the menu takes over on phones. */
export default function SiteHeader({ active }: { active?: "docs" }) {
  const [menu, setMenu] = useState(false);
  return (
    <header className="sitebar">
      <Link className="logo" href="/"><Logo />FUSEBOX</Link>
      <nav className="m" aria-label="Site">
        <Link className="navlink" href="/#how"><span>How</span><span aria-hidden="true">How</span></Link>
        <Link className="navlink" href="/#fuses"><span>Fuses</span><span aria-hidden="true">Fuses</span></Link>
        <Link className="navlink" href="/#who"><span>Who</span><span aria-hidden="true">Who</span></Link>
        <Link className={`navlink${active === "docs" ? " on" : ""}`} href="/docs"><span>Docs</span><span aria-hidden="true">Docs</span></Link>
        <Link className="btn lime" href="/app"><span>Open app</span> <span className="k">↗</span></Link>
        <button className="menu-btn m" onClick={() => setMenu(true)} aria-label="Open the menu" aria-expanded={menu}><span>Menu</span><i /><i /></button>
      </nav>
      <SiteMenu open={menu} onClose={() => setMenu(false)} home="/" />
    </header>
  );
}
