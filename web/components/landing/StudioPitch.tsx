"use client";
import { useRef } from "react";
import { gsap, SplitText, useGSAP, reduced, whenNear } from "@/lib/gsap";
import { useLang } from "@/lib/i18n";

/** [07] Need a circuit? The answer to "getting a TapeOut circuit built is hard": Fuse Studio builds, proves and tapes
 *  it out, with no NAND design and nobody to hire. */
export default function StudioPitch() {
  const root = useRef<HTMLElement>(null);
  const { t } = useLang();
  useGSAP((_, contextSafe) => {
    let undo: void | (() => void);
    const cancel = whenNear(root.current, contextSafe!(() => { undo = (() => {
      const el = root.current!;
      if (reduced()) return;
      const h = SplitText.create(el.querySelector("h2")!, { type: "lines", linesClass: "line-mask", mask: "lines" });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el.querySelector(".body"), start: "top 75%" } });
      tl.from(h.lines, { yPercent: 105, duration: 1.2, stagger: 0.08 })
        .from(el.querySelector(".lead"), { y: 24, autoAlpha: 0, duration: 0.9 }, 0.25)
        .from(el.querySelectorAll(".sp-cta > *"), { y: 18, autoAlpha: 0, duration: 0.8, stagger: 0.08 }, 0.35);
      const st = gsap.timeline({ scrollTrigger: { trigger: el.querySelector(".steps"), start: "top 85%" } });
      el.querySelectorAll<HTMLElement>(".steps > div").forEach((d, i) => {
        st.from(d, { y: 30, autoAlpha: 0, duration: 0.9 }, i * 0.1)
          .from(d.querySelector(".n"), { duration: 0.9, scrambleText: { text: d.querySelector(".n")!.textContent || "", chars: "01", speed: 0.6 } }, i * 0.1 + 0.1);
      });
    })(); }));
    return () => { cancel(); if (typeof undo === "function") undo(); };
  }, []);
  const STEPS = [
    [t("Write the rule", "写下规则"), t("Plain conditions, combined with all, any, at least or none. Or start from 13 ready-made rules.", "用「全部」「任一」「至少」「都不」组合简单条件，或从 13 条现成规则开始。")],
    [t("It compiles", "自动编译"), t("Into NAND gates for TapeOut, then gate golf trims every gate it doesn't need: fewer gates, cheaper checks.", "编译成 TapeOut 的 NAND 门电路，再精简掉所有多余的门：门更少，每次检查更便宜。")],
    [t("It's proved", "逐一证明"), t("Against your rule on every possible input: all 16.7 million for a daily cap, all 8.6 billion for a payee rule.", "对所有可能的输入逐一验证与规则一致：每日限额规则 1670 万种，收款方规则 86 亿种。")],
    [t("Tape it out", "流片上链"), t("From your own wallet, in the same page. List it in the market and earn on every check.", "在同一页面用你自己的钱包流片，上架到市场，每次检查都为你赚取费用。")],
  ];
  return (
    <section className="studio-sec" ref={root} id="studio">
      <div className="wrap sh">
        <div className="m lime">[07]</div><div className="m mute">Fuse Studio</div>
        <div className="m mute" style={{ gridColumn: "5 / 7" }}>{t("No NAND design. Nobody to hire.", "不用学 NAND 设计，也不用请人。")}</div>
      </div>
      <div className="wrap body">
        <h2 className="disp">{t("Need a circuit? Write the rule. Studio builds it.", "需要电路？写下规则，Studio帮你造。")}</h2>
        <p className="lead">{t(
          "Getting a TapeOut circuit built usually means learning NAND design, or paying a builder and hoping. Fuse Studio does it for you: it turns your rule into gates, trims them, and proves the circuit matches your rule on every possible input before anything is taped out.",
          "想要一个 TapeOut 电路，通常要么自己学 NAND 设计，要么先付钱给开发者再碰运气。Fuse Studio 替你完成：把规则变成门电路、精简，并在流片之前用所有可能的输入证明电路与规则完全一致。",
        )}</p>
        <div className="sp-cta">
          <a className="btn lime" href="/app/studio" data-cursor={t("Studio", "工作室")}><span className="roll"><span>{t("Open Fuse Studio", "打开 Fuse Studio")}</span><span aria-hidden="true">{t("Open Fuse Studio", "打开 Fuse Studio")}</span></span> <span className="k">→</span></a>
          <a className="btn" href="/app/market" data-cursor={t("Market", "市场")}><span className="roll"><span>{t("See the 9 live fuses", "查看 9 个在线保险丝")}</span><span aria-hidden="true">{t("See the 9 live fuses", "查看 9 个在线保险丝")}</span></span> <span className="k">→</span></a>
        </div>
        <div className="steps">
          {STEPS.map(([b, p], i) => (
            <div key={i}><span className="m n">{`0${i + 1}`}</span><b>{b}</b><p>{p}</p></div>
          ))}
        </div>
      </div>
    </section>
  );
}
