"use client";
import { useRef } from "react";
import { gsap, SplitText, useGSAP, reduced, whenNear } from "@/lib/gsap";
import Reg from "./Reg";
import { useLang } from "@/lib/i18n";

/** Falling truth-table bits; the ones near the pointer light up lime. */
function startRain(canvas: HTMLCanvasElement, host: HTMLElement) {
  const ctx = canvas.getContext("2d")!;
  let W = 0, H = 0, cols: { y: number; v: number; bits: string[] }[] = [];
  const CW = 31, LH = 18;
  const mouse = { x: -999, y: -999 };
  const resize = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.ceil(W / CW);
    cols = Array.from({ length: n }, () => ({ y: Math.random() * H, v: 8 + Math.random() * 22, bits: Array.from({ length: Math.ceil(H / LH) + 2 }, () => (Math.random() > 0.5 ? "1" : "0")) }));
  };
  resize();
  const move = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
  host.addEventListener("pointermove", move);
  host.addEventListener("pointerleave", () => { mouse.x = mouse.y = -999; });
  let last = performance.now(), raf = 0, on = false, acc = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    if (acc > 1 / 30) {
      acc = 0;
      ctx.clearRect(0, 0, W, H);
      ctx.font = "500 12px var(--f-mono), monospace";
      cols.forEach((c, i) => {
        c.y = (c.y + c.v * (1 / 30)) % LH;
        const x = i * CW;
        c.bits.forEach((b, k) => {
          const y = k * LH + c.y - LH;
          const d = Math.hypot(mouse.x - x, mouse.y - y);
          if (d < 140) { ctx.fillStyle = `rgba(187,254,47,${(1 - d / 140) * 0.9 + 0.08})`; } else ctx.fillStyle = "#1c1c1a";
          ctx.fillText(b, x, y);
        });
        if (Math.random() < 0.02) c.bits[(Math.random() * c.bits.length) | 0] = Math.random() > 0.5 ? "1" : "0";
      });
    }
    if (on) raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(([e]) => { on = e.isIntersecting; if (on) { last = performance.now(); raf = requestAnimationFrame(frame); } else cancelAnimationFrame(raf); });
  io.observe(canvas);
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  return () => { io.disconnect(); ro.disconnect(); cancelAnimationFrame(raf); host.removeEventListener("pointermove", move); };
}

export default function Closing() {
  const root = useRef<HTMLElement>(null);
  const { t } = useLang();
  useGSAP((_, contextSafe) => {
    // below the fold: set this section up only as it nears the viewport, so hydration stays light
    let undo: void | (() => void);
    const cancel = whenNear(root.current, contextSafe!(() => { undo = (() => {
      const el = root.current!;
      const stop = startRain(el.querySelector<HTMLCanvasElement>(".rain")!, el);
      const hot = el.querySelector<HTMLElement>(".word-hot")!;
      const spot = (e: PointerEvent) => { const r = hot.getBoundingClientRect(); hot.style.setProperty("--mx", `${e.clientX - r.left}px`); hot.style.setProperty("--my", `${e.clientY - r.top}px`); };
      el.addEventListener("pointermove", spot);
      if (!reduced()) {
        const h = SplitText.create(el.querySelector("h2 .txt")!, { type: "chars", charsClass: "char", aria: "none" }); // the h2 carries the label
        const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 65%" } });
        tl.from(h.chars, { yPercent: 120, rotate: 6, duration: 1.1, stagger: 0.035, ease: "snap" })
          .from(el.querySelector("h2 .dot"), { scale: 0, duration: 0.6, ease: "back.out(3)" }, 0.5)
          .from(el.querySelectorAll(".row2 > *"), { y: 30, autoAlpha: 0, duration: 1, stagger: 0.1 }, 0.4)
          .from(el.querySelectorAll(".foot > div"), { y: 20, autoAlpha: 0, duration: 0.9, stagger: 0.07 }, 0.6)
          .from(el.querySelector(".bigword"), { yPercent: 40, duration: 1.6 }, 0.3);
        gsap.set(el.querySelector("h2"), { overflow: "clip" });
      }
      return () => { stop(); el.removeEventListener("pointermove", spot); };
    })(); }));
    return () => { cancel(); if (typeof undo === "function") undo(); };
  }, []);
  return (
    <section className="cta reg" ref={root}>
      <Reg />
      <div className="wrap">
        <div className="m" style={{ marginBottom: 34 }}><span className="lime" data-scr>[10]</span> <span className="mute" data-scr>{t("Get started", "开始使用")}</span></div>
        <h2 className="disp" aria-label={t("Wire it up", "立即接入")}><span className="txt" aria-hidden="true">{t("Wire it up", "立即接入")}</span><span className="dot" aria-hidden="true" /></h2>
        <div className="row2">
          <p>{t("Give your agent a wallet with fuses on X Layer, or tape out a fuse of your own and earn from every decision it makes.", "在 X Layer 上给你的智能体配一个带保险丝的钱包，或者流片一个你自己的保险丝，从它做出的每次决策中赚取收入。")}</p>
          <div className="ctas">
            <a className="btn lime" href="/app" data-cursor={t("Enter", "进入")}><span className="roll"><span>{t("Open the app", "打开应用")}</span><span aria-hidden="true">{t("Open the app", "打开应用")}</span></span> <span className="k">→</span></a>
            <a className="btn" href="/docs" data-cursor={t("Read", "阅读")}><span className="roll"><span>{t("Read the docs", "阅读文档")}</span><span aria-hidden="true">{t("Read the docs", "阅读文档")}</span></span></a>
          </div>
        </div>
      </div>
      <canvas className="rain" aria-hidden="true" />
      <div className="foot m mute">
        <div>{t("Built on", "构建于")}<a href="https://tapeout.net" target="_blank" rel="noreferrer">TapeOut ↗</a><a href="https://x.com/TapeOutWorld" target="_blank" rel="noreferrer">@TapeOutWorld ↗</a><a href="https://www.okx.com/xlayer" target="_blank" rel="noreferrer">X Layer ↗</a></div>
        <div>{t("Product", "产品")}<a href="/app">{t("Open the app", "打开应用")}</a><a href="/app/market">{t("Fuse market", "Fuse Market 保险丝市场")}</a><a href="#designers">{t("Designers", "设计者")}</a><a href="https://youtu.be/vcopkuNdhkc" target="_blank" rel="noreferrer">{t("Watch the demo ↗", "观看演示 ↗")}</a><a href="https://x.com/fuseboxhq" target="_blank" rel="noreferrer">@fuseboxhq ↗</a></div>
        <div>{t("Developers", "开发者")}<a href="/docs">{t("Docs", "文档")}</a><a href="https://github.com/0xdopewilly/fusebox" target="_blank" rel="noreferrer">GitHub</a><a href="/onchain">{t("DeWEB edition", "DeWEB 版")}</a><a href="/docs#contracts">{t("Contracts", "合约")}</a><a href="/app/status">{t("Status", "状态")}</a></div>
        <div>{t("Proof", "链上证明")}<a href="https://www.oklink.com/xlayer/address/0x0Db0457715a6445D8a65F820d717a6B39Be66800" target="_blank" rel="noreferrer">{t("Atlas wallet ↗", "Atlas 钱包 ↗")}</a><a href="https://www.oklink.com/xlayer/address/0x2583928546a614A2fD993B5C106ED9aD0E781AB6" target="_blank" rel="noreferrer">{t("Fuse registry ↗", "保险丝注册表 ↗")}</a><a href="https://www.oklink.com/xlayer/address/0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355" target="_blank" rel="noreferrer">{t("TapeOut circuits ↗", "TapeOut 电路 ↗")}</a></div>
      </div>
      <div className="bigword" aria-hidden="true">Fusebox</div>
      <div className="word-hot" aria-hidden="true">Fusebox</div>
    </section>
  );
}
