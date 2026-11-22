"use client";
import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, reduced, whenNear } from "@/lib/gsap";
import { LAYERS, FUSE_META } from "@/lib/fuses";
import { useLang } from "@/lib/i18n";

const PROCESSOR = "0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355";
const OKLINK = "https://www.oklink.com/xlayer";

export default function OnTapeOut() {
  const root = useRef<HTMLElement>(null);
  const { t } = useLang();
  /** Where the fuses come from: every Fusebox fuse is a circuit taped out on TapeOut and evaluated by TapeOut on X Layer. */
  const STEPS: [string, string, string][] = [
    [t("Designed", "设计"), t("A logic circuit", "一个逻辑电路"), t("A fuse is a TAP-02 netlist: NAND gates, plus latches for memory. Design one with TapeOut's toolchain, or build it from rules in Fuse Studio.", "保险丝就是一份 TAP-02 网表：NAND 门，外加用于记忆的锁存器。可以用 TapeOut 的工具链设计，也可以在 Fuse Studio 里用规则搭建。")],
    [t("Taped out", "流片"), t("On TapeOut", "在 TapeOut 上"), t("Minted gate by gate and taped out on TapeOut's processor on X Layer. The designer gets the circuit NFT. Fusebox's five are circuits #15 to #18 and #21.", "逐个门铸造，并在 TapeOut 部署于 X Layer 的处理器上流片。设计者获得电路 NFT。Fusebox 的五个保险丝是 #15 至 #18 号和 #21 号电路。")],
    [t("Evaluated", "求值"), t("By TapeOut, on X Layer", "由 TapeOut 在 X Layer 上执行"), t("Every payment calls TapeOut's eval and step for each fuse, in the same transaction. A latch keeps its state on-chain between payments.", "每笔付款都会在同一笔交易中，为每个保险丝调用 TapeOut 的 eval 和 step。锁存器在两次付款之间把状态保存在链上。")],
    [t("Paid", "支付"), t("To the circuit's owner", "付给电路所有者"), t("Every check pays whoever holds the circuit NFT, in USD₮0. Sell the NFT and the income goes with it.", "每次检查都以 USD₮0 付给电路 NFT 的持有者。卖掉 NFT，收入也随之转走。")],
  ];
  useGSAP((_, contextSafe) => {
    let undo: void | (() => void);
    const cancel = whenNear(root.current, contextSafe!(() => { undo = (() => {
      if (reduced()) return;
      const el = root.current!;
      gsap.from(el.querySelectorAll(".ot-h > *"), { y: 26, autoAlpha: 0, duration: 1, stagger: 0.1, scrollTrigger: { trigger: el, start: "top 75%" } });
      gsap.from(el.querySelectorAll(".ot-step"), { y: 30, autoAlpha: 0, duration: 0.9, stagger: 0.1, scrollTrigger: { trigger: el.querySelector(".ot-steps"), start: "top 80%" } });
      gsap.from(el.querySelector(".ot-wire i"), { scaleX: 0, transformOrigin: "left", duration: 1.6, ease: "power3.inOut", scrollTrigger: { trigger: el.querySelector(".ot-steps"), start: "top 80%" } });
      gsap.from(el.querySelectorAll(".ot-c"), { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.08, scrollTrigger: { trigger: el.querySelector(".ot-circuits"), start: "top 85%" } });
      return () => ScrollTrigger.refresh();
    })(); }));
    return () => { cancel(); if (typeof undo === "function") undo(); };
  }, []);

  return (
    <section className="ontape" ref={root} id="tapeout" aria-labelledby="tapeout-h">
      <div className="wrap sh">
        <div className="m lime">[04]</div><div className="m mute">{t("Built on TapeOut", "基于 TapeOut 构建")}</div>
        <div className="m mute ot-links" style={{ gridColumn: "5 / 7" }}><a href="https://tapeout.net" target="_blank" rel="noreferrer">tapeout.net ↗</a><a href="https://x.com/TapeOutWorld" target="_blank" rel="noreferrer">@TapeOutWorld ↗</a></div>
      </div>
      <div className="wrap ot-h">
        <h2 className="disp" id="tapeout-h">{t(<>Every fuse is a <span className="lime">[TapeOut]</span> circuit.</>, <>每个保险丝都是一个 <span className="lime">[TapeOut]</span> 电路。</>)}</h2>
        <p>{t(
          "TapeOut lets anyone design a logic circuit, tape it out on X Layer and own it as an NFT. Fusebox puts those circuits between an AI agent and its money: a wallet wires them in as fuses, and every payment runs them through TapeOut's processor on X Layer before a cent moves.",
          "TapeOut 让任何人都能设计逻辑电路，在 X Layer 上流片，并以 NFT 的形式拥有它。Fusebox 把这些电路放在 AI 智能体和它的钱之间：钱包把它们接成保险丝，每笔付款在动用一分钱之前，都要先经 TapeOut 在 X Layer 上的处理器运行这些电路。",
        )}</p>
      </div>
      <div className="wrap ot-steps">
        <div className="ot-wire" aria-hidden="true"><i /></div>
        <ol>
          {STEPS.map(([k, h, p], i) => (
            <li className="ot-step" key={k}>
              <span className="ot-node" aria-hidden="true" />
              <span className="m lime">0{i + 1} · {k}</span>
              <h3>{h}</h3>
              <p>{p}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="wrap ot-circuits">
        <div className="m mute ot-cap">{t("Live on TapeOut's processor", "运行在 TapeOut 的处理器上")} <a href={`${OKLINK}/address/${PROCESSOR}`} target="_blank" rel="noreferrer">{PROCESSOR.slice(0, 6)}…{PROCESSOR.slice(-4)} ↗</a></div>
        <div className="ot-grid">
          {LAYERS.map((f) => {
            const m = FUSE_META[f.key];
            return (
              <div className="ot-c" key={f.key}>
                <span className="m mute">{t("TapeOut circuit", "TapeOut 电路")}</span>
                <b className="disp">#{m.circuit}</b>
                <span className="ot-name">{m.name}</span>
                <span className="m mute">{t(m.chips[1]?.[0] ?? `${f.gates} gates`, (m.chips[1]?.[0] ?? `${f.gates} 个门`).replace("LATCH", "锁存器"))} · {t(<>{m.fee} USD₮0 a check</>, <>每次检查 {m.fee} USD₮0</>)}</span>
              </div>
            );
          })}
        </div>
        <div className="ot-cta">
          <a className="btn lime" href="https://tapeout.net" target="_blank" rel="noreferrer" data-cursor={t("Open", "打开")}><span className="roll"><span>{t("Open TapeOut", "打开 TapeOut")}</span><span aria-hidden="true">{t("Open TapeOut", "打开 TapeOut")}</span></span> <span className="k">↗</span></a>
          <a className="btn line" href="/app/studio" data-cursor={t("Build", "搭建")}><span className="roll"><span>{t("Tape out your own fuse", "流片你自己的保险丝")}</span><span aria-hidden="true">{t("Tape out your own fuse", "流片你自己的保险丝")}</span></span> <span className="k">→</span></a>
        </div>
      </div>
    </section>
  );
}
