/**
 * x402 for Fusebox: pay-per-call HTTP where the price goes through the wallet's fuses before anything moves.
 *
 * A seller answers 402 with an x402 v2 offer (the PAYMENT-REQUIRED header) that lists a `fusebox` option on X Layer
 * (eip155:196) in USDT0, with a one-time nonce. The buyer's Fusebox wallet pays it with `pay()`, so every fuse decides
 * first, and the memo carries the nonce. The buyer retries with the transaction in PAYMENT-SIGNATURE. The seller checks
 * on X Layer that the wallet was made by the Fusebox factory, that its Decision allowed this exact payment with that
 * nonce, that USDT0 really moved to it, and that the transaction hasn't bought anything before.
 *
 * Why a scheme of its own: x402's `exact` EVM scheme needs an EIP-3009 signature from the payer, and a Fusebox wallet
 * is a contract that only pays through its fuses, so the on-chain Decision is the proof instead.
 *
 * This file depends only on viem so the hosted app can carry a copy (web/lib/x402core.ts, synced from here).
 */
import { decodeEventLog, formatUnits, getAddress, isAddress, parseAbi, recoverMessageAddress, type Address, type Hash, type Hex, type PublicClient } from "viem";

export const X402_VERSION = 2;
export const FUSEBOX_SCHEME = "fusebox";
export const XLAYER_NETWORK = "eip155:196";
export const USDT0: Address = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
export const FACTORY: Address = "0x192C099a18ed42612b6e74f243f8dF1EE0E3E7a5";
/** Both Fusebox factories on X Layer mainnet: v1 (Nov 15, Atlas) and v2 (Nov 20, the Repeat Guard). */
export const FACTORIES: Address[] = [FACTORY, "0xdFc9b1d715efB2bCDAd8f848A5E3b4e2c243EE9B"];
/** the x402 v2 headers (v1 servers used X-PAYMENT / X-PAYMENT-RESPONSE and the JSON body) */
export const HEADER = { required: "PAYMENT-REQUIRED", signature: "PAYMENT-SIGNATURE", response: "PAYMENT-RESPONSE", v1Payment: "X-PAYMENT", v1Response: "X-PAYMENT-RESPONSE" } as const;

export interface ResourceInfo { url: string; description?: string; mimeType?: string; serviceName?: string }
export interface PaymentRequirements {
  scheme: string; network: string; asset: string; amount: string; payTo: string; maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}
export interface PaymentRequired { x402Version: number; error?: string; resource: ResourceInfo; accepts: PaymentRequirements[] }
/**
 * The proof a buyer sends back: the wallet, the payment's transaction, and the paying agent's signature over
 * {@link proofMessage}. The transaction and nonce are public once the payment lands; the signature is what stops
 * someone watching the chain from redeeming the payment before the buyer does.
 */
export interface FuseboxPayload { wallet: Address; transaction: Hash; decisionId?: number; signature?: Hex }
export interface PaymentPayload { x402Version: number; resource?: ResourceInfo; accepted: PaymentRequirements; payload: FuseboxPayload & Record<string, unknown> }
export interface SettleResponse { success: boolean; transaction: string; network: string; payer?: string; errorReason?: string; errorMessage?: string }
export interface VerifyResponse { isValid: boolean; invalidReason?: string; invalidMessage?: string; payer?: string; decisionId?: number; amount?: string }

// ---------------------------------------------------------------- headers: base64 of UTF-8 JSON, as @x402/core does

export function encodeHeader(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function decodeHeader<T>(value: string): T {
  const bin = atob(value.trim());
  const j = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  if (typeof j !== "object" || j === null || Array.isArray(j)) throw new Error("x402 header must decode to a JSON object");
  return j as T;
}

/** The 402 offer from a response: the v2 header, or a v1 JSON body (maxAmountRequired) mapped onto v2. */
export async function readPaymentRequired(res: Response): Promise<PaymentRequired | null> {
  const h = res.headers.get(HEADER.required);
  if (h) { try { return decodeHeader<PaymentRequired>(h); } catch { /* fall through to the body */ } }
  try {
    const j = (await res.clone().json()) as { x402Version?: number; accepts?: (PaymentRequirements & { maxAmountRequired?: string; resource?: string; description?: string })[]; resource?: ResourceInfo; error?: string };
    if (!Array.isArray(j.accepts)) return null;
    return {
      x402Version: j.x402Version ?? 1, error: j.error,
      resource: j.resource ?? { url: j.accepts[0]?.resource ?? res.url, description: j.accepts[0]?.description },
      accepts: j.accepts.map((a) => ({ ...a, amount: a.amount ?? a.maxAmountRequired ?? "0", extra: a.extra ?? {} })),
    };
  } catch { return null; }
}

/** The Fusebox option in an offer, if the seller takes one. */
export function pickFusebox(pr: PaymentRequired): PaymentRequirements | undefined {
  return pr.accepts.find((a) => a.scheme === FUSEBOX_SCHEME && a.network === XLAYER_NETWORK && a.asset.toLowerCase() === USDT0.toLowerCase() && isAddress(a.payTo, { strict: false }));
}

/** What the buyer writes in the on-chain memo: the seller's nonce (what binds the payment to this offer) and the resource. */
export function memoFor(req: PaymentRequirements, resourceUrl: string): string {
  let where = resourceUrl; try { const u = new URL(resourceUrl); where = u.host + u.pathname; } catch { /* keep as given */ }
  return `x402 ${String(req.extra.nonce ?? "")} ${where}`.slice(0, 200);
}

// ---------------------------------------------------------------- nonces (seller side, stateless)

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg))).slice(0, 16));
}
/** A nonce that names its own expiry and is signed for one resource, payee and price: `<expiry>.<random>.<mac>`. */
export async function issueNonce(secret: string, bind: string, ttlSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const rand = b64url(crypto.getRandomValues(new Uint8Array(9)));
  return `${exp}.${rand}.${await hmac(secret, `${exp}.${rand}|${bind}`)}`;
}
export async function checkNonce(secret: string, bind: string, nonce: string): Promise<"ok" | "expired" | "forged"> {
  const [exp, rand, mac] = nonce.split(".");
  if (!exp || !rand || !mac || !/^\d+$/.test(exp)) return "forged";
  if ((await hmac(secret, `${exp}.${rand}|${bind}`)) !== mac) return "forged";
  return Number(exp) < Date.now() / 1000 ? "expired" : "ok";
}

// ---------------------------------------------------------------- verifying a payment on X Layer

/** What the paying agent signs (EIP-191) to claim its payment: the offer's nonce and the transaction. */
export function proofMessage(nonce: string, transaction: string): string {
  return `Fusebox x402 payment\nnonce: ${nonce}\ntransaction: ${transaction.toLowerCase()}`;
}

const decisionAbi = parseAbi([
  "event Decision(uint256 indexed decisionId, address indexed agent, address indexed to, address token, uint256 amount, bool allowed, uint256[] fuseIds, uint8[] status, bytes[] inputs, bytes[] outputs, uint256 feePaid, bytes32 intent, string memo)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function isWallet(address) view returns (bool)",
]);

/**
 * Check a Fusebox payment against what was asked for. Read-only: it doesn't mark the transaction used (do that with
 * your own store once this says it's valid, so one payment can't buy twice).
 */
export async function verifyFuseboxPayment(client: PublicClient, payload: PaymentPayload, required: PaymentRequirements, opts: { factory?: Address | Address[] } = {}): Promise<VerifyResponse> {
  const bad = (invalidReason: string, invalidMessage: string): VerifyResponse => ({ isValid: false, invalidReason, invalidMessage });
  const a = payload.accepted, p = payload.payload;
  if (a?.scheme !== FUSEBOX_SCHEME || a.network !== XLAYER_NETWORK) return bad("unsupported_scheme", "Only the fusebox scheme on eip155:196 is checked here.");
  if (a.asset.toLowerCase() !== required.asset.toLowerCase() || a.payTo.toLowerCase() !== required.payTo.toLowerCase() || a.amount !== required.amount) return bad("requirements_mismatch", "The payment answers a different offer (asset, payee or price).");
  if (String(a.extra?.nonce ?? "") !== String(required.extra?.nonce ?? "")) return bad("requirements_mismatch", "The payment answers a different offer (nonce).");
  if (!p || !isAddress(String(p.wallet), { strict: false }) || !/^0x[0-9a-fA-F]{64}$/.test(String(p.transaction))) return bad("invalid_payload", "The payload needs the wallet and the transaction hash.");
  const wallet = getAddress(String(p.wallet).toLowerCase()), payTo = getAddress(required.payTo.toLowerCase()), asset = getAddress(required.asset.toLowerCase());
  const need = BigInt(required.amount), nonce = String(required.extra?.nonce ?? "");

  const [genuine, receipt] = await Promise.all([
    // made by any of the given factories (default: both of mainnet's); null only if none could be read
    Promise.all([opts.factory ?? FACTORIES].flat().map((f) => client.readContract({ address: f, abi: decisionAbi, functionName: "isWallet", args: [wallet] }).catch(() => null)))
      .then((r) => (r.some((x) => x === true) ? true : r.every((x) => x === null) ? null : false)),
    client.getTransactionReceipt({ hash: p.transaction as Hash }).catch(() => null),
  ]);
  if (genuine === null) return bad("unavailable", "Couldn't reach X Layer to check the wallet.");
  if (!genuine) return bad("not_a_fusebox_wallet", `${wallet} wasn't made by the Fusebox factory, so its Decision events prove nothing.`);
  if (!receipt) return bad("transaction_not_found", "The transaction isn't on X Layer (yet).");
  if (receipt.status !== "success") return bad("transaction_failed", "The transaction reverted.");

  let decision: { decisionId: bigint; agent: Address; to: Address; token: Address; amount: bigint; allowed: boolean; memo: string } | undefined;
  let moved = 0n;
  for (const l of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: decisionAbi, data: l.data, topics: l.topics });
      if (ev.eventName === "Decision" && l.address.toLowerCase() === wallet.toLowerCase()) decision = ev.args as typeof decision;
      if (ev.eventName === "Transfer" && l.address.toLowerCase() === asset.toLowerCase() && ev.args.from.toLowerCase() === wallet.toLowerCase() && ev.args.to.toLowerCase() === payTo.toLowerCase()) moved += ev.args.value;
    } catch { /* another contract's event */ }
  }
  if (!decision) return bad("no_decision", "The transaction has no Decision from that wallet.");
  if (!decision.allowed) return bad("fuses_refused", "The wallet's fuses refused this payment, so nothing moved.");
  if (decision.to.toLowerCase() !== payTo.toLowerCase() || decision.token.toLowerCase() !== asset.toLowerCase()) return bad("wrong_payee", "The Decision paid someone else, or in another token.");
  if (decision.amount < need || moved < need) return bad("insufficient_amount", `Paid ${formatUnits(moved, 6)}, asked ${formatUnits(need, 6)}.`);
  if (nonce && !decision.memo.includes(nonce)) return bad("nonce_missing", "The payment's memo doesn't carry this offer's nonce.");
  // only the agent that paid can claim it: anyone can read the transaction and nonce off the chain
  const sig = String(p.signature ?? "");
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) return bad("unsigned", "The proof needs the paying agent's signature over the nonce and transaction.");
  let signer: Address | null = null;
  try { signer = await recoverMessageAddress({ message: proofMessage(nonce, p.transaction), signature: sig as Hex }); } catch { /* malformed */ }
  if (!signer || signer.toLowerCase() !== decision.agent.toLowerCase()) return bad("not_the_payer", "The proof isn't signed by the agent that made this payment.");
  return { isValid: true, payer: wallet, decisionId: Number(decision.decisionId), amount: formatUnits(decision.amount, 6) };
}

// ---------------------------------------------------------------- the seller's side in one call

export interface SellerOptions {
  /** who gets paid (a Fusebox wallet's saved payee, typically) */
  payTo: Address;
  /** the price per call, in USDT0, e.g. "0.01" */
  price: string;
  /** a long random string kept on the server: it signs the nonces */
  secret: string;
  client: PublicClient;
  /** the Fusebox factory, or factories, one of which must have made the paying wallet (default: both of mainnet's) */
  factory?: Address | Address[];
  description?: string; mimeType?: string;
  /** how long an offer stays good (default 600 s) */
  ttlSeconds?: number;
  /**
   * Record that a transaction has bought something; resolve true the first time and false after. Without one, an
   * in-memory set is used, which doesn't survive restarts or span serverless instances.
   */
  markUsed?: (tx: string) => Promise<boolean>;
}

const seen = new Set<string>();
const memoryMark = async (tx: string) => { if (seen.has(tx)) return false; seen.add(tx); return true; };

/** Turn the price into atomic USDT0 units ("0.01" → "10000"). */
export function atomic(price: string): string {
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(price) || Number(price) <= 0) throw new Error(`"${price}" isn't a USDT0 price above 0 with up to 6 decimals.`);
  const [i, f = ""] = price.split(".");
  return (BigInt(i) * 1_000_000n + BigInt(f.padEnd(6, "0"))).toString();
}

/**
 * Gate a request behind a Fusebox payment. Returns `{ paid: false, response }` (a 402 with a fresh offer, or the reason
 * the payment didn't count) or `{ paid: true, payer, ... , headers }`: serve the resource and add `headers` to it.
 */
export async function requirePayment(req: Request, o: SellerOptions): Promise<
  | { paid: false; response: Response }
  | { paid: true; payer: Address; transaction: Hash; decisionId?: number; headers: Record<string, string> }
> {
  const url = new URL(req.url);
  const amount = atomic(o.price), payTo = getAddress(o.payTo.toLowerCase());
  const bind = `${url.pathname}|${payTo.toLowerCase()}|${amount}`;
  const resource: ResourceInfo = { url: url.origin + url.pathname, description: o.description, mimeType: o.mimeType ?? "application/json" };
  const offer = async (error?: string) => {
    const nonce = await issueNonce(o.secret, bind, o.ttlSeconds ?? 600);
    const accepts: PaymentRequirements[] = [{ scheme: FUSEBOX_SCHEME, network: XLAYER_NETWORK, asset: USDT0, amount, payTo, maxTimeoutSeconds: o.ttlSeconds ?? 600, extra: { name: "USD₮0", decimals: 6, nonce, memo: "write `x402 <nonce>` in the payment's memo" } }];
    const body: PaymentRequired = { x402Version: X402_VERSION, error, resource, accepts };
    return { paid: false as const, response: new Response(JSON.stringify(body), { status: 402, headers: { "content-type": "application/json", [HEADER.required]: encodeHeader(body), "cache-control": "no-store" } }) };
  };
  const sig = req.headers.get(HEADER.signature) ?? req.headers.get(HEADER.v1Payment);
  if (!sig) return offer();
  let payload: PaymentPayload;
  try { payload = decodeHeader<PaymentPayload>(sig); } catch { return offer("The payment header isn't valid base64 JSON."); }
  const nonce = String(payload.accepted?.extra?.nonce ?? "");
  const n = await checkNonce(o.secret, bind, nonce);
  if (n !== "ok") return offer(n === "expired" ? "That offer expired: pay this new one." : "That offer wasn't issued here.");
  const required: PaymentRequirements = { scheme: FUSEBOX_SCHEME, network: XLAYER_NETWORK, asset: USDT0, amount, payTo, maxTimeoutSeconds: o.ttlSeconds ?? 600, extra: { nonce } };
  const v = await verifyFuseboxPayment(o.client, payload, required, { factory: o.factory });
  if (!v.isValid) return offer(`${v.invalidReason}: ${v.invalidMessage}`);
  if (!(await (o.markUsed ?? memoryMark)(payload.payload.transaction.toLowerCase()))) return offer("That payment already bought a response.");
  const settle: SettleResponse = { success: true, transaction: payload.payload.transaction, network: XLAYER_NETWORK, payer: v.payer };
  return { paid: true, payer: v.payer as Address, transaction: payload.payload.transaction, decisionId: v.decisionId, headers: { [HEADER.response]: encodeHeader(settle), "access-control-expose-headers": HEADER.response } };
}
