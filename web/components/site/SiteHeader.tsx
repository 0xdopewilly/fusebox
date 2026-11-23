"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Logo } from "@/components/landing/Header";
import SiteMenu from "@/components/landing/SiteMenu";
import { LangSwitch, useLang } from "@/lib/i18n";

/** The header for the site's inner pages (docs, 404). Same links as the landing page; the menu takes over on phones. */
export default function SiteHeader({ active }: { active?: "docs" }) {
  const [menu, setMenu] = useState(false);
  const { t } = useLang();
  const closeMenu = useCallback(() => setMenu(false), []);
  return (
    <header className="sitebar">
      <Link className="logo" href="/"><Logo />FUSEBOX</Link>
      <nav className="m" aria-label="Site">
        <Link className="navlink" href="/#how"><span>{t("How", "原理")}</span><span aria-hidden="true">{t("How", "原理")}</span></Link>
        <Link className="navlink" href="/#fuses"><span>{t("Fuses", "保险丝")}</span><span aria-hidden="true">{t("Fuses", "保险丝")}</span></Link>
        <Link className="navlink" href="/#tapeout"><span>TapeOut</span><span aria-hidden="true">TapeOut</span></Link>
        <Link className={`navlink${active === "docs" ? " on" : ""}`} href="/docs"><span>{t("Docs", "文档")}</span><span aria-hidden="true">{t("Docs", "文档")}</span></Link>
        <LangSwitch className="sitelang" />
        <Link className="btn lime" href="/app"><span>{t("Open app", "打开应用")}</span> <span className="k">↗</span></Link>
        <button className="menu-btn m" onClick={() => setMenu(true)} aria-label={t("Open the menu", "打开菜单")} aria-expanded={menu}><span>{t("Menu", "菜单")}</span><i /><i /></button>
      </nav>
      <SiteMenu open={menu} onClose={closeMenu} home="/" />
    </header>
  );
}
