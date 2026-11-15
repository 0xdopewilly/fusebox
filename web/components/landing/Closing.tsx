"use client";
import { useRef } from "react";
import { gsap, SplitText, useGSAP, reduced } from "@/lib/gsap";
import Reg from "./Reg";

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
  useGSAP(() => {
    const el = root.current!;
    const stop = startRain(el.querySelector<HTMLCanvasElement>(".rain")!, el);
    const hot = el.querySelector<HTMLElement>(".word-hot")!;
    const spot = (e: PointerEvent) => { const r = hot.getBoundingClientRect(); hot.style.setProperty("--mx", `${e.clientX - r.left}px`); hot.style.setProperty("--my", `${e.clientY - r.top}px`); };
    el.addEventListener("pointermove", spot);
    if (!reduced()) {
      const h = SplitText.create(el.querySelector("h2 .txt")!, { type: "chars", charsClass: "char" });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 65%" } });
      tl.from(h.chars, { yPercent: 120, rotate: 6, duration: 1.1, stagger: 0.035, ease: "snap" })
        .from(el.querySelector("h2 .dot"), { scale: 0, duration: 0.6, ease: "back.out(3)" }, 0.5)
        .from(el.querySelectorAll(".row2 > *"), { y: 30, autoAlpha: 0, duration: 1, stagger: 0.1 }, 0.4)
        .from(el.querySelectorAll(".foot > div"), { y: 20, autoAlpha: 0, duration: 0.9, stagger: 0.07 }, 0.6)
        .from(el.querySelector(".bigword"), { yPercent: 40, duration: 1.6 }, 0.3);
      gsap.set(el.querySelector("h2"), { overflow: "clip" });
    }
    return () => { stop(); el.removeEventListener("pointermove", spot); };
  }, []);
  return (
    <section className="cta reg" ref={root}>
      <Reg />
      <div className="wrap">
        <div className="m" style={{ marginBottom: 34 }}><span className="lime" data-scr>[07]</span> <span className="mute" data-scr>Get started</span></div>
        <h2 className="disp"><span className="txt">Wire it up</span><span className="dot" /></h2>
        <div className="row2">
          <p>Give your agent a wallet with fuses on X Layer, or tape out a fuse of your own and earn from every decision it makes.</p>
          <div className="ctas">
            <a className="btn lime" href="/app" data-cursor="Enter"><span className="roll"><span>Open the app</span><span aria-hidden="true">Open the app</span></span> <span className="k">→</span></a>
            <a className="btn" href="#build" data-cursor="Read"><span className="roll"><span>Read the docs</span><span aria-hidden="true">Read the docs</span></span></a>
          </div>
        </div>
      </div>
      <canvas className="rain" aria-hidden="true" />
      <div className="foot m mute">
        <div>Fusebox<a href="https://www.okx.com/xlayer" target="_blank" rel="noreferrer">Built on X Layer</a><a href="https://tapeout.net" target="_blank" rel="noreferrer">Circuits on TapeOut</a></div>
        <div>Product<a href="/app">Wallet</a><a href="/app/market">Fuse market</a><a href="#designers">Designers</a></div>
        <div>Developers<a href="#build">Docs</a><a href="https://github.com/0xdopewilly" target="_blank" rel="noreferrer">GitHub</a><a href="#fuses">Contracts</a></div>
        <div>Proof<a href="https://www.oklink.com/xlayer/address/0x0Db0457715a6445D8a65F820d717a6B39Be66800" target="_blank" rel="noreferrer">Atlas wallet ↗</a><a href="https://www.oklink.com/xlayer/address/0x852a278322667BB86A2665a38CbC5Bfd551B20d7" target="_blank" rel="noreferrer">Fuse registry ↗</a><a href="https://www.oklink.com/xlayer/address/0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355" target="_blank" rel="noreferrer">Circuits #15–18 ↗</a></div>
      </div>
      <div className="bigword" aria-hidden="true">Fusebox</div>
      <div className="word-hot" aria-hidden="true">Fusebox</div>
    </section>
  );
}
