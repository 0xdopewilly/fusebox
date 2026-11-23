"use client";
import { useState } from "react";
import type { Address } from "viem";
import type { PaymentRequired } from "@/lib/x402core";
import type { CheckResult } from "@/lib/atlas";
import { short, OKLINK } from "@/lib/hooks";
import { PageChrome } from "./m/chrome";
import { useLang } from "@/lib/i18n";
import { whyZh } from "@/lib/whyZh";
import { errZh } from "@/lib/errZh";

export interface Offer { path: string; name: string; seller: string; price: string; payTo: Address; blurb: string; honest: boolean; url: string; offer: PaymentRequired | null }

const STEPS: [string, string][] = [
  ["GET /api/x402/prices", "The seller answers 402 with an offer in the PAYMENT-REQUIRED header: price, payee, and a nonce it signed."],
  ["check() on X Layer", "Before anything moves, the price goes through the wallet's TapeOut circuits like any payment. A no stops here, for free."],
  ["pay() through the fuses", "Every fuse decides in the same transaction; the memo carries the nonce, which ties the payment to this one offer."],
  ["Retry with the proof", "PAYMENT-SIGNATURE carries the transaction, signed by the agent that paid. The seller checks it on X Layer, serves the response and sends a receipt."],
];
const STEPS_ZH: [string, string][] = [
  ["GET /api/x402/prices", "卖家返回 402，并在 PAYMENT-REQUIRED 头里附上报价：价格、收款方，以及它签名的 nonce。"],
  ["在 X Layer 上 check()", "资金移动之前，价格会像任何付款一样经过钱包的 TapeOut 电路。被拒绝就停在这里，不花一分钱。"],
  ["pay() 经过保险丝", "每个保险丝都在同一笔交易里做出决策；备注带着 nonce，把这笔付款和这一份报价绑定在一起。"],
  ["带上证明重试", "PAYMENT-SIGNATURE 携带这笔交易，由付款的智能体签名。卖家在 X Layer 上核验后返回响应，并发送收据。"],
];
/** The demo sellers (lib/x402 DEMO_APIS) in Chinese, by path; a seller not listed here shows as it came. */
const OFFER_ZH: Record<string, { name: string; seller?: string; blurb: string }> = {
  "/api/x402/prices": { name: "实时棉花价格表", blurb: "Atlas 的真实供应商按次出售今日价格。已保存的收款方，每次一美分：所有保险丝都应放行。" },
  "/api/x402/scam": { name: "“批发棉花，三折，仅限今天”", seller: "一个没人保存过的地址", blurb: "智能体货比三家时可能碰到的好得离谱的报价。陌生收款方、高价：保险丝应在资金移动前拒绝它。" },
};
/** Tab labels for the code samples; the code itself stays as written. */
const CODE_TAB_ZH: Record<string, string> = { agent: "智能体 · fusebox-sdk", mcp: "智能体 · fusebox-mcp", seller: "卖家 · 任意 fetch 风格路由", facilitator: "卖家 · 你自己的 x402 栈" };
/** The check API's error lines, in Chinese. */
const API_ZH: Record<string, string> = {
  "Checks run against the demo wallets only.": "只能对演示钱包运行检查。",
  "Enter a valid 0x address for the payee.": "请输入有效的 0x 收款方地址。",
  "Enter an amount above 0, up to 6 decimals.": "请输入大于 0 的金额，最多 6 位小数。",
  "Couldn't reach X Layer just now. Try again.": "暂时连不上 X Layer，请重试。",
  "Couldn't reach X Layer.": "连不上 X Layer。",
  "Couldn't reach the server. Try again.": "连不上服务器，请重试。",
};

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
  const { t: tr, zh } = useLang();
  const oz = zh ? OFFER_ZH[o.path] : undefined;
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
      <div className="x4-card-h m"><span className={o.honest ? "lime" : "red"}>{o.honest ? tr("Honest seller", "诚实卖家") : tr("Scam seller", "诈骗卖家")}</span><a className="mute" href={o.path} target="_blank" rel="noreferrer">GET {o.path} ↗</a></div>
      <h3>{oz?.name ?? o.name}</h3>
      <p className="x4-blurb">{oz?.blurb ?? o.blurb}</p>
      <dl className="x4-kv m">
        <div><dt>{tr("Price", "价格")}</dt><dd>{o.price} USD₮0</dd></div>
        <div><dt>{tr("Pay to", "收款方")}</dt><dd><a href={`${OKLINK}/address/${o.payTo}`} target="_blank" rel="noreferrer">{short(o.payTo)} ↗</a><small>{oz?.seller ?? o.seller}</small></dd></div>
        <div><dt>{tr("Scheme", "方案")}</dt><dd>{req ? `${req.scheme} · ${req.network}` : "—"}</dd></div>
        <div><dt>Nonce</dt><dd title={nonce}>{nonce ? `${nonce.slice(0, 22)}…` : "—"}<small>{nonce ? tr(`good until ${new Date(Number(nonce.split(".")[0]) * 1000).toISOString().slice(11, 16)} UTC`, `有效期至 ${new Date(Number(nonce.split(".")[0]) * 1000).toISOString().slice(11, 16)} UTC`) : ""}</small></dd></div>
      </dl>
      <div className="x4-actions">
        <button className="btn lime" onClick={run} disabled={busy}>{busy ? tr("Asking X Layer…", "正在询问 X Layer…") : <>{tr("Would Atlas pay this?", "Atlas 会付这笔吗？")} <span className="k">→</span></>}</button>
        <button className="btn ghost" aria-expanded={raw} onClick={() => setRaw((v) => !v)}>{zh ? (raw ? "隐藏 402 报价" : "查看 402 报价") : <>{raw ? "Hide" : "Show"} the 402 offer</>}</button>
      </div>
      {raw && <pre className="x4-raw m" tabIndex={0}>{JSON.stringify(o.offer, null, 2)}</pre>}
      {err && <div className="err m">{zh ? API_ZH[err] ?? errZh(err) : err}</div>}
      {res && (
        <div className="x4-verdict">
          <div className="why">{res.fuses.map((f) => <div key={f.name}><span className="m mute">{f.name}</span><b className={f.status === "pass" ? "pass" : "blew"}>{f.status === "pass" ? tr("Passed", "通过") : tr("Stopped", "拦截")}</b><p>{zh ? whyZh(f.why) : f.why}</p></div>)}</div>
          <div className={`verdict2 m ${res.allowed ? "ok" : "no"}`}><span className="v">{res.allowed
            ? tr(`Every fuse holds. Atlas would pay ${o.price} USD₮0 and get the response.`, `所有保险丝放行。Atlas 会付 ${o.price} USD₮0 并拿到响应。`)
            : tr(`Refused before a cent moved: ${res.fuses.filter((f) => f.status !== "pass").map((f) => f.name).join(" and ")}.`, `资金移动前已拒绝：${res.fuses.filter((f) => f.status !== "pass").map((f) => f.name).join("、")}。`)}</span><span className="mute">{tr("check() · block", "check() · 区块")} {res.block.toLocaleString("en-US")}</span></div>
        </div>
      )}
    </article>
  );
}

export default function X402View({ offers, origin }: { offers: Offer[]; origin: string }) {
  const { t: tr, zh } = useLang();
  const [tab, setTab] = useState<keyof typeof CODE>("agent");
  const steps = zh ? STEPS_ZH : STEPS;
  const tabLabel = (k: string) => (zh ? CODE_TAB_ZH[k] ?? CODE[k][0] : CODE[k][0]);
  const TX = "https://www.oklink.com/xlayer/tx/0x058bd5ebfdee9be441a2d556f31bc5511c16e5a02b3ed60d7ba81dcc54d31f94";
  return (
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <PageChrome title={tr("Pay per call", "按次付费")} sub={tr("x402 through the fuses", "x402 经过保险丝")} info={<><p>{tr(
        <>Agents pay for APIs with x402: the server answers 402 with a price, the agent pays and asks again. With Fusebox the price goes through the wallet&apos;s fuses first, so a scam price list is stopped like a scam invoice, before anything moves.</>,
        <>智能体用 x402 为 API 付费：服务器返回 402 和价格，智能体付款后再请求一次。用了 Fusebox，价格会先经过钱包的保险丝，所以诈骗价目表会像诈骗发票一样，在资金移动前就被拦下。</>,
      )}</p>{steps.map(([h, p], i) => <p key={i}><b>0{i + 1} · {h}{tr(".", "。")}</b> {p}</p>)}</>} />
      <section className="try-head m-hide">
        <h1 className="disp" data-a>{tr(<>Pay <span className="lime">[per call]</span>.</>, <><span className="lime">[按次]</span>付费。</>)}</h1>
        <p data-a>{tr(
          <>Agents pay for APIs with x402: the server answers <span className="m lime">402</span> with a price, the agent pays and asks again. With Fusebox the price goes through the wallet&apos;s fuses first (logic circuits taped out on TapeOut), so a scam price list is stopped like a scam invoice, before anything moves.</>,
          <>智能体用 x402 为 API 付费：服务器返回 <span className="m lime">402</span> 和价格，智能体付款后再请求一次。用了 Fusebox，价格会先经过钱包的保险丝（在 TapeOut 上流片的逻辑电路），所以诈骗价目表会像诈骗发票一样，在资金移动前就被拦下。</>,
        )}</p>
      </section>

      <h2 className="sr">{tr("How a paid call works", "一次付费调用是怎么进行的")}</h2>
      <ol className="x4-steps m-hide" data-a>
        {steps.map(([h, p], i) => <li key={i}><span className="m lime">0{i + 1}</span><b className="m">{h}</b><p>{p}</p></li>)}
      </ol>

      <h2 className="x4-h m" data-a>{tr(<>Two live sellers <span className="mute">· real offers, signed just now</span></>, <>两个在线卖家 <span className="mute">· 真实报价，刚刚签名</span></>)}</h2>
      <div className="x4-cards">{offers.map((o) => <SellerCard key={o.path} o={o} />)}</div>
      <p className="proof m" data-a>{tr(
        <>The check is Atlas&apos;s real, read-only <span className="lime">check()</span> on X Layer. An agent using <span className="lime">fb.fetch()</span> or the MCP&apos;s <span className="lime">fusebox_fetch</span> runs the same check, then pays only what it allows. Atlas bought the price sheet for real on mainnet: <a className="lime" href={TX} target="_blank" rel="noreferrer">0.01 USD₮0 through four TapeOut fuses, decision #6 ↗</a></>,
        <>这里的检查是 Atlas 在 X Layer 上真实、只读的 <span className="lime">check()</span>。使用 <span className="lime">fb.fetch()</span> 或 MCP 的 <span className="lime">fusebox_fetch</span> 的智能体会运行同样的检查，然后只付它允许的部分。Atlas 已在主网上真实买过这份价格表：<a className="lime" href={TX} target="_blank" rel="noreferrer">0.01 USD₮0 经过四个 TapeOut 保险丝，决策 #6 ↗</a></>,
      )}</p>

      <section className="x4-code" data-a>
        <h2 className="x4-h m">{tr("Use it", "接入")}</h2>
        <div className="code x4-tabs">
          <div className="tabs m" role="tablist" aria-label={tr("Code samples", "代码示例")}>{(Object.keys(CODE) as (keyof typeof CODE)[]).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{tabLabel(k)}</button>)}</div>
          <pre className="x4-pre" tabIndex={0} role="tabpanel" aria-label={tabLabel(tab)}><code>{CODE[tab][1].replaceAll("https://fusebox-xlayer.vercel.app", origin.includes("localhost") ? origin : "https://fusebox-xlayer.vercel.app")}</code></pre>
        </div>
      </section>

      <section className="x4-why m-hide" data-a>
        <div><h3 className="m lime">{tr("Why a scheme of its own", "为什么要单独的方案")}</h3><p>{tr(
          <>x402&apos;s <span className="m">exact</span> scheme has the payer sign a USD₮0 transfer off-chain. A Fusebox wallet is a contract that only pays through its fuses, so it can&apos;t sign one, and shouldn&apos;t: that signature would skip the fuses. In the <span className="m">fusebox</span> scheme the on-chain Decision is the proof.</>,
          <>x402 的 <span className="m">exact</span> 方案要求付款方在链下签一笔 USD₮0 转账。Fusebox 钱包是只能经由保险丝付款的合约，所以它签不了，也不该签：那个签名会绕过保险丝。在 <span className="m">fusebox</span> 方案里，链上的 Decision 就是证明。</>,
        )}</p></div>
        <div><h3 className="m lime">{tr("What the seller checks", "卖家检查什么")}</h3><p>{tr(
          <>The factory made the paying wallet (<span className="m">isWallet</span>), its Decision allowed this payee and price, USD₮0 really moved, the memo carries this offer&apos;s nonce, and the transaction hasn&apos;t bought anything before.</>,
          <>付款钱包由工厂合约创建（<span className="m">isWallet</span>），它的 Decision 允许了这个收款方和价格，USD₮0 确实转出，备注里带着这份报价的 nonce，而且这笔交易之前没有买过任何东西。</>,
        )}</p></div>
        <div><h3 className="m lime">{tr(<>What the agent can&apos;t do</>, <>智能体做不到什么</>)}</h3><p>{tr(
          <>Pay a seller its owner never saved, pay over the daily cap, or pay a big price without two approvers, however the API words its offer. The fuses don&apos;t read the offer. They read the payee, the amount and the wallet.</>,
          <>付给所有者从未保存过的卖家、超过每日限额付款、没有两位审批人就付一笔高价，无论 API 的报价怎么措辞都不行。保险丝不读报价，只看收款方、金额和钱包。</>,
        )}</p></div>
      </section>
    </div>
  );
}
