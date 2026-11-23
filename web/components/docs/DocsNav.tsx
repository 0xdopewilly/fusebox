"use client";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";

type Lenis = { scrollTo(t: Element | number, o?: object): void };

/** Sidebar on desktop, a sticky section picker on phones. Both follow the section you're reading. */
export default function DocsNav({ sections }: { sections: { id: string; title: string; group?: string; titleZh?: string; groupZh?: string }[] }) {
  const { t, zh } = useLang();
  const name = (s: (typeof sections)[number]) => (zh && s.titleZh) || s.title;
  const [cur, setCur] = useState(sections[0].id);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setCur(vis[0].target.id);
    }, { rootMargin: "-90px 0px -60% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);
  const go = (e: React.MouseEvent, id: string) => {
    e.preventDefault(); setOpen(false);
    const el = document.getElementById(id); if (!el) return;
    const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
    if (lenis) lenis.scrollTo(el, { offset: -96, duration: 1 }); else el.scrollIntoView({ behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
  };
  const sec = sections.find((s) => s.id === cur);
  const title = sec ? name(sec) : "";
  let lastGroup = "";
  return (
    <>
      <aside className="dn">
        <nav aria-label={t("Docs sections", "文档目录")}>
          {sections.map((s, i) => {
            const head = s.group && s.group !== lastGroup ? ((lastGroup = s.group), <div key={`g${s.group}`} className="dn-g m">{(zh && s.groupZh) || s.group}</div>) : null;
            return [head, <a key={s.id} href={`#${s.id}`} onClick={(e) => go(e, s.id)} className={cur === s.id ? "on" : ""}><span className="m">{String(i + 1).padStart(2, "0")}</span>{name(s)}</a>];
          })}
        </nav>
      </aside>
      <div className={`dn-m${open ? " open" : ""}`}>
        <button className="dn-m-btn m" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="mute">{t("On this page", "本页内容")}</span><b>{title}</b><span className="chev" aria-hidden="true" />
        </button>
        {open && (
          <div className="dn-m-list">
            {sections.map((s, i) => <a key={s.id} href={`#${s.id}`} onClick={(e) => go(e, s.id)} className={cur === s.id ? "on" : ""}><span className="m">{String(i + 1).padStart(2, "0")}</span>{name(s)}</a>)}
          </div>
        )}
      </div>
    </>
  );
}
