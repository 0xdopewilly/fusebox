"use client";
import { useRef } from "react";
import { gsap, SplitText, useGSAP, reduced, whenNear } from "@/lib/gsap";
import Reg from "./Reg";
import { useLang } from "@/lib/i18n";

export default function Users() {
  const root = useRef<HTMLElement>(null);
  const { t } = useLang();
  const WHO = [
    { k: "A", h: t("Teams with payment agents", "使用付款智能体的团队"), p: t("Invoice and AP agents, procurement bots, payout runs. The agent keeps its speed, and the fuses keep it inside the owner's rules. Set up in three taps.", "发票与应付账款智能体、采购机器人、批量付款。智能体照样快，保险丝让它始终守在所有者的规则之内。点三下即可设置完成。"), b: "0.005", s: t("USD₮0 for a payment checked by all five fuses", "USD₮0，一笔付款经全部五个保险丝检查的费用") },
    { k: "B", h: t("Agent platforms and wallets", "智能体平台与钱包"), p: t("Give every user's agent a wallet with fuses: one factory call on X Layer, or one line of MCP for Claude, Cursor and any MCP client.", "给每位用户的智能体配一个带保险丝的钱包：在 X Layer 上调用一次工厂合约，或为 Claude、Cursor 及任何 MCP 客户端加一行 MCP 配置。"), b: t("1 line", "1 行"), s: "npx -y fusebox-mcp" },
    { k: "C", h: t("Circuit designers", "电路设计者"), p: t("Build a rule without code in Fuse Studio, checked against your rule before it ships, or bring your own NAND circuit. Tape it out on TapeOut and list it: every wallet that installs it pays you on every decision.", "在 Fuse Studio 里零代码搭建规则，上线前先对照你的规则完成验证；也可以带上你自己的 NAND 电路。在 TapeOut 上流片并上架：每个安装它的钱包，每次决策都会付费给你。"), b: "90%", s: t("of each fee, paid to the circuit NFT", "每笔费用中付给电路 NFT 的份额") },
  ];
  useGSAP((_, contextSafe) => {
    // below the fold: set this section up only as it nears the viewport, so hydration stays light
    let undo: void | (() => void);
    const cancel = whenNear(root.current, contextSafe!(() => { undo = (() => {
      const el = root.current!;
      if (reduced()) return;
      const h = SplitText.create(el.querySelector("h2")!, { type: "lines", linesClass: "line-mask", mask: "lines" });
      gsap.from(h.lines, { yPercent: 105, duration: 1.2, stagger: 0.08, scrollTrigger: { trigger: el.querySelector(".body"), start: "top 75%" } });
      gsap.from(el.querySelectorAll(".card"), { y: 34, autoAlpha: 0, duration: 0.9, stagger: 0.12, scrollTrigger: { trigger: el.querySelector(".cards"), start: "top 80%" } });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el.querySelector(".earn"), start: "top 78%" } });
      tl.from(el.querySelectorAll(".earn .node"), { autoAlpha: 0, scale: 0.92, transformOrigin: "50% 50%", duration: 0.6, stagger: 0.18 })
        .from(el.querySelectorAll(".earn .wire"), { drawSVG: "0%", duration: 0.9, ease: "power2.inOut", stagger: 0.1 }, 0.2)
        .from(el.querySelectorAll(".earn .pulse"), { autoAlpha: 0, duration: 0.3 }, 1);
    })(); }));
    return () => { cancel(); if (typeof undo === "function") undo(); };
  }, []);
  return (
    <section className="users reg" ref={root} id="who">
      <Reg />
      <div className="wrap sh"><div className="m lime" data-scr>[06]</div><div className="m mute" data-scr>{t("Who it's for", "适用对象")}</div><div className="m mute" style={{ gridColumn: "5 / 7" }} data-scr>{t("Pay per decision. No seats, no subscriptions.", "按决策付费。不按席位，没有订阅。")}</div></div>
      <div className="wrap body">
        <h2 className="disp">{t(<>For anyone who lets an agent <span className="lime">[touch money]</span>.</>, <>适合每个让智能体<span className="lime">[碰钱]</span>的人。</>)}</h2>
      </div>
      <div className="wrap cards">
        {WHO.map((w) => (
          <div className="card" key={w.k}>
            <div className="m lime">{w.k}</div>
            <h3>{w.h}</h3>
            <p>{w.p}</p>
            <div className="stat"><b>{w.b}</b><span className="m mute">{w.s}</span></div>
          </div>
        ))}
      </div>
      <div className="wrap">
        <div className="earn">
          <div className="txt">
            <div className="m lime">{t("How Fusebox earns", "Fusebox 如何盈利")}</div>
            <p>{t(
              "Each fuse charges a small fee every time it checks a payment, in USD₮0, in the same call as the payment. The fuse's designer gets 90%. Fusebox keeps 10%, and the contract caps that share at 20%.",
              "每个保险丝每检查一笔付款，都会在同一次调用中收取一小笔 USD₮0 费用。其中 90% 归保险丝的设计者，Fusebox 留 10%，且合约把这部分的上限定为 20%。",
            )}</p>
            <p className="m mute" style={{ marginTop: 16 }}>{t("Revenue grows with the payments agents make, not with seats.", "收入随智能体的付款量增长，而不是随席位数。")}</p>
          </div>
          <svg viewBox="0 0 760 230" className="flow" role="img" aria-label={t("A wallet pays a fee per check: 90% to the fuse's designer, 10% to Fusebox", "钱包按次支付检查费用：90% 给保险丝的设计者，10% 给 Fusebox")}>
            <path className="wire" d="M232 115 H330 C380 115 380 52 430 52 H500" />
            <path className="wire" d="M232 115 H330 C380 115 380 178 430 178 H500" />
            <path className="pulse" d="M232 115 H330 C380 115 380 52 430 52 H500" />
            <path className="pulse" d="M232 115 H330 C380 115 380 178 430 178 H500" />
            <g className="node"><rect x="2" y="72" width="230" height="86" /><text x="20" y="104" className="t1">{t("WALLET", "钱包")}</text><text x="20" y="128" className="t2">{t("PAYS A FEE PER CHECK", "按次支付检查费用")}</text><text x="20" y="146" className="t2">{t("0.0045 USD₮0 ON ATLAS", "ATLAS 上 0.0045 USD₮0")}</text></g>
            <g className="node hot"><rect x="500" y="14" width="256" height="76" /><text x="518" y="44" className="t1">{t("DESIGNERS · 90%", "设计者 · 90%")}</text><text x="518" y="68" className="t2">{t("TO WHOEVER HOLDS THE CIRCUIT NFT", "付给电路 NFT 的持有者")}</text></g>
            <g className="node"><rect x="500" y="140" width="256" height="76" /><text x="518" y="170" className="t1">FUSEBOX · 10%</text><text x="518" y="194" className="t2">{t("CAPPED AT 20% IN THE CONTRACT", "合约上限 20%")}</text></g>
          </svg>
          <div className="flow-m m" aria-hidden="true">
            <div className="n"><b>{t("Wallet", "钱包")}</b>{t("Pays a fee per check · 0.0045 USD₮0 on Atlas", "按次支付检查费用 · Atlas 上 0.0045 USD₮0")}</div>
            <div className="arr">↓</div>
            <div className="n hot"><b>{t("Designers · 90%", "设计者 · 90%")}</b>{t("To whoever holds the circuit NFT", "付给电路 NFT 的持有者")}</div>
            <div className="n"><b>Fusebox · 10%</b>{t("Capped at 20% in the contract", "合约上限为 20%")}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
