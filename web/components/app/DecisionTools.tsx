"use client";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import type { DecisionRow } from "@/lib/atlas";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Alerts and exports for a wallet's decisions: browser notifications, an Atom feed, and the full history as CSV. */
export default function DecisionTools({ wallet, rows, fresh, names }: { wallet: Address; rows: DecisionRow[]; fresh: Set<number>; names: string[] }) {
  const key = `fusebox:notify:${wallet.toLowerCase()}`;
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
      const blew = r.status.map((s, i) => (s !== "pass" ? names[i] ?? `fuse ${i + 1}` : null)).filter(Boolean).join(", ");
      try { new Notification("Fusebox stopped a payment", { body: `${r.amount} USD₮0 to ${short(r.to)}: ${blew} said no. “${r.memo.slice(0, 80)}”`, tag: `fusebox-${wallet}-${r.id}`, icon: "/icon.svg" }); } catch {}
    }
  }, [fresh, rows, on, perm, names, wallet]);
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
    <div className="dtools m" role="group" aria-label="Alerts and exports">
      {perm !== "unsupported" && (
        <button className={`dt-btn${on ? " on" : ""}`} onClick={toggle} aria-pressed={on} disabled={perm === "denied"} title={perm === "denied" ? "Notifications are blocked for this site in your browser's settings" : "A notification whenever a payment is stopped, while this page is open"}>
          <i aria-hidden="true" />{perm === "denied" ? "Notifications blocked" : on ? "Alerts on" : "Alert me when one's stopped"}
        </button>
      )}
      <button className="dt-btn" onClick={copy} title="An Atom feed of every decision. Subscribe in Slack (/feed subscribe), an email digest or any feed reader.">{copied ? "Feed URL copied" : "Copy feed URL"}</button>
      <a className="dt-btn" href={`/api/wallet/${wallet}/csv`} download>Export CSV ↓</a>
      <button className="dt-btn dt-badge" onClick={badge} title="Markdown for a README: the wallet's fuses and whether any is blown, live from X Layer."><img src={`/api/badge/${wallet}`} alt="" height={14} />{badged ? "Badge copied" : "Copy README badge"}</button>
    </div>
  );
}
