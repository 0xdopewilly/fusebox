"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { encode } from "uqr";
import { OKX_DOWNLOAD } from "@/lib/walletLinks";
import type { PairLinks } from "@/lib/okxApp";
import { useLang } from "@/lib/i18n";

/** The pairing link as an SVG QR: one path, dark modules on a light tile so any phone camera reads it. */
function Qr({ text }: { text: string }) {
  const { t } = useLang();
  const { d, n } = useMemo(() => {
    const q = encode(text, { ecc: "M", border: 2 });
    let d = "";
    q.data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z`; }));
    return { d, n: q.data.length };
  }, [text]);
  return <svg className="pair-qr" viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label={t("QR code to connect with OKX Wallet", "用 OKX Wallet 连接的二维码")}><rect width={n} height={n} fill="#f2f2ee" /><path d={d} fill="#050505" /></svg>;
}

const appTap = (l: PairLinks) => (/Android/i.test(navigator.userAgent) && l.deep ? l.deep : l.universal);

/** While a signature waits on the OKX Wallet app: where to approve it, and on a phone the tap that opens the app. */
export function ApproveNudge({ links, mobile }: { links: PairLinks; mobile: boolean }) {
  const { t } = useLang();
  return (
    <div className="nudge m" role="status">
      <span className="live" />
      <span className="nudge-t">{mobile ? t("Approve in OKX Wallet, then come back", "在 OKX Wallet 中确认后返回") : t("Approve it in OKX Wallet on your phone", "请在手机上的 OKX Wallet 中确认")}</span>
      {mobile && <a className="btn lime" href={appTap(links)}>{t("Open", "打开")} <span className="k">↗</span></a>}
    </div>
  );
}

/** Pairing with the OKX Wallet app: a QR to scan on desktop; on a phone, the app opens and this waits for the approval. */
export default function PairSheet({ links, mobile, onCancel }: { links: PairLinks | null; mobile: boolean; onCancel: () => void }) {
  const { t } = useLang();
  const uri = links?.universal ?? null;
  // Android hands the app's own scheme straight to the app; iPhones open the app from the https link.
  const tap = links ? appTap(links) : null;
  const box = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    box.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCancel]);
  return (
    <div className="pair-shade" onClick={onCancel}>
      <div className={`pair${mobile ? " mob" : ""}`} ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="pair-h" onClick={(e) => e.stopPropagation()}>
        <div className="pair-top m"><span className="lime">{t("OKX Wallet app", "OKX Wallet App")}</span><span className="mute">{t("X Layer · chain 196", "X Layer · 链 ID 196")}</span></div>
        <h2 id="pair-h">{mobile ? t("Approve in OKX Wallet", "在 OKX Wallet 中确认") : t("Scan to connect", "扫码连接")}</h2>
        {mobile ? (
          <>
            <p className="pair-p">{t("Tap below to open OKX Wallet, approve Fusebox there, then come back to this tab: it connects by itself.", "点击下方打开 OKX Wallet，在其中确认 Fusebox，然后回到这个页面：它会自动连接。")}</p>
            {tap ? <a className="btn lime pair-open" href={tap}>{t("Open OKX Wallet", "打开 OKX Wallet")} <span className="k">↗</span></a> : <span className="btn pair-open" aria-disabled="true">{t("Preparing the link…", "正在准备链接…")}</span>}
          </>
        ) : (
          <>
            <div className="pair-tile">{uri ? <Qr text={uri} /> : <div className="pair-wait m mute">{t("Opening a pairing…", "正在发起配对…")}</div>}</div>
            <ol className="pair-steps m">
              <li><b>01</b>{t("Open OKX Wallet on your phone", "在手机上打开 OKX Wallet")}</li>
              <li><b>02</b>{t("Tap the scan icon and point it here", "点击扫一扫图标，对准这里")}</li>
              <li><b>03</b>{t("Approve Fusebox on X Layer", "在 X Layer 上确认 Fusebox")}</li>
            </ol>
          </>
        )}
        <div className="pair-status m" aria-live="polite"><span className="live" />{uri ? t("Waiting for your approval…", "等待你确认…") : t("Reaching OKX's relay…", "正在连接 OKX 中继…")}</div>
        <div className="pair-act m">
          <button className="btn" onClick={onCancel}>{t("Cancel", "取消")}</button>
          {!mobile && uri && <button className="btn" onClick={() => { navigator.clipboard?.writeText(uri); setCopied(true); }}>{copied ? t("Copied ✓", "已复制 ✓") : t("Copy link", "复制链接")}</button>}
          <a className="pair-get" href={OKX_DOWNLOAD} target="_blank" rel="noreferrer">{t("No OKX Wallet? Get it ↗", "没有 OKX Wallet？去下载 ↗")}</a>
        </div>
      </div>
    </div>
  );
}
