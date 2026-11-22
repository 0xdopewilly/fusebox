"use client";
import { useRef, useState } from "react";
import { gsap, ScrollTrigger, useGSAP, reduced, whenNear } from "@/lib/gsap";
import Reg from "./Reg";
import { useLang } from "@/lib/i18n";

type Seg = [string, string?];
const TABS: { id: string; lines: Seg[][]; out: [string, string][] }[] = [
  {
    id: "agent.ts",
    lines: [
      [["// the agent's key can only pay through the fuses", "c"]],
      [["const", "k"], [" wallet = "], ["new", "k"], [" "], ["Contract", "f"], ["(ATLAS, FuseboxWallet, agentKey)"]],
      [],
      [["// dry run: would any fuse blow?", "c"]],
      [["const", "k"], [" [allowed, status] = "], ["await", "k"], [" wallet."], ["check", "f"], ["(USDT0, to, amount)"]],
      [],
      [["// the real thing: every fuse runs on X Layer, in this call", "c"]],
      [["await", "k"], [" wallet."], ["pay", "f"], ["(USDT0, to, amount, "], ['"Invoice INV-7790"', "s"], [")"]],
    ],
    out: [["check()", "allowed <b class='r'>false</b> · status <b>[held, blew, latched, held]</b>"], ["pay()", "decision <b>#9</b> · <b class='r'>blocked</b> · fees <b class='lime'>0.004500 USD₮0</b> · gas <b>904,112</b>"]],
  },
  {
    id: "FuseboxWallet.sol",
    lines: [
      [["function", "k"], [" "], ["pay", "f"], ["(address token, address to, uint256 amount, string calldata memo)"]],
      [["    external nonReentrant onlyAgent", "k"]],
      [["    returns", "k"], [" (bool allowed, uint256 decisionId)"]],
      [["{"]],
      [["    Verdict memory v = "], ["_decide", "f"], ["(c);"], ["   // every fuse: eval or step on TapeOut", "c"]],
      [["    allowed = v.allowed;"]],
      [["    uint256 fee = "], ["_charge", "f"], ["(v, charged);"], ["  // designers earn, yes or no", "c"]],
      [["    emit", "k"], [" "], ["Decision", "f"], ["(decisionId, msg.sender, to, token, amount, allowed, …);"]],
      [["}"]],
    ],
    out: [["event", "<b>Decision</b>(9, atlas, 0x9f3e…c41a, USDT0, 2.5, <b class='r'>false</b>, …)"], ["event", "<b>FuseBlew</b>(9, payee-guard, 1, <b class='r'>BLEW</b>)"]],
  },
  {
    id: "MCP",
    lines: [
      [["// fusebox-mcp gives any MCP agent fusebox_check, fusebox_pay and fusebox_status", "c"]],
      [["{"]],
      [['  "tool"', "s"], [": "], ['"fusebox_pay"', "s"], [","]],
      [['  "arguments"', "s"], [": { "], ['"to"', "s"], [": "], ['"0x9f3e…c41a"', "s"], [", "], ['"amount"', "s"], [": "], ['"2.5"', "n"], [","]],
      [["                 "], ['"memo"', "s"], [": "], ['"Urgent refund for a customer"', "s"], [" }"]],
      [["}"]],
    ],
    out: [["result", "<b class='r'>blocked</b> by <b>Payee Guard</b>: not a saved payee · Breaker <b class='r'>latched</b>"], ["result", "ask the owner to save the payee, or to reset the Breaker"]],
  },
];

export default function Builders() {
  const root = useRef<HTMLElement>(null);
  const [tab, setTab] = useState(0);
  const typed = useRef<gsap.core.Timeline | null>(null);
  const seen = useRef(false);
  const { t } = useLang();

  const type = (fast = false) => {
    const el = root.current!;
    typed.current?.kill();
    const lines = Array.from(el.querySelectorAll<HTMLElement>(".ln"));
    const outs = Array.from(el.querySelectorAll<HTMLElement>(".out > div"));
    const tl = gsap.timeline();
    lines.forEach((ln) => {
      const t = ln.querySelector<HTMLElement>(".t")!;
      const caret = ln.querySelector<HTMLElement>(".caret")!;
      const n = (t.textContent || "").length;
      gsap.set(t, { width: 0 }); gsap.set(caret, { display: "none" });
      if (!n) { tl.to({}, { duration: fast ? 0.02 : 0.08 }); return; }
      tl.set(caret, { display: "inline-block" })
        .to(t, { width: `${n}ch`, duration: Math.min(1.1, n * (fast ? 0.006 : 0.016)), ease: `steps(${n})` })
        .set(caret, { display: "none" });
    });
    tl.set(lines[lines.length - 1].querySelector(".caret"), { display: "inline-block" });
    outs.forEach((o, i) => tl.fromTo(o, { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0, duration: 0.4 }, `+=${i ? 0.15 : 0.3}`));
    typed.current = tl;
  };

  useGSAP((_, contextSafe) => {
    // below the fold: set this section up only as it nears the viewport, so hydration stays light
    let undo: void | (() => void);
    const cancel = whenNear(root.current, contextSafe!(() => { undo = (() => {
      const el = root.current!;
      gsap.from(el.querySelector("h2"), { y: 40, autoAlpha: 0, duration: 1.1, scrollTrigger: { trigger: el.querySelector(".body"), start: "top 75%" } });
      gsap.from(el.querySelectorAll(".dev li"), { x: -20, autoAlpha: 0, duration: 0.8, stagger: 0.08, scrollTrigger: { trigger: el.querySelector(".dev ul"), start: "top 80%" } });
      gsap.from(el.querySelector(".code"), { y: 60, autoAlpha: 0, duration: 1.2, scrollTrigger: { trigger: el.querySelector(".code"), start: "top 85%" } });
      if (reduced()) return;
      el.querySelectorAll<HTMLElement>(".ln .t").forEach((t) => gsap.set(t, { width: 0 }));
      gsap.set(el.querySelectorAll(".out > div"), { autoAlpha: 0 });
      ScrollTrigger.create({ trigger: el.querySelector(".code"), start: "top 70%", once: true, onEnter: () => { seen.current = true; type(); } });
    })(); }));
    return () => { cancel(); if (typeof undo === "function") undo(); };
  }, []);

  useGSAP(() => {
    const el = root.current!;
    const btn = el.querySelectorAll<HTMLElement>(".tabs button")[tab];
    const ink = el.querySelector<HTMLElement>(".tabs .ink")!;
    gsap.set(ink, { left: btn.offsetLeft, width: btn.offsetWidth });
    if (seen.current && !reduced()) type(true);
  }, { dependencies: [tab] });

  const cur = TABS[tab];
  return (
    <section className="dev reg" ref={root} id="build">
      <Reg />
      <div className="wrap sh"><div className="m lime" data-scr>[09]</div><div className="m mute" data-scr>{t("For agent builders", "面向智能体开发者")}</div></div>
      <div className="wrap body">
        <div className="left">
          <h2 className="disp">{t(<>One call before <span className="lime">every</span> payment.</>, <><span className="lime">每一笔</span>付款前，只需一次调用。</>)}</h2>
          <ul>
            <li>{t("The agent's key can only move money through the fuses.", "智能体的密钥只能经由保险丝动用资金。")}</li>
            <li>{t("Dry-run any payment with check() and see which fuse would blow.", "用 check() 预演任意一笔付款，看看哪个保险丝会熔断。")}</li>
            <li>{t("Freeze from the agent, an approver or you. Only you can reset.", "智能体、审批人或你本人都能冻结。只有你能重置。")}</li>
            <li>{t("Works with any agent that can sign an X Layer transaction.", "适用于任何能签署 X Layer 交易的智能体。")}</li>
          </ul>
        </div>
        <div className="code">
          <div className="tabs m">
            {TABS.map((x, i) => <button key={x.id} className={i === tab ? "on" : ""} onClick={() => setTab(i)} data-cursor={t("Switch", "切换")}>{x.id}</button>)}
            <span className="ink" />
          </div>
          <pre key={cur.id}>
            {cur.lines.map((segs, i) => (
              <span className="ln" key={i}>
                <span className="t">{segs.map(([txt, c], k) => <span key={k} className={c}>{txt}</span>)}</span>
                <span className="caret" style={{ display: "none" }} />
              </span>
            ))}
          </pre>
          <div className="out m" key={`o-${cur.id}`}>
            {cur.out.map(([k, v]) => <div key={k + v}><span className="mute">{k}</span> <span dangerouslySetInnerHTML={{ __html: v }} /></div>)}
          </div>
        </div>
      </div>
    </section>
  );
}
