"use client";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import type { DecisionRow } from "@/lib/atlas";
import { useLang } from "@/lib/i18n";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Alerts and exports for a wallet's decisions: browser notifications, an Atom feed, and the full history as CSV. */
export default function DecisionTools({ wallet, rows, fresh, names }: { wallet: Address; rows: DecisionRow[]; fresh: Set<number>; names: string[] }) {
  const key = `fusebox:notify:${wallet.toLowerCase()}`;
  const { t, zh } = useLang();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [on, setOn] = useState(false);
  const [copied, setCopied] = useState(false);
  const told = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (typeof Notification === "undefined") { setPerm("unsupported"); return; }
    setPerm(Notification.permission);
    try { setOn(localStorage.getItem(key) === "1" && Notification.permission === "granted"); } catch {}
  }, [key]);
  // a stopped payment while the page is open (even in a background tab) becomes a system notification
  useEffect(() => {
    if (!on || perm !== "granted" || !fresh.size) return;
    for (const r of rows) {
      if (!fresh.has(r.id) || r.allowed || told.current.has(r.id)) continue;
      told.current.add(r.id);
      const blew = r.status.map((s, i) => (s !== "pass" ? names[i] ?? (zh ? `保险丝 ${i + 1}` : `fuse ${i + 1}`) : null)).filter(Boolean).join(", ");
      try { new Notification(zh ? "Fusebox 拦截了一笔付款" : "Fusebox stopped a payment", { body: zh ? `向 ${short(r.to)} 付 ${r.amount} USD₮0：${blew} 说“否”。“${r.memo.slice(0, 80)}”` : `${r.amount} USD₮0 to ${short(r.to)}: ${blew} said no. “${r.memo.slice(0, 80)}”`, tag: `fusebox-${wallet}-${r.id}`, icon: "/icon.svg" }); } catch {}
    }
  }, [fresh, rows, on, perm, names, wallet, zh]);
  const toggle = async () => {
    if (perm === "unsupported") return;
    if (on) { setOn(false); try { localStorage.removeItem(key); } catch {} return; }
    const p = perm === "granted" ? "granted" : await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") { setOn(true); try { localStorage.setItem(key, "1"); } catch {} }
  };
  const feed = `/api/wallet/${wallet}/feed`;
  const copy = () => { navigator.clipboard?.writeText(`${location.origin}${feed}`); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const [badged, setBadged] = useState(false);
  // a README badge: the wallet's fuses and whether any is blown, live from X Layer
  const badge = () => { const o = location.origin; navigator.clipboard?.writeText(`[![Fusebox](${o}/api/badge/${wallet})](${o}/app/w/${wallet})`); setBadged(true); setTimeout(() => setBadged(false), 1600); };
  return (
    <div className="dtools m" role="group" aria-label={t("Alerts and exports", "提醒与导出")}>
      {perm !== "unsupported" && (
        <button className={`dt-btn${on ? " on" : ""}`} onClick={toggle} aria-pressed={on} disabled={perm === "denied"} title={perm === "denied" ? t("Notifications are blocked for this site in your browser's settings", "浏览器设置中已屏蔽本站通知") : t("A notification whenever a payment is stopped, while this page is open", "本页打开期间，每有一笔付款被拦截就发一条通知")}>
          <i aria-hidden="true" />{perm === "denied" ? t("Notifications blocked", "通知已屏蔽") : on ? t("Alerts on", "提醒已开启") : t("Alert me when one's stopped", "拦截时提醒我")}
        </button>
      )}
      <button className="dt-btn" onClick={copy} title={t("An Atom feed of every decision. Subscribe in Slack (/feed subscribe), an email digest or any feed reader.", "包含每条决策的 Atom 订阅源。可在 Slack（/feed subscribe）、邮件摘要或任何订阅阅读器中订阅。")}>{copied ? t("Feed URL copied", "订阅源链接已复制") : t("Copy feed URL", "复制订阅源链接")}</button>
      <a className="dt-btn" href={`/api/wallet/${wallet}/csv`} download>{t("Export CSV ↓", "导出 CSV ↓")}</a>
      <button className="dt-btn dt-badge" onClick={badge} title={t("Markdown for a README: the wallet's fuses and whether any is blown, live from X Layer.", "用于 README 的 Markdown：钱包的保险丝以及是否有熔断，实时读取自 X Layer。")}><img src={`/api/badge/${wallet}`} alt="" height={14} />{badged ? t("Badge copied", "徽章已复制") : t("Copy README badge", "复制 README 徽章")}</button>
    </div>
  );
}
