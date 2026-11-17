"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GLOSSARY, type GlossKey } from "@/lib/plain";
import { useMobile } from "./useMobile";
import { MSheet } from "./ui";

/** A word a newcomer may not know: dotted underline, tap or click for its one-line meaning (a sheet on phones, a small
 *  card on desktop). Children default to the glossary's own spelling. */
export default function Term({ k, children }: { k: GlossKey; children?: React.ReactNode }) {
  const g = GLOSSARY[k];
  const mobile = useMobile();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open || mobile) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); window.removeEventListener("keydown", esc); };
  }, [open, mobile]);
  return (
    <span className="term" ref={box}>
      <button type="button" className="term-w" aria-expanded={open} onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); }}>{children ?? g.term}</button>
      {open && !mobile && <span className="term-pop" role="tooltip"><b>{g.term}</b>{g.say} <Link href="/docs#glossary">All terms →</Link></span>}
      {mobile && <MSheet open={open} onClose={() => setOpen(false)} title={g.term}><div className="ms-info"><p>{g.say}</p><p><Link href="/docs#glossary">Every term, in one place →</Link></p></div></MSheet>}
    </span>
  );
}
