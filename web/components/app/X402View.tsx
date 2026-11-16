"use client";
import { useState } from "react";
import type { Address } from "viem";
import type { PaymentRequired } from "@/lib/x402core";
import type { CheckResult } from "@/lib/atlas";
import { short, OKLINK } from "@/lib/hooks";

export interface Offer { path: string; name: string; seller: string; price: string; payTo: Address; blurb: string; honest: boolean; url: string; offer: PaymentRequired | null }

const STEPS: [string, string][] = [
  ["GET /api/x402/prices", "The seller answers 402 with an offer in the PAYMENT-REQUIRED header: price, payee, and a nonce it signed."],
  ["check() on X Layer", "Before anything moves, the price goes through the wallet's TapeOut circuits like any payment. A no stops here, for free."],
  ["pay() through the fuses", "Every fuse decides in the same transaction; the memo carries the nonce, which ties the payment to this one offer."],
  ["Retry with the proof", "PAYMENT-SIGNATURE carries the transaction. The seller checks it on X Layer, serves the response and sends a receipt."],
];

const CODE: Record<string, [string, string]> = {
  agent: ["Agent · fusebox-sdk", `import { Fusebox } from "fusebox-sdk";

const fb = new Fusebox({ wallet: "0xYourFuseboxWallet", account: process.env.AGENT_KEY });

// pays only if the price clears maxPrice and every fuse on the wallet
const { response, payment } = await fb.fetch("https://fusebox-xlayer.vercel.app/api/x402/prices", {}, { maxPrice: "0.05" });
console.log(payment?.summary);   // Paid 0.01 USD₮0 to 0x69dB… for …/prices (decision #7).
const prices = await response.json();`],
  mcp: ["Agent · fusebox-mcp", `// Claude Desktop, Cursor, any MCP client
{ "mcpServers": { "fusebox": {
  "command": "npx", "args": ["-y", "fusebox-mcp"],
  "env": { "FUSEBOX_WALLET": "0xYourFuseboxWallet", "FUSEBOX_AGENT_KEY": "0x…" }
} } }

// then the agent calls
fusebox_fetch({ url: "https://fusebox-xlayer.vercel.app/api/x402/prices", max_price: "0.05" })`],
  seller: ["Seller · any fetch-style route", `import { createPublicClient, http } from "viem";
import { xLayer, x402 } from "fusebox-sdk";

const client = createPublicClient({ chain: xLayer, transport: http() });

export async function GET(req: Request) {
  const g = await x402.requirePayment(req, {
    payTo: "0xYou", price: "0.01", secret: process.env.X402_SECRET!, client,
    markUsed: (tx) => db.insertIfAbsent("x402:" + tx),   // one payment buys one response
  });
  if (!g.paid) return g.response;                // 402 with a fresh offer, or why it didn't count
  return Response.json(await getData(), { headers: g.headers });
}`],
  facilitator: ["Seller · your own x402 stack", `# Fusebox's hosted facilitator for the "fusebox" scheme (x402's verify / settle shape)
curl https://fusebox-xlayer.vercel.app/api/x402/facilitator/supported

curl -X POST https://fusebox-xlayer.vercel.app/api/x402/facilitator/settle \\
  -H 'content-type: application/json' \\
  -d '{ "paymentPayload": { … }, "paymentRequirements": { … } }'
# → { "success": true, "transaction": "0x…", "payer": "0x…" }   (once per payment)`],
};

function SellerCard({ o }: { o: Offer }) {
  const [res, setRes] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const req = o.offer?.accepts.find((a) => a.scheme === "fusebox");
  const nonce = String(req?.extra?.nonce ?? "");
  const run = async () => {
    setBusy(true); setErr(null);
    try { const r = await fetch(`/api/check?to=${o.payTo}&amount=${o.price}`); const j = await r.json(); if (!r.ok) setErr(j.error ?? "Couldn't reach X Layer."); else setRes(j); }
    catch { setErr("Couldn't reach the server. Try again."); } finally { setBusy(false); }
  };
  return (
    <article className={`x4-card${o.honest ? "" : " scam"}`} data-a>
      <div className="x4-card-h m"><span className={o.honest ? "lime" : "red"}>{o.honest ? "Honest seller" : "Scam seller"}</span><a className="mute" href={o.path} target="_blank" rel="noreferrer">GET {o.path} ↗</a></div>
      <h3>{o.name}</h3>
      <p className="x4-blurb">{o.blurb}</p>
      <dl className="x4-kv m">
        <div><dt>Price</dt><dd>{o.price} USD₮0</dd></div>
        <div><dt>Pay to</dt><dd><a href={`${OKLINK}/address/${o.payTo}`} target="_blank" rel="noreferrer">{short(o.payTo)} ↗</a><small>{o.seller}</small></dd></div>
        <div><dt>Scheme</dt><dd>{req ? `${req.scheme} · ${req.network}` : "—"}</dd></div>
        <div><dt>Nonce</dt><dd title={nonce}>{nonce ? `${nonce.slice(0, 22)}…` : "—"}<small>{nonce ? `good until ${new Date(Number(nonce.split(".")[0]) * 1000).toISOString().slice(11, 16)} UTC` : ""}</small></dd></div>
      </dl>
      <div className="x4-actions">
        <button className="btn lime" onClick={run} disabled={busy}>{busy ? "Asking X Layer…" : <>Would Atlas pay this? <span className="k">→</span></>}</button>
        <button className="btn ghost" aria-expanded={raw} onClick={() => setRaw((v) => !v)}>{raw ? "Hide" : "Show"} the 402 offer</button>
      </div>
      {raw && <pre className="x4-raw m" tabIndex={0}>{JSON.stringify(o.offer, null, 2)}</pre>}
      {err && <div className="err m">{err}</div>}
      {res && (
        <div className="x4-verdict">
          <div className="why">{res.fuses.map((f) => <div key={f.name}><span className="m mute">{f.name}</span><b className={f.status === "pass" ? "pass" : "blew"}>{f.status === "pass" ? "Holds" : "Blew"}</b><p>{f.why}</p></div>)}</div>
          <div className={`verdict2 m ${res.allowed ? "ok" : "no"}`}><span className="v">{res.allowed ? `Every fuse holds. Atlas would pay ${o.price} USD₮0 and get the response.` : `Refused before a cent moved: ${res.fuses.filter((f) => f.status !== "pass").map((f) => f.name).join(" and ")}.`}</span><span className="mute">check() · block {res.block.toLocaleString("en-US")}</span></div>
        </div>
      )}
    </article>
  );
}

export default function X402View({ offers, origin }: { offers: Offer[]; origin: string }) {
  const [tab, setTab] = useState<keyof typeof CODE>("agent");
  return (
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <section className="try-head">
        <h1 className="disp" data-a>Pay <span className="lime">[per call]</span>.</h1>
        <p data-a>Agents pay for APIs with x402: the server answers <span className="m lime">402</span> with a price, the agent pays and asks again. With Fusebox the price goes through the wallet&apos;s fuses first (logic circuits taped out on TapeOut), so a scam price list is stopped like a scam invoice, before anything moves.</p>
      </section>

      <h2 className="sr">How a paid call works</h2>
      <ol className="x4-steps" data-a>
        {STEPS.map(([h, p], i) => <li key={h}><span className="m lime">0{i + 1}</span><b className="m">{h}</b><p>{p}</p></li>)}
      </ol>

      <h2 className="x4-h m" data-a>Two live sellers <span className="mute">· real offers, signed just now</span></h2>
      <div className="x4-cards">{offers.map((o) => <SellerCard key={o.path} o={o} />)}</div>
      <p className="proof m" data-a>The check is Atlas&apos;s real, read-only <span className="lime">check()</span> on X Layer. An agent using <span className="lime">fb.fetch()</span> or the MCP&apos;s <span className="lime">fusebox_fetch</span> runs the same check, then pays only what it allows. Atlas bought the price sheet for real on mainnet: <a className="lime" href="https://www.oklink.com/xlayer/tx/0x058bd5ebfdee9be441a2d556f31bc5511c16e5a02b3ed60d7ba81dcc54d31f94" target="_blank" rel="noreferrer">0.01 USD₮0 through four TapeOut fuses, decision #6 ↗</a></p>

      <section className="x4-code" data-a>
        <h2 className="x4-h m">Use it</h2>
        <div className="code x4-tabs">
          <div className="tabs m" role="tablist" aria-label="Code samples">{(Object.keys(CODE) as (keyof typeof CODE)[]).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{CODE[k][0]}</button>)}</div>
          <pre className="x4-pre" tabIndex={0} role="tabpanel" aria-label={CODE[tab][0]}><code>{CODE[tab][1].replaceAll("https://fusebox-xlayer.vercel.app", origin.includes("localhost") ? origin : "https://fusebox-xlayer.vercel.app")}</code></pre>
        </div>
      </section>

      <section className="x4-why" data-a>
        <div><h3 className="m lime">Why a scheme of its own</h3><p>x402&apos;s <span className="m">exact</span> scheme has the payer sign a USD₮0 transfer off-chain. A Fusebox wallet is a contract that only pays through its fuses, so it can&apos;t sign one, and shouldn&apos;t: that signature would skip the fuses. In the <span className="m">fusebox</span> scheme the on-chain Decision is the proof.</p></div>
        <div><h3 className="m lime">What the seller checks</h3><p>The factory made the paying wallet (<span className="m">isWallet</span>), its Decision allowed this payee and price, USD₮0 really moved, the memo carries this offer&apos;s nonce, and the transaction hasn&apos;t bought anything before.</p></div>
        <div><h3 className="m lime">What the agent can&apos;t do</h3><p>Pay a seller its owner never saved, pay over the daily cap, or pay a big price without two approvers, however the API words its offer. The fuses don&apos;t read the offer. They read the payee, the amount and the wallet.</p></div>
      </section>
    </div>
  );
}
