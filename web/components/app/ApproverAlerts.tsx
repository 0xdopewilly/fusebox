"use client";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { short } from "@/lib/hooks";
import { subscribeMessage } from "@/lib/pushMessages";
import { useWallet } from "./WalletProvider";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
type State = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "working";

const b64urlBytes = (s: string) => { const b = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function deviceId(endpoint: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)));
  return Array.from(h.slice(0, 8), (x) => x.toString(16).padStart(2, "0")).join("");
}
const post = (path: string, body: object) => fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));

/** Phone alerts for an approver: one signature turns them on for this device; a test proves they arrive. */
export default function ApproverAlerts({ account }: { account: Address }) {
  const { sign } = useWallet();
  const [state, setState] = useState<State>("checking");
  const [note, setNote] = useState<string | null>(null);

  const current = useCallback(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return reg ? reg.pushManager.getSubscription() : null;
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
      const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!supported) { if (live) setState(ios && !standalone ? "ios-install" : "unsupported"); return; }
      if (Notification.permission === "denied") { if (live) setState("denied"); return; }
      const sub = await current().catch(() => null);
      if (!sub) { if (live) setState("off"); return; }
      const { j } = await post("/api/push/status", { approver: account, endpoint: sub.endpoint });
      if (live) setState(j.subscribed ? "on" : "off");
    })();
    return () => { live = false; };
  }, [account, current]);

  const turnOn = async () => {
    setState("working"); setNote(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlBytes(KEY) }));
      const issued = Math.floor(Date.now() / 1000);
      const signature = await sign(subscribeMessage(account, await deviceId(sub.endpoint), issued));
      const json = sub.toJSON();
      const { ok, j } = await post("/api/push/subscribe", { approver: account, subscription: { endpoint: json.endpoint, keys: json.keys }, issued, signature, label: navigator.platform });
      if (!ok) { setNote(j.error ?? "Couldn't turn alerts on."); setState("off"); return; }
      setState("on"); setNote("Alerts are on. Send a test to see one arrive.");
    } catch (e) {
      setNote(/reject|denied|cancel/i.test((e as Error).message) ? "Nothing changed: the signature was declined." : `Couldn't turn alerts on: ${(e as Error).message}`);
      setState("off");
    }
  };
  const test = async () => {
    const sub = await current(); if (!sub) { setState("off"); return; }
    const { ok, j } = await post("/api/push/test", { approver: account, endpoint: sub.endpoint });
    setNote(ok ? (j.sent ? "Test sent. It should arrive in a few seconds." : "The push service didn't take it; turn alerts off and on again.") : j.error ?? "Couldn't send a test.");
  };
  const turnOff = async () => {
    const sub = await current();
    if (sub) await post("/api/push/unsubscribe", { approver: account, endpoint: sub.endpoint });
    setState("off"); setNote("Alerts are off for this address on this device.");
  };

  if (!KEY) return null;
  return (
    <section className="alerts" data-a aria-label="Phone alerts">
      <div className="alerts-l">
        <span className={`alerts-dot${state === "on" ? " on" : ""}`} aria-hidden="true" />
        <div>
          <b>{state === "on" ? "Alerts are on" : "Get an alert when a payment waits on you"}</b>
          <p className="m mute">
            {state === "on" ? `This device hears about every payment waiting on ${short(account)}, the moment an agent asks.`
              : state === "ios-install" ? "On iPhone, alerts need Fusebox on your Home Screen: tap Share, then Add to Home Screen, and open it from there."
              : state === "unsupported" ? "This browser can't show alerts. Try Chrome, Edge, Firefox or Safari 16.4+ (installed to the Home Screen on iPhone)."
              : state === "denied" ? "Notifications are blocked for this site. Allow them in the browser's site settings, then come back."
              : "One signature (free, no transaction) proves this address is yours. Works on phones and desktops; install Fusebox as an app for the best delivery."}
          </p>
          {note && <p className="m alerts-note" role="status">{note}</p>}
        </div>
      </div>
      <div className="alerts-r">
        {state === "on" ? <><button className="btn" onClick={test}>Send a test</button><button className="dt-btn" onClick={turnOff}>Turn off</button></>
          : state === "off" || state === "working" ? <button className="btn lime" onClick={turnOn} disabled={state === "working"}>{state === "working" ? "Setting up…" : <>Turn on alerts <span className="k">→</span></>}</button> : null}
      </div>
    </section>
  );
}
