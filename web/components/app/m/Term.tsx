"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GLOSSARY, type GlossKey } from "@/lib/plain";
import { useLang } from "@/lib/i18n";
import { powerOn, powerOff, usePresence } from "@/lib/motion";
import { useMobile } from "./useMobile";
import { MSheet } from "./ui";

/** A word a newcomer may not know: dotted underline, tap or click for its one-line meaning (a sheet on phones, a small
 *  card on desktop). Children default to the glossary's own spelling. */
export default function Term({ k, children }: { k: GlossKey; children?: React.ReactNode }) {
  const { zh } = useLang();
  const G = GLOSSARY[k];
  const g = { term: zh ? G.termZh : G.term, say: zh ? G.sayZh : G.say };
  const mobile = useMobile();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  // desktop card: the wire draws from the word, the card unrolls, the term decodes from bits
  const shown = usePresence(open && !mobile, pop, (el) => powerOn(el, { from: "left", rows: [], decode: el.querySelectorAll("b") }), (el, done) => powerOff(el, done, { rows: [] }));
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
      {shown && !mobile && <span className="term-pop" role="tooltip" ref={pop}><i className="pw-wire" aria-hidden="true" /><i className="pw-scan" aria-hidden="true" /><b key={g.term} data-t={g.term}>{g.term}</b>{g.say} <Link href="/docs#glossary">{zh ? "全部术语 →" : "All terms →"}</Link></span>}
      {mobile && <MSheet open={open} onClose={() => setOpen(false)} title={g.term}><div className="ms-info"><p>{g.say}</p><p><Link href="/docs#glossary">{zh ? "所有术语，一页看完 →" : "Every term, in one place →"}</Link></p></div></MSheet>}
    </span>
  );
}
