"use client";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { gsap, reduced } from "@/lib/gsap";
import { Glyph, type GlyphName } from "../Pixel";

const KEY = "fusebox:intro:v1";
const CARDS: { g: GlyphName; title: string; body: string }[] = [
  { g: "rob", title: "Your AI agent can pay", body: "AI agents now hold wallets and send real money. One convincing message, a fake invoice or new bank details, and an agent can pay a scammer." },
  { g: "studio", title: "Fusebox puts fuses in the way", body: "Every payment must pass small circuits called fuses: a daily limit, known payees only, two signers for big ones. They run on X Layer. One no, and nothing moves." },
  { g: "approve", title: "Try to trick Atlas", body: "Atlas is our live AI agent's wallet. Pick a scam and watch its fuses decide in seconds. It's free, no wallet needed, and nothing moves." },
];

/** Once per browser, on the first app screen: what Fusebox is in three cards, ending on the one thing to try.
 *  Skipped for approvers arriving from an alert and for automated browsers (?intro=1 forces it). */
export default function Intro() {
  const path = usePathname() || "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const force = new URLSearchParams(window.location.search).get("intro") === "1";
    let seen = false; try { seen = !!localStorage.getItem(KEY); } catch {}
    if (force || (!seen && !navigator.webdriver && !path.startsWith("/app/approve"))) setOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const done = useCallback((to?: string) => {
    try { localStorage.setItem(KEY, String(Date.now())); } catch {}
    const finish = () => { setOpen(false); if (to) router.push(to); };
    if (!box.current || reduced()) return finish();
    gsap.to(box.current, { autoAlpha: 0, duration: 0.25, onComplete: finish });
  }, [router]);

  const go = useCallback((n: number) => {
    if (n < 0 || n >= CARDS.length) return;
    const dir = n > i ? 1 : -1;
    setI(n);
    if (card.current && !reduced()) gsap.fromTo(card.current, { x: 40 * dir, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.4, ease: "power3.out" });
  }, [i]);

  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add("panel-open");
    box.current?.focus({ preventScroll: true });
    if (box.current && !reduced()) gsap.fromTo(box.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") done(); if (e.key === "ArrowRight") go(i + 1); if (e.key === "ArrowLeft") go(i - 1); };
    window.addEventListener("keydown", key);
    return () => { document.documentElement.classList.remove("panel-open"); window.removeEventListener("keydown", key); };
  }, [open, i, go, done]);

  // swipe between cards
  const start = useRef<number | null>(null);
  const onDown = (e: React.PointerEvent) => { start.current = e.clientX; };
  const onUp = (e: React.PointerEvent) => { if (start.current === null) return; const dx = e.clientX - start.current; start.current = null; if (dx < -50) go(i + 1); else if (dx > 50) go(i - 1); };

  if (!open) return null;
  const c = CARDS[i], last = i === CARDS.length - 1;
  return (
    <div className="intro-shade">
      <div className="intro" ref={box} role="dialog" aria-modal="true" aria-labelledby="intro-h" tabIndex={-1} onPointerDown={onDown} onPointerUp={onUp}>
        <div className="intro-top m"><span className="lime">Fusebox</span><button className="intro-skip" onClick={() => done()}>Skip</button></div>
        <div className="intro-card" ref={card} aria-live="polite">
          <div className="intro-art"><Glyph name={c.g} size={56} /></div>
          <span className="m mute">{String(i + 1).padStart(2, "0")} / {String(CARDS.length).padStart(2, "0")}</span>
          <h2 id="intro-h">{c.title}</h2>
          <p>{c.body}</p>
        </div>
        <div className="intro-dots" role="tablist" aria-label="Intro cards">{CARDS.map((x, k) => <button key={x.title} role="tab" aria-selected={k === i} aria-label={`Card ${k + 1}`} className={k === i ? "on" : ""} onClick={() => go(k)} />)}</div>
        <div className="intro-act">
          {last ? <>
            <button className="btn lime" onClick={() => done("/app/try")}>Try to scam Atlas <span className="k">→</span></button>
            <button className="btn" onClick={() => done()}>Look around first</button>
          </> : <>
            <button className="btn lime" onClick={() => go(i + 1)}>Next <span className="k">→</span></button>
          </>}
        </div>
      </div>
    </div>
  );
}
