"use client";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { gsap, reduced } from "@/lib/gsap";
import { Glyph, type GlyphName } from "../Pixel";
import { useLang } from "@/lib/i18n";

const KEY = "fusebox:intro:v1";
const CARDS: { g: GlyphName; title: string; body: string; titleZh: string; bodyZh: string }[] = [
  { g: "rob", title: "Your AI agent can pay", body: "AI agents now hold wallets and send real money. One convincing message, a fake invoice or new bank details, and an agent can pay a scammer.",
    titleZh: "你的 AI 智能体会付款", bodyZh: "AI 智能体如今持有钱包，能转出真金白银。只要一条足够可信的消息，比如一张假发票或新的银行账户信息，智能体就可能把钱付给骗子。" },
  { g: "studio", title: "Fusebox puts fuses in the way", body: "Every payment must pass small circuits called fuses: a daily limit, known payees only, two signers for big ones. They run on X Layer. One no, and nothing moves.",
    titleZh: "Fusebox 在路上装了保险丝", bodyZh: "每笔付款都必须通过叫作保险丝的小电路：每日限额、只付已知收款方、大额需两人签名。它们运行在 X Layer 上。一个“否”，资金就不会移动。" },
  { g: "approve", title: "Try to trick Atlas", body: "Atlas is our live AI agent's wallet. Pick a scam and watch its fuses decide in seconds. It's free, no wallet needed, and nothing moves.",
    titleZh: "试着骗 Atlas", bodyZh: "Atlas 是我们真实运行的 AI 智能体钱包。挑一个骗局，看它的保险丝在几秒内做出决策。免费，无需钱包，资金也不会移动。" },
];

/** Once per browser, on the first app screen: what Fusebox is in three cards, ending on the one thing to try.
 *  Skipped for approvers arriving from an alert and for automated browsers (?intro=1 forces it). */
export default function Intro() {
  const path = usePathname() || "";
  const router = useRouter();
  const { t, zh } = useLang();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const force = new URLSearchParams(window.location.search).get("intro") === "1";
    let seen = false; try { seen = !!localStorage.getItem(KEY); } catch {}
    // the front door (/app) already says what Fusebox is and where to go
    if (force || (!seen && !navigator.webdriver && path !== "/app" && !path.startsWith("/app/approve"))) setOpen(true);
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
    <div className="onb-shade">
      <div className="onb" ref={box} role="dialog" aria-modal="true" aria-labelledby="intro-h" tabIndex={-1} onPointerDown={onDown} onPointerUp={onUp}>
        <div className="onb-top m"><span className="lime">Fusebox</span><button className="onb-skip" onClick={() => done()}>{t("Skip", "跳过")}</button></div>
        <div className="onb-card" ref={card} aria-live="polite">
          <div className="onb-art"><Glyph name={c.g} size={56} /></div>
          <span className="m mute">{String(i + 1).padStart(2, "0")} / {String(CARDS.length).padStart(2, "0")}</span>
          <h2 id="intro-h">{zh ? c.titleZh : c.title}</h2>
          <p>{zh ? c.bodyZh : c.body}</p>
        </div>
        <div className="onb-dots" role="tablist" aria-label={t("Intro cards", "介绍卡片")}>{CARDS.map((x, k) => <button key={x.title} role="tab" aria-selected={k === i} aria-label={t(`Card ${k + 1}`, `第 ${k + 1} 张`)} className={k === i ? "on" : ""} onClick={() => go(k)} />)}</div>
        <div className="onb-act">
          {last ? <>
            <button className="btn lime" onClick={() => done("/app/try")}>{t("Try to scam Atlas", "试着骗 Atlas")} <span className="k">→</span></button>
            <button className="btn" onClick={() => done()}>{t("Look around first", "先随便看看")}</button>
          </> : <>
            <button className="btn lime" onClick={() => go(i + 1)}>{t("Next", "下一步")} <span className="k">→</span></button>
          </>}
        </div>
      </div>
    </div>
  );
}
