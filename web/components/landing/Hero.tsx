"use client";
import { useRef } from "react";
import { gsap, SplitText, ScrollTrigger, useGSAP, introDone, reduced } from "@/lib/gsap";
import { FuseScene } from "./FuseScene";

const TAGS = [
  { id: "fil", title: "Filament", sub: "a NAND circuit on X Layer", dx: -40, dy: -128 },
  { id: "cap", title: "End cap", sub: "X Layer · chain 196", dx: -120, dy: 118 },
  { id: "blow", title: "Blows on", sub: "a stranger payee", dx: 70, dy: 150 },
];

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useGSAP(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const lead = el.querySelector<SVGSVGElement>(".leaders")!;
    const tagEls = TAGS.map((t) => el.querySelector<HTMLElement>(`[data-tag="${t.id}"]`)!);
    const flash = el.querySelector<HTMLElement>(".flash")!;
    let hot = false;

    // ---- 3D fuse ----
    const scene = new FuseScene(cv, {
      onFrame: (a) => {
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
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? scene.start() : scene.stop()), { rootMargin: "100px" });
    io.observe(cv);
    const ro = new ResizeObserver(() => scene.resize());
    ro.observe(cv);
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      scene.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    };
    el.addEventListener("pointermove", onMove);
    const onClick = () => scene.blow();
    cv.addEventListener("click", onClick);

    // ---- entrance ----
    const h1 = el.querySelector("h1")!;
    const lines = SplitText.create(h1, { type: "lines,chars", linesClass: "line-mask", charsClass: "char", mask: "lines" });
    const sub = SplitText.create(el.querySelector(".sub p")!, { type: "lines", linesClass: "line-mask", mask: "lines" });
    const circuits = Array.from(h1.querySelectorAll(".lime .char"));
    const brackets = circuits.filter((c) => c.textContent === "[" || c.textContent === "]");
    const facts = Array.from(el.querySelectorAll<HTMLElement>(".facts b"));
    gsap.set([...Array.from(el.querySelectorAll("[data-in]")), el.querySelector(".bigword")], { autoAlpha: 1 });

    const tl = gsap.timeline({ paused: true });
    if (reduced()) {
      scene.reveal.v = 1.01;
    } else {
      tl.from(document.querySelectorAll(".grid i"), { scaleY: 0, duration: 1.4, stagger: 0.06, ease: "wire" }, 0)
        .from(el.querySelector(".eyebrow"), { scrambleText: { text: "[01] Guardrails that run on X Layer, not on trust", chars: "01", speed: 0.5 }, duration: 1.2 }, 0.1)
        .from(lines.chars, { yPercent: 115, duration: 1.1, stagger: 0.016, ease: "snap" }, 0.15)
        .from(brackets[0], { x: -70, duration: 0.9, ease: "back.out(2.2)" }, 0.6)
        .from(brackets[1], { x: 70, duration: 0.9, ease: "back.out(2.2)" }, 0.6)
        .to(circuits.filter((c) => !brackets.includes(c)), { opacity: 0.15, duration: 0.05, repeat: 5, yoyo: true, stagger: { each: 0.04, from: "random" }, ease: "none" }, 0.95)
        .from(sub.lines, { yPercent: 105, duration: 1, stagger: 0.07 }, 0.55)
        .from(el.querySelectorAll(".ctas > *"), { y: 24, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.75)
        .to(scene.reveal, { v: 1.01, duration: 1.8, ease: "power2.inOut" }, 0.35)
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
      io.disconnect(); ro.disconnect();
      el.removeEventListener("pointermove", onMove);
      cv.removeEventListener("click", onClick);
      scene.dispose();
      ScrollTrigger.refresh();
    };
  }, []);

  return (
    <section className="hero" ref={root} id="top">
      <div className="wrap copy" data-in>
        <div className="m eyebrow"><span className="lime">[01]</span> Guardrails that run on X Layer, not on trust</div>
        <h1 className="disp">Your agent pays.<br /><span className="lime">[Circuits]</span> decide.</h1>
        <div className="sub">
          <p>Fusebox wires an AI agent&apos;s wallet through small logic circuits taped out on X Layer. A payment reaches the payee only if every fuse holds, and each fuse that checks it pays its designer.</p>
        </div>
        <div className="ctas">
          <a className="btn lime" href="/app" data-cursor="Enter"><span className="roll"><span>Wire up a wallet</span><span aria-hidden="true">Wire up a wallet</span></span> <span className="k">→</span></a>
          <a className="btn line" href="#designers" data-cursor="Earn"><span className="roll"><span>Sell a fuse</span><span aria-hidden="true">Sell a fuse</span></span> <span className="k">→</span></a>
        </div>
      </div>
      <div className="fusewrap">
        <canvas className="fuse" ref={canvas} data-cursor="Blow it" aria-label="A 3D glass fuse. Click it to blow it." />
        <svg className="leaders" aria-hidden="true" />
        {TAGS.map((t) => (
          <div className="tag" data-tag={t.id} key={t.id}><div className="box">{t.title}<em>{t.sub}</em></div></div>
        ))}
      </div>
      <div className="hint m">Click the fuse to blow it</div>
      <div className="facts m mute" data-in>
        <div><b data-v="4">4</b>fuses on one line</div>
        <div><b data-v="244">244</b>logic gates, all on-chain</div>
        <div><b data-v="1">1</b>call per payment</div>
        <div><b data-v="0.0045" data-dec="4">0.0045</b>USDT0 per fully checked payment</div>
      </div>
      <div className="bigword" aria-hidden="true">Fusebox</div>
      <div className="flash" />
    </section>
  );
}
