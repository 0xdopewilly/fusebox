"use client";
import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger, useGSAP, reduced } from "@/lib/gsap";
import { useLang } from "@/lib/i18n";

interface Live { decisions: number; blocked: number; fees: number; circuits: string }
const PROCESSOR = "0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355";
const REGISTRY = "0x852a278322667BB86A2665a38CbC5Bfd551B20d7";

/** Real numbers from X Layer mainnet, right under the hero. */
export default function LiveProof() {
  const root = useRef<HTMLElement>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [copied, setCopied] = useState(false);
  const { t } = useLang();
  useEffect(() => {
    let alive = true, tries = 0;
    const load = async () => {
      const get = async (u: string) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
      const [a, m] = await Promise.all([get("/api/atlas"), get("/api/market")]);
      if (!alive) return;
      if (a?.counts) setLive({ decisions: m?.totalDecisions ?? a.counts.decisions * Math.max(1, a.fuses?.length ?? 1), blocked: a.counts.blocked, fees: m ? Number(m.totalEarned) + Number(m.protocolEarned) : Number(a.paidToDesigners), circuits: m?.fuses ? m.fuses.map((f: { circuitId: number }) => `#${f.circuitId}`).join(" ") : "" });
      if ((!a?.counts || !m?.fuses) && ++tries < 6) setTimeout(load, 5000);
    };
    load();
    return () => { alive = false; };
  }, []);
  useGSAP(() => {
    if (!live) return;
    const el = root.current!;
    const nums = Array.from(el.querySelectorAll<HTMLElement>("[data-n]"));
    if (reduced()) return;
    gsap.set(el.querySelectorAll(".lp-cell"), { autoAlpha: 0, y: 18 });
    ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => {
      gsap.to(el.querySelectorAll(".lp-cell"), { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.07, ease: "snap" });
      nums.forEach((n) => { const end = Number(n.dataset.n), d = Number(n.dataset.d || 0), o = { v: 0 }; gsap.to(o, { v: end, duration: 1.6, ease: "power3.out", onUpdate: () => { n.textContent = o.v.toFixed(d); } }); });
    } });
  }, { dependencies: [!!live] });
  return (
    <section className="liveproof" ref={root} aria-label={t("Live on X Layer mainnet", "X Layer 主网实时数据")}>
      <div className="wrap lp-row m">
        <div className="lp-cell lp-head"><span className="live" />{t("Live on X Layer mainnet", "X Layer 主网实时数据")}</div>
        <div className="lp-cell"><b data-n={live?.decisions ?? 0}>{live?.decisions ?? "—"}</b>{t("fuse decisions", "次保险丝决策")}</div>
        <div className="lp-cell"><b data-n={live?.blocked ?? 0} className="red">{live?.blocked ?? "—"}</b>{t("payments stopped", "笔付款被拦截")}</div>
        <div className="lp-cell"><b data-n={live?.fees ?? 0} data-d="4">{live ? live.fees.toFixed(4) : "—"}</b>{t("USD₮0 in fees", "USD₮0 费用")}</div>
        <div className="lp-cell"><a href={`https://www.oklink.com/xlayer/address/${PROCESSOR}`} target="_blank" rel="noreferrer" data-cursor="TapeOut"><b className="lime">{live?.circuits || "#15 #16 #17 #18"}</b>{t("TapeOut circuits ↗", "TapeOut 电路 ↗")}</a></div>
        <div className="lp-cell lp-links">
          <a href={`https://repo.sourcify.dev/196/${REGISTRY}`} target="_blank" rel="noreferrer" data-cursor={t("Source", "源码")}>{t("Verified on Sourcify ↗", "已在 Sourcify 验证 ↗")}</a>
          <button onClick={() => { navigator.clipboard?.writeText("npx -y fusebox-mcp"); setCopied(true); setTimeout(() => setCopied(false), 1400); }} data-cursor={t("Copy", "复制")}>{copied ? t("Copied", "已复制") : "npx -y fusebox-mcp"}</button>
        </div>
      </div>
    </section>
  );
}
