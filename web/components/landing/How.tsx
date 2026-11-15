"use client";
import { useRef } from "react";
import { gsap, useGSAP, reduced, whenNear } from "@/lib/gsap";
import Reg from "./Reg";

const Y = 70, X0 = 8, X1 = 872, FW = 126, NODE = 110;
const GAP = (X1 - X0 - NODE * 2 - FW * 4) / 5;
const XS = [0, 1, 2, 3].map((i) => X0 + NODE + GAP * (i + 1) + FW * i);
const BREAK = XS[1] + FW / 2;
const FUSES = [
  { name: "Daily Cap", meta: "108 gates · 283k gas", end: "Held", fee: 0.001, bad: false },
  { name: "Payee Guard", meta: "79 gates · 211k gas", end: "Blew", fee: 0.001, bad: true },
  { name: "Breaker", meta: "11 gates · 50k gas", end: "Latched", fee: 0.0005, bad: true },
  { name: "Two of Three", meta: "46 gates · 132k gas", end: "Held", fee: 0.002, bad: false },
];
const STEPS = [
  ["The agent asks to pay", "Payee, amount and a one-line reason. That's all it gets to say."],
  ["Each fuse checks it on X Layer", "Every fuse is a circuit of 11 to 108 logic gates, taped out on TapeOut. All of them run in the same call, and each answers yes or no."],
  ["One no stops the payment", "The wallet records which fuse said no and why. A blown Breaker stays blown until you reset it."],
  ["The designers are paid", "Each fuse that decided earns its fee in USDT0, the no's included."],
];
const zig = (x: number) => `M${x + 22} ${Y}h12l5-9 7 18 7-18 7 18 7-18 5 9h${FW - 44 - 12 - 43}`;

function Wire() {
  return (
    <svg viewBox="0 0 880 170" aria-label="The payment line: agent, four fuses in series, payee">
      <line x1={X0 + NODE} y1={Y} x2={X1 - NODE} y2={Y} stroke="#2e2e2c" strokeWidth="2.5" strokeDasharray="6 5" className="dash" />
      <line x1={X0 + NODE} y1={Y} x2={BREAK - 9} y2={Y} stroke="#bbfe2f" strokeWidth="2.5" className="current" />
      <g>
        <rect x={X0} y={Y - 28} width={NODE} height="56" fill="#0b0b0b" stroke="rgba(255,255,255,.2)" />
        <text x={X0 + 12} y={Y - 5} fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="15">ATLAS</text>
        <text x={X0 + 12} y={Y + 14} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".6">AGENT KEY</text>
        <rect x={X1 - NODE} y={Y - 28} width={NODE} height="56" fill="#0b0b0b" stroke="rgba(255,255,255,.2)" className="payee-box" />
        <text x={X1 - NODE + 12} y={Y - 5} fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="15">PAYEE</text>
        <text x={X1 - NODE + 12} y={Y + 14} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".6">0x9f3e…c41a</text>
        <text x={X1 - NODE + 6} y={Y + 48} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".6" className="recv">0.000000 RECEIVED</text>
      </g>
      {FUSES.map((f, i) => {
        const x = XS[i], cx = x + FW / 2, c = f.bad ? "#ff5232" : "#bbfe2f";
        return (
          <g key={f.name} className={`fz-${i}`}>
            <rect x={x} y={Y - 22} width="22" height="44" fill="#d9d9d4" /><rect x={x + FW - 22} y={Y - 22} width="22" height="44" fill="#d9d9d4" />
            <rect x={x + 3} y={Y - 22} width="2" height="44" fill="#9a9a96" /><rect x={x + FW - 5} y={Y - 22} width="2" height="44" fill="#9a9a96" />
            <rect x={x + 22} y={Y - 16} width={FW - 44} height="32" fill="#0b0b0b" stroke="rgba(255,255,255,.35)" className="glass" />
            <path d={zig(x)} fill="none" stroke="#3a3a38" strokeWidth="2" className="fil-dim" />
            <path d={zig(x)} fill="none" stroke="#bbfe2f" strokeWidth="2" className="fil-lit" />
            {f.bad && (
              <g className="broken" opacity="0">
                <path d={`M${x + 22} ${Y}h12l5-9 6 15`} fill="none" stroke={c} strokeWidth="2" />
                <path d={`M${cx + 10} ${Y + 6}l5-15 7 18 5-9h${FW - 44 - 58}`} fill="none" stroke="#5a5a57" strokeWidth="2" />
                <g stroke={c} strokeWidth="1.6" className="sparks">
                  <line x1={cx} y1={Y - 2} x2={cx - 6} y2={Y - 30} /><line x1={cx + 3} y1={Y - 2} x2={cx + 14} y2={Y - 28} />
                  <line x1={cx + 2} y1={Y} x2={cx + 22} y2={Y - 12} /><line x1={cx - 1} y1={Y} x2={cx - 20} y2={Y - 16} />
                </g>
              </g>
            )}
            <text x={x} y={Y + 50} fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="14">{f.name.toUpperCase()}</text>
            <text x={x} y={Y + 68} fill="#80807c" fontFamily="var(--f-mono)" fontWeight="600" fontSize="10.5" letterSpacing=".8" className="st" data-end={f.end.toUpperCase()} data-c={c}>WAITING</text>
            <text x={x} y={Y + 86} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".4">{f.meta.toUpperCase()}</text>
            <rect x={cx - 4} y={Y + 96} width="8" height="8" fill="#bbfe2f" className="packet" opacity="0" />
          </g>
        );
      })}
      <text x={BREAK - 62} y={Y - 44} fill="#ff5232" fontFamily="var(--f-mono)" fontWeight="600" fontSize="10.5" letterSpacing=".8" className="why" opacity="0">✕ NOT A SAVED PAYEE</text>
      <rect x={X0 + NODE - 5} y={Y - 5} width="10" height="10" fill="#fff" className="pulse" style={{ filter: "drop-shadow(0 0 6px #bbfe2f) drop-shadow(0 0 14px #bbfe2f)" }} />
    </svg>
  );
}

export default function How() {
  const root = useRef<HTMLElement>(null);
  useGSAP((_, contextSafe) => {
    // below the fold: set this section up only as it nears the viewport, so hydration stays light
    let undo: void | (() => void);
    const cancel = whenNear(root.current, contextSafe!(() => { undo = (() => {
      const el = root.current!;
      const q = <T extends Element = Element>(s: string) => el.querySelector<T>(s)!;
      const qa = (s: string) => Array.from(el.querySelectorAll(s));
      const lis = qa(".steps li") as HTMLElement[];
      const setStep = (p: number) => {
        const i = Math.min(3, Math.floor(p * 4 + 0.0001));
        lis.forEach((li, k) => {
          li.classList.toggle("on", k === i);
          const local = k < i ? 1 : k > i ? 0 : p * 4 - i;
          gsap.set(li.querySelector(".bar"), { scaleX: k === i ? local : 0 });
        });
      };
      const st = (i: number) => q<SVGTextElement>(`.fz-${i} .st`);
      // fuse statuses are a pure function of the timeline's time, so scrubbing backwards undoes them
      const WAIT = ["WAITING", "#80807c"], CHECK = ["CHECKING", "#f2f2ee"], HELD = ["HELD", "#bbfe2f"], BAD = (w: string) => [w, "#ff5232"];
      const SCHEDULE: [number, number, string[]][] = [[1.05, 1.33, HELD], [1.35, 1.63, BAD("BLEW")], [1.35, 2.11, BAD("LATCHED")], [1.35, 1.88, HELD]];
      const renderStatus = (t: number) => SCHEDULE.forEach(([a, b, end], i) => {
        const [txt, col] = t < a ? WAIT : t < b ? CHECK : end;
        if (st(i).textContent !== txt) { st(i).textContent = txt; st(i).setAttribute("fill", col); }
      });

      // initial state
      gsap.set(qa(".fil-lit"), { drawSVG: "0%" });
      gsap.set(q(".current"), { drawSVG: "0%" });
      gsap.set(q(".pulse"), { x: 0, autoAlpha: 0, transformOrigin: "center" });
      gsap.set(qa(".sparks line"), { drawSVG: "0%" });
      const amount = q<HTMLElement>("[data-f=amount]"), to = q<HTMLElement>("[data-f=to]"), memo = q<HTMLElement>("[data-f=memo]");
      const pay = qa(".payouts b") as HTMLElement[];
      const total = q<HTMLElement>("[data-f=total]");

      const tl = gsap.timeline({ defaults: { ease: "none" }, onUpdate: () => renderStatus(tl.time()) });
      // 1 · the request
      tl.addLabel("s1", 0)
        .to(amount, { duration: 0.45, scrambleText: { text: "2.500000 USDT0", chars: "0123456789", speed: 0.4 } }, 0.05)
        .to(to, { duration: 0.4, scrambleText: { text: "0x9f3e…c41a", chars: "0123456789abcdef", speed: 0.4 } }, 0.25)
        .to(memo, { duration: 0.5, text: { value: "“Urgent refund for a customer, per support ticket”" } }, 0.4)
        .to(q(".pulse"), { autoAlpha: 1, duration: 0.1 }, 0.9);
      // 2 · current runs, fuses check
      tl.addLabel("s2", 1)
        .to(q(".pulse"), { x: XS[0] + FW / 2 - (X0 + NODE), duration: 0.3 }, 1)
        .to(q(".current"), { drawSVG: `0% ${(((XS[0] + FW / 2) - (X0 + NODE)) / (BREAK - 9 - (X0 + NODE))) * 100}%`, duration: 0.3 }, 1)
        .to(q(".fz-0 .fil-lit"), { drawSVG: "100%", duration: 0.2 }, 1.2)
        .to(q(".pulse"), { x: BREAK - (X0 + NODE), duration: 0.3 }, 1.3)
        .to(q(".current"), { drawSVG: "0% 100%", duration: 0.3 }, 1.3)
        .to(q(".fz-1 .fil-lit"), { drawSVG: "0% 48%", duration: 0.12 }, 1.5)
        .set(q(".fz-1 .fil-lit"), { autoAlpha: 0 }, 1.62)
        .set(q(".fz-1 .fil-dim"), { autoAlpha: 0 }, 1.62)
        .to(q(".fz-1 .broken"), { opacity: 1, duration: 0.02 }, 1.62)
        .to(qa(".fz-1 .sparks line"), { drawSVG: "100%", duration: 0.12, stagger: 0.02 }, 1.62)
        .to(q(".pulse"), { scale: 3, autoAlpha: 0, duration: 0.12 }, 1.62)
        .to(q(".why"), { opacity: 1, duration: 0.08 }, 1.64)
        .to(q(".fz-3 .fil-lit"), { drawSVG: "100%", opacity: 0.45, duration: 0.2 }, 1.7);
      // 3 · nothing moves; the breaker latches
      tl.addLabel("s3", 2)
        .set(q(".fz-2 .fil-dim"), { autoAlpha: 0 }, 2.1)
        .to(q(".fz-2 .broken"), { opacity: 1, duration: 0.02 }, 2.1)
        .to(qa(".fz-2 .sparks line"), { drawSVG: "100%", duration: 0.12, stagger: 0.02 }, 2.1)
        .to(q(".verdict"), { clipPath: "inset(0 0% 0 0)", duration: 0.35, ease: "power3.out" }, 2.3)
        .to(q(".recv"), { fill: "#ff5232", duration: 0.04, repeat: 5, yoyo: true }, 2.35)
        .to(q(".dash"), { strokeDashoffset: -44, duration: 0.6 }, 2.2);
      // 4 · designers are paid
      tl.addLabel("s4", 3);
      [0, 1, 2, 3].forEach((i) => {
        tl.fromTo(q(`.fz-${i} .packet`), { opacity: 1, y: 0 }, { y: 40, opacity: 0, duration: 0.3, ease: "power2.in" }, 3.1 + i * 0.08);
        const o = { v: 0 };
        tl.to(o, { v: [0.001, 0.001, 0.0005, 0.002][i], duration: 0.35, onUpdate: () => { pay[i].textContent = "+" + o.v.toFixed(6); } }, 3.3 + i * 0.08);
      });
      const tot = { v: 0 };
      tl.to(tot, { v: 0.0045, duration: 0.5, onUpdate: () => { total.textContent = tot.v.toFixed(6); } }, 3.35).to({}, { duration: 0.3 });

      const mm = gsap.matchMedia();
      mm.add("(min-width: 900px)", () => {
        if (reduced()) { tl.progress(1); setStep(0.99); return; }
        gsap.timeline({ scrollTrigger: { trigger: q(".body"), start: "top 96px", end: "+=2600", pin: true, scrub: 0.6, anticipatePin: 1, onUpdate: (s) => setStep(s.progress) } }).add(tl);
      });
      mm.add("(max-width: 899px)", () => {
        // phones: the line is wider than the screen, so the view pans with the current, fuse by fuse
        const wl = q<HTMLElement>(".wireline");
        const at = (xSvg: number) => () => Math.max(0, (xSvg / 880) * wl.scrollWidth - wl.clientWidth / 2);
        const pan = (xSvg: number, t: number, d = 0.3) => tl.to(wl, { scrollLeft: at(xSvg), duration: d, ease: "power2.inOut" }, t);
        pan(XS[0] + FW / 2, 0.95); pan(BREAK, 1.3); pan(XS[2] + FW / 2, 1.95, 0.25); pan(X1 - NODE / 2, 2.25, 0.35); pan(XS[3] + FW / 2, 2.95, 0.3); pan(0, 3.55, 0.4);
        tl.pause(0);
        tl.eventCallback("onUpdate", () => { renderStatus(tl.time()); setStep(tl.progress()); });
        gsap.timeline({ scrollTrigger: { trigger: q(".panel"), start: "top 70%", once: true } }).add(() => { tl.timeScale(0.55).play(); });
      });
      setStep(0);
    })(); }));
    return () => { cancel(); if (typeof undo === "function") undo(); };
  }, []);

  return (
    <section className="how reg" ref={root} id="how">
      <Reg />
      <div className="wrap sh"><div className="m lime" data-scr>[03]</div><div className="m mute" data-scr>How it works</div></div>
      <div className="wrap body">
        <div className="left">
          <h2 className="disp">One no, and <span className="lime">nothing moves.</span></h2>
          <ol className="steps">
            {STEPS.map(([h, p], i) => (
              <li key={h}><span className="bar" /><span className="n">0{i + 1}</span><h3>{h}</h3><div className="p"><p>{p}</p></div></li>
            ))}
          </ol>
        </div>
        <div className="right">
          <div className="panel">
            <div className="ph m"><span className="mute">Payment request · wallet Atlas</span><span className="mute">14:02:07 UTC</span></div>
            <div className="req m mute">
              <div>Pay<b data-f="amount">&nbsp;</b></div>
              <div>To<b data-f="to">&nbsp;</b></div>
              <div>Memo<div className="memo" data-f="memo" /></div>
            </div>
            <div className="wireline" tabIndex={0} role="region" aria-label="The payment line, from the agent through four fuses to the payee"><Wire /></div>
            <div className="payouts m mute">
              {FUSES.map((f) => <div key={f.name}>{f.name} designer<b>+0.000000</b></div>)}
            </div>
            <div className="verdict m"><span className="v">Stopped at Payee Guard. Nothing moved.</span><span className="mute">4 checks · <span data-f="total">0.000000</span> USDT0 to designers</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
