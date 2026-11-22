"use client";
import { useRef } from "react";
import { gsap, SplitText, useGSAP, reduced, whenNear } from "@/lib/gsap";
import { useLang } from "@/lib/i18n";

const BARS = [
  { name: "Daily Cap", fee: "0.001", h: 50 },
  { name: "Payee Guard", fee: "0.001", h: 50 },
  { name: "Breaker", fee: "0.0005", h: 25 },
  { name: "Two of Three", fee: "0.002", h: 100 },
];

export default function Designers() {
  const root = useRef<HTMLElement>(null);
  const { t } = useLang();
  useGSAP((_, contextSafe) => {
    // below the fold: set this section up only as it nears the viewport, so hydration stays light
    let undo: void | (() => void);
    const cancel = whenNear(root.current, contextSafe!(() => { undo = (() => {
      const el = root.current!;
      if (reduced()) return;
      // the lime floods in from a narrower frame as it scrolls up
      gsap.fromTo(el, { clipPath: "inset(10% 4% 0% 4%)" }, { clipPath: "inset(0% 0% 0% 0%)", ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "top 25%", scrub: true } });
      const h = SplitText.create(el.querySelector("h2")!, { type: "lines", linesClass: "line-mask", mask: "lines" });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el.querySelector(".body"), start: "top 75%" } });
      tl.from(h.lines, { yPercent: 105, duration: 1.2, stagger: 0.08 });
      el.querySelectorAll<HTMLElement>(".pts > div").forEach((d, i) => {
        const b = d.querySelector<HTMLElement>("b")!;
        tl.from(d, { y: 30, autoAlpha: 0, duration: 0.9 }, 0.2 + i * 0.1);
        if (b.dataset.count) {
          const o = { v: 0 };
          tl.to(o, { v: Number(b.dataset.count), duration: 1.4, ease: "power3.out", onUpdate: () => { b.textContent = Math.round(o.v) + (b.dataset.suffix || ""); } }, 0.25 + i * 0.1);
        } else {
          tl.from(b, { duration: 1, scrambleText: { text: b.textContent || "", chars: "01", speed: 0.6 } }, 0.25 + i * 0.1);
        }
      });
      const bars = Array.from(el.querySelectorAll<HTMLElement>(".bar"));
      const bt = gsap.timeline({ scrollTrigger: { trigger: el.querySelector(".bars"), start: "top 85%" } });
      bars.forEach((bar, i) => {
        const steps = Math.max(2, Math.round((Number(bar.dataset.h) / 100) * 20));
        bt.from(bar.querySelector("i"), { scaleY: 0, duration: 0.25 + steps * 0.05, ease: `steps(${steps})` }, i * 0.15)
          .from(bar.querySelector("span"), { autoAlpha: 0, y: 10, duration: 0.5 }, i * 0.15 + 0.3);
      });
      bt.from(el.querySelector(".barlab"), { autoAlpha: 0, duration: 0.8 }, 0);
    })(); }));
    return () => { cancel(); if (typeof undo === "function") undo(); };
  }, []);
  return (
    <section className="flood" ref={root} id="designers">
      <div className="wrap sh"><div className="m">[08]</div><div className="m">{t("For circuit designers", "面向电路设计者")}</div><div className="m" style={{ gridColumn: "5 / 7" }}>{t("Tape out on TapeOut. Every fee goes to whoever owns the circuit NFT", "在 TapeOut 上流片。每笔费用都归电路 NFT 的所有者")}</div></div>
      <div className="wrap body">
        <h2 className="disp">{t("A fuse is a product. It pays you every time it decides.", "保险丝就是产品。它每做一次决策，都给你付一次钱。")}</h2>
        <p className="studio-lead">{t(
          <>Build one without code. Fuse Studio combines payment conditions with <b>all</b>, <b>any</b>, <b>at least</b> or <b>none</b>, turns the rule into TapeOut gates, trims every gate it doesn&apos;t need and proves it matches your rule on every possible input before you tape it out. <a href="/app/studio">Open Fuse Studio →</a></>,
          <>零代码就能做一个。Fuse Studio 用<b>全部</b>、<b>任一</b>、<b>至少</b>或<b>都不</b>组合付款条件，把规则变成 TapeOut 门电路，精简掉所有多余的门，并在你流片之前，用所有可能的输入证明它与你的规则一致。<a href="/app/studio">打开 Fuse Studio →</a></>,
        )}</p>
        <div className="pts">
          <div><b data-count="90" data-suffix="%">90%</b><p>{t("of every fee goes to the circuit's owner. Fusebox keeps 10%, and the contract caps its share at 20%.", "每笔费用中归电路所有者的份额。Fusebox 留 10%，合约把它的份额上限定为 20%。")}</p></div>
          <div><b>{t("Even the no", "“否”也算")}</b><p>{t("A fuse that stops a scam has done its job, so blocked attempts pay too, within daily caps.", "拦下诈骗的保险丝已经尽了职责，所以被拦截的尝试同样付费，但不超过每日上限。")}</p></div>
          <div><b>{t("1 NFT", "1 个 NFT")}</b><p>{t("The circuit NFT is the payout address. Sell it, and the income moves with it.", "电路 NFT 就是收款地址。卖掉它，收入也随之转走。")}</p></div>
          <div><b>{t("0 upfront", "0 前期费用")}</b><p>{t("Wallet owners pay per decision, from a prepaid USD₮0 balance. No licences, no subscriptions.", "钱包所有者从预存的 USD₮0 余额中按决策付费。没有授权费，没有订阅。")}</p></div>
        </div>
      </div>
      <div className="wrap bars">
        <div className="m barlab">{t(<>Fee per check, USD₮0<br />set by each fuse&apos;s designer</>, <>每次检查费用，USD₮0<br />由各保险丝的设计者设定</>)}</div>
        {BARS.map((b) => (
          <div className="bar" key={b.name} style={{ ["--h" as string]: `${b.h}%` }} data-h={b.h} data-cursor={t(`${b.fee} / check`, `${b.fee} / 次检查`)}>
            <i /><span>{b.name} · {b.fee}</span><em>{b.fee} USD₮0</em>
          </div>
        ))}
      </div>
    </section>
  );
}
