"use client";
import { useRef } from "react";
import { gsap, SplitText, ScrollTrigger, useGSAP, introDone, reduced } from "@/lib/gsap";
import type { FuseScene } from "./FuseScene";
import { useLang } from "@/lib/i18n";

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { t } = useLang();
  const TAGS = [
    { id: "fil", title: t("Filament", "熔丝"), sub: t("a TapeOut NAND circuit", "一个 TapeOut NAND 电路"), dx: -40, dy: -128 },
    { id: "cap", title: t("End cap", "端帽"), sub: t("X Layer · chain 196", "X Layer · 链 196"), dx: -120, dy: 118 },
    { id: "blow", title: t("Blows on", "熔断条件"), sub: t("a stranger payee", "陌生收款方"), dx: 70, dy: 150 },
  ];

  useGSAP(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const lead = el.querySelector<SVGSVGElement>(".leaders")!;
    const tagEls = TAGS.map((t) => el.querySelector<HTMLElement>(`[data-tag="${t.id}"]`)!);
    const flash = el.querySelector<HTMLElement>(".flash")!;
    let hot = false;

    // ---- 3D fuse: three.js loads once the page is interactive, so it never holds up the first paint or the intro ----
    const reveal = { v: 0 };
    let scene: FuseScene | null = null;
    let io: IntersectionObserver | null = null, ro: ResizeObserver | null = null;
    let dead = false, shown = false;
    // the 3D scene waits for an idle moment, so its parse and set-up never compete with the first paint or the
    // entrance (it dithers in whenever it arrives)
    const idle = (fn: () => void) => { if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 2500 }); else setTimeout(fn, 1200); };
    new Promise<void>((r) => idle(r)).then(() => import("./FuseScene")).then(({ FuseScene }) => {
      if (dead) return;
      const s = new FuseScene(cv, {
        onFrame: (a) => {
          if (!shown) { shown = true; el.classList.add("scene-on"); }
          const ox = cv.offsetLeft, oy = cv.offsetTop;
          let d = "";
          TAGS.forEach((t, i) => {
            const tag = tagEls[i];
            const ax = ox + a[i].x, ay = oy + a[i].y, bx = ax + t.dx, by = ay + t.dy;
            tag.style.transform = `translate(${bx}px,${by - 18}px)`;
            const c = t.id === "blow" && hot ? "#ff5232" : "#bbfe2f";
            d += `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)}L${ax.toFixed(1)} ${by.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}" fill="none" stroke="${c}" stroke-width="1"/><rect x="${(ax - 3.5).toFixed(1)}" y="${(ay - 3.5).toFixed(1)}" width="7" height="7" fill="${c}"/>`;
          });
          lead.innerHTML = d;
        },
        onBlow: (b) => {
          if (b === hot) return;
          hot = b;
          tagEls[2].classList.toggle("hot", b);
          if (b) gsap.fromTo(flash, { scaleX: 0, autoAlpha: 1 }, { scaleX: 1, duration: 0.5, ease: "power3.out", onComplete: () => { gsap.to(flash, { autoAlpha: 0, duration: 0.6 }); } });
        },
      });
      s.reveal = reveal;
      // arrived after the entrance already revealed it (a slow connection): dither it in now instead of popping
      if (!reduced() && reveal.v >= 1.01) gsap.fromTo(reveal, { v: 0 }, { v: 1.01, duration: 1.4, ease: "power2.inOut" });
      scene = s;
      io = new IntersectionObserver(([e]) => (e.isIntersecting ? s.start() : s.stop()), { rootMargin: "100px" });
      io.observe(cv);
      ro = new ResizeObserver(() => s.resize());
      ro.observe(cv);
    });
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      scene?.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    };
    el.addEventListener("pointermove", onMove);
    const onClick = () => scene?.blow();
    cv.addEventListener("click", onClick);

    // ---- entrance ----
    const h1 = el.querySelector("h1")!;
    const facts = Array.from(el.querySelectorAll<HTMLElement>(".facts b"));
    gsap.set([...Array.from(el.querySelectorAll("[data-in]")), el.querySelector(".bigword")], { autoAlpha: 1 });
    // phones: the hero is visible from the first paint (globals.css) and slides into place instead of being revealed
    // letter by letter from behind masks, so a slow phone shows the words at once rather than after its scripts run
    const narrow = window.matchMedia("(max-width: 700px)").matches;

    const tl = gsap.timeline({ paused: true });
    if (reduced()) {
      reveal.v = 1.01;
    } else if (narrow) {
      tl.from(document.querySelectorAll(".grid i"), { scaleY: 0, duration: 1.4, stagger: 0.06, ease: "wire" }, 0)
        .from(el.querySelector(".eyebrow"), { scrambleText: { text: t("[01] Guardrails that run on X Layer, not on trust", "[01] 护栏跑在 X Layer 上，而不是靠信任"), chars: "01", speed: 0.5 }, duration: 1.2 }, 0.1)
        .from(h1, { y: 18, duration: 0.9, ease: "snap" }, 0.1)
        .to(h1.querySelector(".lime"), { opacity: 0.25, duration: 0.05, repeat: 5, yoyo: true, ease: "none" }, 0.6)
        .from(el.querySelector(".sub p"), { y: 14, duration: 0.9 }, 0.25)
        .from(el.querySelectorAll(".ctas > *"), { y: 16, duration: 0.8, stagger: 0.08 }, 0.4)
        .to(reveal, { v: 1.01, duration: 1.8, ease: "power2.inOut" }, 0.35)
        .from(tagEls, { autoAlpha: 0, duration: 0.5, stagger: 0.12 }, 1.4)
        .from(lead, { autoAlpha: 0, duration: 0.5 }, 1.4)
        .from(el.querySelectorAll(".facts > div"), { y: 20, duration: 0.9, stagger: 0.08 }, 0.7);
      facts.forEach((b, i) => {
        const end = Number(b.dataset.v), dec = Number(b.dataset.dec || 0), o = { v: 0 };
        tl.to(o, { v: end, duration: 1.4, ease: "power3.out", onUpdate: () => { b.textContent = o.v.toFixed(dec); } }, 0.8 + i * 0.08);
      });
    } else {
      const lines = SplitText.create(h1, { type: "lines,chars", linesClass: "line-mask", charsClass: "char", mask: "lines" });
      const sub = SplitText.create(el.querySelector(".sub p")!, { type: "lines", linesClass: "line-mask", mask: "lines", aria: "none" }); // lines keep whole words, so it reads as written
      const circuits = Array.from(h1.querySelectorAll(".lime .char"));
      const brackets = circuits.filter((c) => c.textContent === "[" || c.textContent === "]");
      tl.from(document.querySelectorAll(".grid i"), { scaleY: 0, duration: 1.4, stagger: 0.06, ease: "wire" }, 0)
        .from(el.querySelector(".eyebrow"), { scrambleText: { text: t("[01] Guardrails that run on X Layer, not on trust", "[01] 护栏跑在 X Layer 上，而不是靠信任"), chars: "01", speed: 0.5 }, duration: 1.2 }, 0.1)
        .from(lines.chars, { yPercent: 115, duration: 1.1, stagger: 0.016, ease: "snap" }, 0.15)
        .from(brackets[0], { x: -70, duration: 0.9, ease: "back.out(2.2)" }, 0.6)
        .from(brackets[1], { x: 70, duration: 0.9, ease: "back.out(2.2)" }, 0.6)
        .to(circuits.filter((c) => !brackets.includes(c)), { opacity: 0.15, duration: 0.05, repeat: 5, yoyo: true, stagger: { each: 0.04, from: "random" }, ease: "none" }, 0.95)
        .from(sub.lines, { yPercent: 105, duration: 1, stagger: 0.07 }, 0.55)
        .from(el.querySelectorAll(".ctas > *"), { y: 24, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.75)
        .to(reveal, { v: 1.01, duration: 1.8, ease: "power2.inOut" }, 0.35)
        .from(tagEls, { autoAlpha: 0, duration: 0.5, stagger: 0.12 }, 1.6)
        .from(lead, { autoAlpha: 0, duration: 0.5 }, 1.6)
        .from(el.querySelector(".hint"), { autoAlpha: 0, x: 12, duration: 0.6 }, 2)
        .from(el.querySelector(".bigword"), { yPercent: 55, duration: 1.8, ease: "snap" }, 0.4)
        .from(el.querySelectorAll(".facts > div"), { y: 20, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.9);
      facts.forEach((b, i) => {
        const end = Number(b.dataset.v);
        const dec = Number(b.dataset.dec || 0);
        const o = { v: 0 };
        tl.to(o, { v: end, duration: 1.4, ease: "power3.out", onUpdate: () => { b.textContent = o.v.toFixed(dec); } }, 1 + i * 0.08);
      });
    }
    introDone().then(() => tl.play());

    // ---- scroll parallax ----
    if (!reduced()) {
      const st = { trigger: el, start: "top top", end: "bottom top", scrub: true };
      gsap.to(h1, { yPercent: -30, ease: "none", scrollTrigger: st });
      gsap.to(el.querySelector(".bigword"), { yPercent: -28, ease: "none", scrollTrigger: st });
      gsap.to(el.querySelector(".fusewrap"), { y: 90, ease: "none", scrollTrigger: st });
      gsap.to(el.querySelector(".facts"), { y: -50, autoAlpha: 0.2, ease: "none", scrollTrigger: st });
    }

    return () => {
      dead = true;
      io?.disconnect(); ro?.disconnect();
      el.removeEventListener("pointermove", onMove);
      cv.removeEventListener("click", onClick);
      scene?.dispose();
      ScrollTrigger.refresh();
    };
  }, []);

  return (
    <section className="hero" ref={root} id="top">
      <div className="wrap copy" data-in>
        <div className="m eyebrow"><span className="lime">[01]</span> {t("Built on", "基于")} <a className="lime" href="https://tapeout.net" target="_blank" rel="noreferrer">TapeOut</a>{t(" · live on X Layer", " 构建 · 已在 X Layer 上线")}</div>
        <h1 className="disp">{t(<>Your agent pays.<br /><span className="lime">[Circuits]</span> decide.</>, <>你的智能体付款。<br /><span className="lime">[电路]</span> 说了算。</>)}</h1>
        <div className="sub">
          {/* zh has no spaces at all: SplitText splits words on spaces into inline-blocks, and a long CJK run between two
              spaces would push the lines apart (so "on X Layer" reads 链上 here; the eyebrow above names X Layer) */}
          <p>{t(
            "Fusebox wires an AI agent's wallet through small logic circuits taped out on TapeOut. Every payment runs them on X Layer in the same transaction: it reaches the payee only if every fuse holds, and each fuse that checks it pays its designer.",
            "Fusebox把AI智能体的钱包接入一组在TapeOut上流片的小型逻辑电路。每笔付款都在同一笔链上交易里运行这些电路：只有每个保险丝都通过，钱才会到达收款方；每个检查它的保险丝都会向自己的设计者付费。",
          )}</p>
        </div>
        <div className="ctas">
          <a className="btn lime" href="/app/new" data-cursor={t("Enter", "进入")}><span className="roll"><span>{t("Wire up a wallet", "搭建一个钱包")}</span><span aria-hidden="true">{t("Wire up a wallet", "搭建一个钱包")}</span></span> <span className="k">→</span></a>
          <a className="btn line" href="/app/studio" data-cursor={t("Build", "搭建")}><span className="roll"><span>{t("Build a rule, no code", "零代码搭建规则")}</span><span aria-hidden="true">{t("Build a rule, no code", "零代码搭建规则")}</span></span> <span className="k">→</span></a>
        </div>
        <div className="lockup m"><span className="mute">{t("Built on", "基于")}</span><a href="https://tapeout.net" target="_blank" rel="noreferrer"><i aria-hidden="true" />TapeOut</a><span className="x" aria-hidden="true">×</span><a href="https://www.okx.com/xlayer" target="_blank" rel="noreferrer"><i aria-hidden="true" />X Layer</a></div>
      </div>
      <div className="fusewrap">
        <canvas className="fuse" ref={canvas} data-cursor={t("Blow it", "熔断它")} aria-label={t("A 3D glass fuse. Click it to blow it.", "一个 3D 玻璃保险丝。点击它，让它熔断。")} />
        <svg className="leaders" aria-hidden="true" />
        {TAGS.map((tg) => (
          <div className="tag" data-tag={tg.id} key={tg.id}><div className="box">{tg.title}<em>{tg.sub}</em></div></div>
        ))}
      </div>
      <div className="hint m">{t("Click the fuse to blow it", "点击保险丝，让它熔断")}</div>
      <div className="facts m mute" data-in>
        <div><b data-v="5">5</b>{t("TapeOut circuits on one line", "个 TapeOut 电路，串在一条线路上")}</div>
        <div><b data-v="246">246</b>{t("logic gates, taped out on TapeOut", "个逻辑门，在 TapeOut 上流片")}</div>
        <div><b data-v="1">1</b>{t("call per payment", "次调用完成一笔付款")}</div>
        <div><b data-v="0.005" data-dec="3">0.005</b>{t("USD₮0 per fully checked payment", "USD₮0，一笔付款完整检查的费用")}</div>
      </div>
      <div className="bigword" aria-hidden="true">Fusebox</div>
      <div className="flash" />
    </section>
  );
}
