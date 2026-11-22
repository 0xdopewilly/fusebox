"use client";
import { useRef } from "react";
import { gsap, useGSAP, reduced, whenNear } from "@/lib/gsap";
import Reg from "./Reg";
import { useLang } from "@/lib/i18n";

const Y = 70, X0 = 8, X1 = 872, FW = 126, NODE = 110;
const GAP = (X1 - X0 - NODE * 2 - FW * 4) / 5;
const XS = [0, 1, 2, 3].map((i) => X0 + NODE + GAP * (i + 1) + FW * i);
const BREAK = XS[1] + FW / 2;
type T = ReturnType<typeof useLang>["t"];
const fuses = (t: T) => [
  { name: "Daily Cap", meta: t("108 gates · 283k gas", "108 个门 · 283k gas"), end: t("Held", "通过"), fee: 0.001, bad: false },
  { name: "Payee Guard", meta: t("79 gates · 211k gas", "79 个门 · 211k gas"), end: t("Blew", "熔断"), fee: 0.001, bad: true },
  { name: "Breaker", meta: t("11 gates · 50k gas", "11 个门 · 50k gas"), end: t("Latched", "锁定"), fee: 0.0005, bad: true },
  { name: "Two of Three", meta: t("46 gates · 132k gas", "46 个门 · 132k gas"), end: t("Held", "通过"), fee: 0.002, bad: false },
];
const zig = (x: number) => `M${x + 22} ${Y}h12l5-9 7 18 7-18 7 18 7-18 5 9h${FW - 44 - 12 - 43}`;

function Wire() {
  const { t } = useLang();
  const FUSES = fuses(t);
  return (
    <svg viewBox="0 0 880 170" aria-label={t("The payment line: agent, four fuses in series, payee", "付款线路：智能体、四个串联的保险丝、收款方")}>
      <line x1={X0 + NODE} y1={Y} x2={X1 - NODE} y2={Y} stroke="#2e2e2c" strokeWidth="2.5" strokeDasharray="6 5" className="dash" />
      <line x1={X0 + NODE} y1={Y} x2={BREAK - 9} y2={Y} stroke="#bbfe2f" strokeWidth="2.5" className="current" />
      <g>
        <rect x={X0} y={Y - 28} width={NODE} height="56" fill="#0b0b0b" stroke="rgba(255,255,255,.2)" />
        <text x={X0 + 12} y={Y - 5} fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="15">ATLAS</text>
        <text x={X0 + 12} y={Y + 14} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".6">{t("AGENT KEY", "智能体密钥")}</text>
        <rect x={X1 - NODE} y={Y - 28} width={NODE} height="56" fill="#0b0b0b" stroke="rgba(255,255,255,.2)" className="payee-box" />
        <text x={X1 - NODE + 12} y={Y - 5} fill="#f2f2ee" fontFamily="var(--f-display)" fontWeight="800" fontSize="15">{t("PAYEE", "收款方")}</text>
        <text x={X1 - NODE + 12} y={Y + 14} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".6">0x9f3e…c41a</text>
        <text x={X1 - NODE + 6} y={Y + 48} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".6" className="recv">{t("0.000000 RECEIVED", "0.000000 已到账")}</text>
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
            <text x={x} y={Y + 68} fill="#80807c" fontFamily="var(--f-mono)" fontWeight="600" fontSize="10.5" letterSpacing=".8" className="st" data-end={f.end.toUpperCase()} data-c={c}>{t("WAITING", "等待中")}</text>
            <text x={x} y={Y + 86} fill="#8d8d89" fontFamily="var(--f-mono)" fontSize="10" letterSpacing=".4">{f.meta.toUpperCase()}</text>
            <rect x={cx - 4} y={Y + 96} width="8" height="8" fill="#bbfe2f" className="packet" opacity="0" />
          </g>
        );
      })}
      <text x={BREAK - 62} y={Y - 44} fill="#ff5232" fontFamily="var(--f-mono)" fontWeight="600" fontSize="10.5" letterSpacing=".8" className="why" opacity="0">{t("✕ NOT A SAVED PAYEE", "✕ 不是已保存的收款方")}</text>
      <rect x={X0 + NODE - 5} y={Y - 5} width="10" height="10" fill="#fff" className="pulse" style={{ filter: "drop-shadow(0 0 6px #bbfe2f) drop-shadow(0 0 14px #bbfe2f)" }} />
    </svg>
  );
}

export default function How() {
  const root = useRef<HTMLElement>(null);
  const { t } = useLang();
  const FUSES = fuses(t);
  const STEPS = [
    [t("The agent asks to pay", "智能体发起付款"), t("Payee, amount and a one-line reason. That's all it gets to say.", "收款方、金额和一句理由。它能说的就这些。")],
    [t("Each fuse checks it on X Layer", "每个保险丝在 X Layer 上检查"), t("Every fuse is a circuit of 11 to 108 logic gates, taped out on TapeOut. All of them run in the same call, and each answers yes or no.", "每个保险丝都是一个由 11 到 108 个逻辑门组成、在 TapeOut 上流片的电路。它们在同一次调用中全部运行，各自回答“是”或“否”。")],
    [t("One no stops the payment", "一个“否”就拦下付款"), t("The wallet records which fuse said no and why. A blown Breaker stays blown until you reset it.", "钱包会记录是哪个保险丝说了“否”，以及原因。Breaker 一旦熔断，就会保持熔断，直到你重置。")],
    [t("The designers are paid", "设计者获得报酬"), t("Each fuse that decided earns its fee in USD₮0, the no's included.", "每个做出决策的保险丝都以 USD₮0 赚取费用，说“否”的也算。")],
  ];
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
      const WAIT = [t("WAITING", "等待中"), "#80807c"], CHECK = [t("CHECKING", "检查中"), "#f2f2ee"], HELD = [t("HELD", "通过"), "#bbfe2f"], BAD = (w: string) => [w, "#ff5232"];
      const SCHEDULE: [number, number, string[]][] = [[1.05, 1.33, HELD], [1.35, 1.63, BAD(t("BLEW", "熔断"))], [1.35, 2.11, BAD(t("LATCHED", "锁定"))], [1.35, 1.88, HELD]];
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
        .to(amount, { duration: 0.45, scrambleText: { text: "2.500000 USD₮0", chars: "0123456789", speed: 0.4 } }, 0.05)
        .to(to, { duration: 0.4, scrambleText: { text: "0x9f3e…c41a", chars: "0123456789abcdef", speed: 0.4 } }, 0.25)
        .to(memo, { duration: 0.5, text: { value: t("“Urgent refund for a customer, per support ticket”", "“客服工单要求：紧急为客户退款”") } }, 0.4)
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
      <div className="wrap sh"><div className="m lime" data-scr>[03]</div><div className="m mute" data-scr>{t("How it works", "工作原理")}</div></div>
      <div className="wrap body">
        <div className="left">
          <h2 className="disp">{t(<>One no, and <span className="lime">nothing moves.</span></>, <>一票否决，<span className="lime">分文不动。</span></>)}</h2>
          <ol className="steps">
            {STEPS.map(([h, p], i) => (
              <li key={h}><span className="bar" /><span className="n">0{i + 1}</span><h3>{h}</h3><div className="p"><p>{p}</p></div></li>
            ))}
          </ol>
        </div>
        <div className="right">
          <div className="panel">
            <div className="ph m"><span className="mute">{t("Payment request · wallet Atlas", "付款请求 · 钱包 Atlas")}</span><span className="mute">14:02:07 UTC</span></div>
            <div className="req m mute">
              <div>{t("Pay", "支付")}<b data-f="amount">&nbsp;</b></div>
              <div>{t("To", "收款方")}<b data-f="to">&nbsp;</b></div>
              <div>{t("Memo", "备注")}<div className="memo" data-f="memo" /></div>
            </div>
            <div className="wireline" tabIndex={0} role="region" aria-label={t("The payment line, from the agent through four fuses to the payee", "付款线路：从智能体出发，经过四个保险丝，到达收款方")}><Wire /></div>
            <div className="payouts m mute">
              {FUSES.map((f) => <div key={f.name}>{t(<>{f.name} designer</>, <>{f.name} 设计者</>)}<b>+0.000000</b></div>)}
            </div>
            <div className="verdict m"><span className="v">{t("Stopped at Payee Guard. Nothing moved.", "在 Payee Guard 处被拦截，分文未动。")}</span><span className="mute">{t(<>4 checks · <span data-f="total">0.000000</span> USD₮0 to designers</>, <>4 次检查 · <span data-f="total">0.000000</span> USD₮0 付给设计者</>)}</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
