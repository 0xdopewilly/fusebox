"use client";
import Link from "next/link";
import { useRef } from "react";
import { gsap, useGSAP, reduced } from "@/lib/gsap";
import { useMarket } from "@/lib/useMarket";
import { LAYERS } from "@/lib/fuses";
import { short, fmt, OKLINK } from "@/lib/hooks";
import Netlist from "@/components/landing/Netlist";
import ChainNetlist from "./ChainNetlist";
import Loading from "./Loading";
import MarketInstall from "./MarketInstall";
import { Responsive } from "./m/useMobile";
import { MarketMobile, textZh } from "./m/MarketMobile";
import { useLang } from "@/lib/i18n";

const SAY: Record<string, string> = {
  "daily-cap": "No more than the owner's cap in a UTC day, however the agent is asked.",
  "payee-guard": "Saved payees only, with a trial amount for new ones until their cooling-off ends.",
  breaker: "Trips on a payment to a stranger and stays blown until the owner resets it.",
  "approval-2of3": "Above a threshold, two of three approvers must sign that exact payment.",
};

export default function MarketView() {
  const { data, error } = useMarket();
  const { t, zh } = useLang();
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!data || !root.current || reduced()) return;
    root.current.querySelectorAll<HTMLElement>(".fz").forEach((row, k) => {
      const gates = row.querySelectorAll<SVGElement>(".gate");
      const dep = (n: Element) => Number(n.getAttribute("data-depth"));
      // one clip sweep per schematic reads as the signal flowing left to right, without measuring hundreds of paths
      const sch = row.querySelector(".sch svg, .sch canvas");
      const tl = gsap.timeline({ delay: 0.15 + k * 0.12 }).from(row, { y: 30, autoAlpha: 0, duration: 0.8 });
      if (sch) tl.fromTo(sch, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 1.1, ease: "power2.inOut" }, 0.15);
      row.addEventListener("mouseenter", () => gsap.fromTo(gates, { fill: "#bbfe2f" }, { fill: "#fff", duration: 0.09, yoyo: true, repeat: 1, stagger: (i) => dep(gates[i]) * 0.04, overwrite: true }));
    });
  }, { dependencies: [!!data] });
  return <Responsive mobile={data ? <MarketMobile data={data} /> : <div className="page"><Loading label={t("Reading the fuse registry", "正在读取保险丝注册表")} error={error} /></div>} desktop={
    <div className="page" ref={root}>
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <section className="try-head">
        <h1 className="disp" data-a>{t(<>The fuse <span className="lime">[market]</span>.</>, <>保险丝<span className="lime">[市场]</span>。</>)}</h1>
        <p data-a>{t("Every fuse here is a NAND circuit taped out on TapeOut and listed in Fusebox's registry on X Layer. Wallets install them; designers earn every time one decides.", "这里的每个保险丝都是在 TapeOut 上流片、并在 X Layer 上的 Fusebox 注册表中上架的 NAND 电路。钱包安装它们；保险丝每做一次决策，设计者就有一笔收益。")}</p>
      </section>
      {!data ? <Loading label={t("Reading the fuse registry", "正在读取保险丝注册表")} error={error} /> : (
        <>
          <section className="stats m mute" data-a>
            <div>{t("Fuses listed", "已上架保险丝")}<b>{data.fuses.length}</b></div>
            <div>{t("Decisions", "决策次数")}<b>{data.totalDecisions}</b></div>
            <div>{t("Earned by designers", "设计者收益")}<b>{Number(data.totalEarned).toFixed(5)}<small>USD₮0</small></b></div>
            <div>{t("Protocol share", "协议分成")}<b>{data.protocolBps / 100}%<small>{t("cap 20%", "上限 20%")}</small></b></div>
            <div>{t("Protocol earned", "协议收益")}<b>{Number(data.protocolEarned).toFixed(5)}<small>USD₮0</small></b></div>
            <div>{t("Processor", "处理器")}<b style={{ fontSize: 16, marginTop: 14 }}>{data.fuses[0] ? short(data.fuses[0].processor) : "—"}</b></div>
          </section>
          <h2 className="sr">{t("Listed fuses", "已上架的保险丝")}</h2>
          <div style={{ marginTop: 40 }}>
            {data.fuses.map((f, i) => {
              const layout = f.original ? LAYERS.find((l) => l.key === f.key) : undefined;
              return (
                <div className="fz" key={f.fuseId} data-cursor={t("Signal", "信号")}>
                  <div><div className="ix">{String(i + 1).padStart(2, "0")}</div></div>
                  <div style={{ gridColumn: "2 / 4" }}>
                    <h3><Link href={`/app/fuse/${f.fuseId}`} className="fz-name">{f.meta?.name ?? f.name}</Link></h3><p className="say">{textZh(f.meta?.summary ?? (f.original ? SAY[f.key] : "") ?? "", zh)}</p>
                    <p className="m" style={{ marginTop: 12, color: "var(--dim)" }}>{t("Fuse", "保险丝")} #{f.fuseId} · <a href={`${OKLINK}/address/${f.processor}`} target="_blank" rel="noreferrer" style={{ color: "var(--mute)" }}>{t("circuit", "电路")} #{f.circuitId} ↗</a> · {t("designer", "设计者")} {short(f.designer)}{f.onAtlas ? <span className="lime">{t(" · on Atlas", " · 在 Atlas 上")}</span> : null}</p>
                  </div>
                  <div className="sch">{layout && <Netlist f={layout} />}<ChainNetlist processor={f.processor} circuitId={f.circuitId} nIn={f.nIn} pinned={f.netlistHash} draw={!layout} /></div>
                  <div><div className="chips">
                    <span className="chip l">{fmt(f.fee)} {t("USD₮0 / check", "USD₮0 / 次检查")}</span>
                    <span className="chip">{t(`${f.decisions} decisions`, `${f.decisions} 次决策`)}</span>
                    <span className="chip">{t("earned", "收益")} {Number(f.lifetimeEarned).toFixed(5)}</span>
                    <span className="chip">{f.listed ? t("Listed", "已上架") : t("Delisted", "已下架")}</span>
                  </div>{f.listed && <MarketInstall fuseId={f.fuseId} name={f.name} />}</div>
                </div>
              );
            })}
            <div className="fz" style={{ borderStyle: "dashed" }}>
              <div><div className="ix" style={{ color: "var(--dim)" }}>+</div></div>
              <div style={{ gridColumn: "2 / 5" }}><h3 style={{ color: "var(--mute)" }}>{t("Your fuse here", "你的保险丝")}</h3><p className="say">{t("Duplicate-invoice checks, business-hours only, per-payee caps, velocity limits. Design it as a NAND circuit, tape it out, list it, and earn from every decision it makes.", "重复发票检查、仅限工作时间、按收款方限额、频率限制。把它设计成 NAND 电路，流片、上架，它做的每一次决策都为你带来收益。")}</p></div>
              <div style={{ gridColumn: "5 / 7", display: "flex", alignItems: "center" }}><Link className="btn lime" href="/app/studio" data-cursor={t("Earn", "赚取")}><span className="roll"><span>{t("Sell a fuse", "出售保险丝")}</span><span aria-hidden="true">{t("Sell a fuse", "出售保险丝")}</span></span> <span className="k">→</span></Link></div>
            </div>
          </div>
        </>
      )}
    </div>
  } />;
}
