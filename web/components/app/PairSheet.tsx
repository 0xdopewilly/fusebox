"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { encode } from "uqr";
import { OKX_DOWNLOAD } from "@/lib/walletLinks";
import type { PairLinks } from "@/lib/okxApp";

/** The pairing link as an SVG QR: one path, dark modules on a light tile so any phone camera reads it. */
function Qr({ text }: { text: string }) {
  const { d, n } = useMemo(() => {
    const q = encode(text, { ecc: "M", border: 2 });
    let d = "";
    q.data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z`; }));
    return { d, n: q.data.length };
  }, [text]);
  return <svg className="pair-qr" viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label="QR code to connect with OKX Wallet"><rect width={n} height={n} fill="#f2f2ee" /><path d={d} fill="#050505" /></svg>;
}

const appTap = (l: PairLinks) => (/Android/i.test(navigator.userAgent) && l.deep ? l.deep : l.universal);

/** While a signature waits on the OKX Wallet app: where to approve it, and on a phone the tap that opens the app. */
export function ApproveNudge({ links, mobile }: { links: PairLinks; mobile: boolean }) {
  return (
    <div className="nudge m" role="status">
      <span className="live" />
      <span className="nudge-t">{mobile ? "Approve in OKX Wallet, then come back" : "Approve it in OKX Wallet on your phone"}</span>
      {mobile && <a className="btn lime" href={appTap(links)}>Open <span className="k">↗</span></a>}
    </div>
  );
}

/** Pairing with the OKX Wallet app: a QR to scan on desktop; on a phone, the app opens and this waits for the approval. */
export default function PairSheet({ links, mobile, onCancel }: { links: PairLinks | null; mobile: boolean; onCancel: () => void }) {
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
        <div className="pair-top m"><span className="lime">OKX Wallet app</span><span className="mute">X Layer · chain 196</span></div>
        <h2 id="pair-h">{mobile ? "Approve in OKX Wallet" : "Scan to connect"}</h2>
        {mobile ? (
          <>
            <p className="pair-p">Tap below to open OKX Wallet, approve Fusebox there, then come back to this tab: it connects by itself.</p>
            {tap ? <a className="btn lime pair-open" href={tap}>Open OKX Wallet <span className="k">↗</span></a> : <span className="btn pair-open" aria-disabled="true">Preparing the link…</span>}
          </>
        ) : (
          <>
            <div className="pair-tile">{uri ? <Qr text={uri} /> : <div className="pair-wait m mute">Opening a pairing…</div>}</div>
            <ol className="pair-steps m">
              <li><b>01</b>Open OKX Wallet on your phone</li>
              <li><b>02</b>Tap the scan icon and point it here</li>
              <li><b>03</b>Approve Fusebox on X Layer</li>
            </ol>
          </>
        )}
        <div className="pair-status m" aria-live="polite"><span className="live" />{uri ? "Waiting for your approval…" : "Reaching OKX's relay…"}</div>
        <div className="pair-act m">
          <button className="btn" onClick={onCancel}>Cancel</button>
          {!mobile && uri && <button className="btn" onClick={() => { navigator.clipboard?.writeText(uri); setCopied(true); }}>{copied ? "Copied ✓" : "Copy link"}</button>}
          <a className="pair-get" href={OKX_DOWNLOAD} target="_blank" rel="noreferrer">No OKX Wallet? Get it ↗</a>
        </div>
      </div>
    </div>
  );
}
