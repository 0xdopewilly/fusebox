"use client";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { short } from "@/lib/hooks";
import { subscribeMessage } from "@/lib/pushMessages";
import { useLang } from "@/lib/i18n";
import { useWallet } from "./WalletProvider";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
type State = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "working";

const b64urlBytes = (s: string) => { const b = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function deviceId(endpoint: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)));
  return Array.from(h.slice(0, 8), (x) => x.toString(16).padStart(2, "0")).join("");
}
/** The push API's error lines in Chinese (the ones a visitor can reach). */
const API_ERR_ZH: Record<string, string> = {
  "Alerts aren't set up on this server.": "这个服务器还没有配置提醒。",
  "That signature is too old; sign again.": "签名已过期，请重新签名。",
  "The signature isn't from that address.": "签名不是来自那个地址。",
  "That address isn't an approver on any Fusebox wallet yet.": "那个地址还不是任何 Fusebox 钱包的审批人。",
  "This device isn't getting alerts yet.": "这台设备还没有开启提醒。",
  "One test every 15 seconds.": "每 15 秒只能发送一次测试。",
};
const apiErrZh = (e: string) => API_ERR_ZH[e] ?? String(e).replace(/^Alerts are on for (\d+) devices already: turn one off first\.$/, "已有 $1 台设备开启了提醒：请先关闭其中一台。");
const post = (path: string, body: object) => fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));

/** Phone alerts for an approver: one signature turns them on for this device; a test proves they arrive. */
export default function ApproverAlerts({ account }: { account: Address }) {
  const { sign } = useWallet();
  const { t, zh } = useLang();
  const apiErr = (e: string) => (zh ? apiErrZh(e) : e);
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
      if (!ok) { setNote(j.error != null ? apiErr(j.error) : t("Couldn't turn alerts on.", "无法开启提醒。")); setState("off"); return; }
      setState("on"); setNote(t("Alerts are on. Send a test to see one arrive.", "提醒已开启。发一条测试看看能否收到。"));
    } catch (e) {
      setNote(/reject|denied|cancel/i.test((e as Error).message) ? t("Nothing changed: the signature was declined.", "没有任何改动：签名被拒绝了。") : t(`Couldn't turn alerts on: ${(e as Error).message}`, `无法开启提醒：${(e as Error).message}`));
      setState("off");
    }
  };
  const test = async () => {
    const sub = await current(); if (!sub) { setState("off"); return; }
    const { ok, j } = await post("/api/push/test", { approver: account, endpoint: sub.endpoint });
    setNote(ok ? (j.sent ? t("Test sent. It should arrive in a few seconds.", "测试已发送，几秒内就会收到。") : t("The push service didn't take it; turn alerts off and on again.", "推送服务没有接收；请关闭提醒后重新开启。")) : j.error != null ? apiErr(j.error) : t("Couldn't send a test.", "无法发送测试提醒。"));
  };
  const turnOff = async () => {
    const sub = await current();
    if (sub) await post("/api/push/unsubscribe", { approver: account, endpoint: sub.endpoint });
    setState("off"); setNote(t("Alerts are off for this address on this device.", "这台设备已关闭这个地址的提醒。"));
  };

  if (!KEY) return null;
  return (
    <section className="alerts" data-a aria-label={t("Phone alerts", "手机提醒")}>
      <div className="alerts-l">
        <span className={`alerts-dot${state === "on" ? " on" : ""}`} aria-hidden="true" />
        <div>
          <b>{state === "on" ? t("Alerts are on", "提醒已开启") : t("Get an alert when a payment waits on you", "有付款等你审批时，收到提醒")}</b>
          <p className="m mute">
            {state === "on" ? t(`This device hears about every payment waiting on ${short(account)}, the moment an agent asks.`, `智能体一发起请求，这台设备就会收到每笔等 ${short(account)} 审批的付款提醒。`)
              : state === "ios-install" ? t("On iPhone, alerts need Fusebox on your Home Screen: tap Share, then Add to Home Screen, and open it from there.", "在 iPhone 上，需要把 Fusebox 添加到主屏幕才能收到提醒：点“分享”，再点“添加到主屏幕”，然后从主屏幕打开。")
              : state === "unsupported" ? t("This browser can't show alerts. Try Chrome, Edge, Firefox or Safari 16.4+ (installed to the Home Screen on iPhone).", "这个浏览器无法显示提醒。请换用 Chrome、Edge、Firefox 或 Safari 16.4+（iPhone 上需添加到主屏幕）。")
              : state === "denied" ? t("Notifications are blocked for this site. Allow them in the browser's site settings, then come back.", "这个网站的通知已被屏蔽。请在浏览器的网站设置中允许通知，然后再回来。")
              : t("One signature (free, no transaction) proves this address is yours. Works on phones and desktops; install Fusebox as an app for the best delivery.", "签一次名（免费，不发交易）即可证明这个地址属于你。手机和电脑都能用；把 Fusebox 安装为应用，送达最可靠。")}
          </p>
          {note && <p className="m alerts-note" role="status">{note}</p>}
        </div>
      </div>
      <div className="alerts-r">
        {state === "on" ? <><button className="btn" onClick={test}>{t("Send a test", "发送测试")}</button><button className="dt-btn" onClick={turnOff}>{t("Turn off", "关闭")}</button></>
          : state === "off" || state === "working" ? <button className="btn lime" onClick={turnOn} disabled={state === "working"}>{state === "working" ? t("Setting up…", "设置中…") : <>{t("Turn on alerts", "开启提醒")} <span className="k">→</span></>}</button> : null}
      </div>
    </section>
  );
}
