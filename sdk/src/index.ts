/**
 * fusebox-sdk: pay from an AI agent's Fusebox wallet on X Layer, where every payment has to pass logic-circuit
 * "fuses" taped out on TapeOut. Check a payment for free, pay with the agent's key (checked first, so a refusal
 * costs nothing), read the wallet, follow its decisions live, approve or freeze.
 */
import {
  createPublicClient, createWalletClient, decodeEventLog, defineChain, formatUnits, getAddress, http, isAddress, parseUnits,
  type Account, type Address, type Chain, type Hash, type Hex, type PublicClient, type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fuseboxWalletAbi, fuseRegistryAbi, tapeoutProcessorAbi } from "./abi.js";
import { encodeHeader, decodeHeader, readPaymentRequired, pickFusebox, memoFor, HEADER, X402_VERSION, type PaymentRequirements, type PaymentRequired, type PaymentPayload, type SettleResponse } from "./x402.js";

export { fuseboxWalletAbi, fuseRegistryAbi, fuseboxFactoryAbi, tapeoutProcessorAbi } from "./abi.js";
export * as x402 from "./x402.js";

/** X Layer mainnet (chain 196). */
export const xLayer: Chain = defineChain({
  id: 196, name: "X Layer", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } },
  blockExplorers: { default: { name: "OKLink", url: "https://www.oklink.com/xlayer" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

/**
 * Fusebox on X Layer mainnet. `registry` and `factory` are v2 (Nov 20): new wallets and the fuse market, with the
 * Repeat Guard. v1 (Nov 15) holds Atlas, the public demo wallet, and the first wallets, which keep working. A wallet
 * always reads its own registry, so the client below works with either.
 */
export const ADDRESSES = {
  registry: "0x2583928546a614A2fD993B5C106ED9aD0E781AB6",
  factory: "0xdFc9b1d715efB2bCDAd8f848A5E3b4e2c243EE9B",
  registryV1: "0x852a278322667BB86A2665a38CbC5Bfd551B20d7",
  factoryV1: "0x192C099a18ed42612b6e74f243f8dF1EE0E3E7a5",
  atlas: "0x0Db0457715a6445D8a65F820d717a6B39Be66800",
  usdt0: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
} as const satisfies Record<string, Address>;

const EXPLORER = "https://www.oklink.com/xlayer";
const SHIPPED = new Set([1, 2, 3, 4, 5]); // the fuses Fusebox ships (5, the Repeat Guard, is v2); other designs describe themselves in metadata
const SOCKET_NAME: Record<number, string> = { 1: "Daily Cap", 2: "Payee Guard", 3: "Breaker", 4: "Two of Three", 5: "Repeat Guard" };
const STATUS: Verdict[] = ["pass", "blew", "failed", "untrusted"];
const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const usd = (v: bigint) => formatUnits(v, 6);

export type Verdict = "pass" | "blew" | "failed" | "untrusted";

export interface FuseState {
  slot: number; fuseId: number; name: string; socket: number; circuitId: number; processor: Address;
  /** the designer's current fee and the most this wallet accepts, in USDT0 per check */
  fee: string; maxFee: string;
  /** the owner's two settings, in the socket's units (USDT0 or hours) */
  settings: { a: number; b: number };
  /** a sequential fuse that would refuse a clean payment right now (for example a tripped Breaker) */
  blown: boolean;
  spentToday: string;
}

export interface WalletStatus {
  wallet: Address; owner: Address; paused: boolean; balance: string; feeBalance: string;
  decisions: number; paid: number; stopped: number;
  limits: { decisionsPerDay: number; blockedPerDay: number };
  fuses: FuseState[];
}

export interface CheckResult {
  allowed: boolean; to: Address; amount: string; block: number;
  /** set when an approval fuse is what said no: where the wallet's approvers sign this exact payment */
  approvalUrl?: string;
  fuses: { name: string; verdict: Verdict; why: string }[];
  /** one sentence for a person (or an agent) to read */
  summary: string;
}

export interface PayResult {
  /** the payment went through */
  paid: boolean;
  /** a transaction was sent (false when the free check already said no) */
  sent: boolean;
  decisionId?: number; tx?: Hash; txUrl?: string; feePaid?: string;
  fuses: { name: string; verdict: Verdict }[];
  summary: string;
  check?: CheckResult;
  /** the payment needs approvers' signatures before a retry can pass; `notified` = devices alerted (null if that failed) */
  needsApproval?: { url: string; notified?: number | null };
}

/** A payment waiting on an approver (from pending()). */
export interface PendingApproval {
  wallet: Address; to: Address; amount: string; memo: string; attempts: number; last: number;
  seats: Address[]; mySeat: number; signed: number; threshold: number | null; url: string;
}

export interface Decision {
  id: number; time: number; to: Address; amount: string; paid: boolean; fee: string; tx?: Hash;
  fuses: { name: string; verdict: Verdict }[];
}

/** What fetch() did with a URL that may cost money (x402). */
export interface FetchResult {
  /** the final response: the resource when it was paid for (or free), the seller's 402 when it wasn't */
  response: Response;
  /** set when the URL asked for payment */
  payment?: {
    /** the price went through the fuses and the seller accepted it */
    paid: boolean;
    price: string; payTo: Address; resource: string;
    /** one sentence for a person (or an agent) to read */
    summary: string;
    fuses?: { name: string; verdict: Verdict }[];
    tx?: Hash; txUrl?: string; decisionId?: number;
    /** the seller's settlement (PAYMENT-RESPONSE) */
    settlement?: SettleResponse;
    /** the payment needs approvers' signatures before a retry can pass */
    needsApproval?: { url: string };
    /** dryRun: what the fuses would say, nothing paid */
    check?: CheckResult;
  };
}

/** Pre-flight: a payment run through a line of TapeOut circuits for any agent wallet (see preflight()). */
export interface PreflightRequest {
  /** fuses by registry id with their settings, e.g. [{ fuseId: 1, a: 50 }, { fuseId: 3 }] */
  line: { fuseId: number; a?: number; b?: number }[];
  payment: { amount: string | number; to?: string };
  context?: {
    /** USD₮0 already paid today through this line */
    spentToday?: string | number;
    payee?: { saved: boolean; hoursSinceSaved?: number };
    /** which of three approvers signed this exact payment, or how many */
    approvals?: [boolean, boolean, boolean] | number;
    /** latch state from the previous result's `state` */
    state?: Record<string, Hex>;
  };
}
export interface PreflightResult {
  allowed: boolean; block: number; summary: string;
  fuses: { fuseId: number; name: string; socket: number; circuitId: number; processor: Address; settings: { a: number; b: number }; verdict: "pass" | "blew" | "error"; why: string; blownAfter?: boolean }[];
  /** send this back as context.state next time, so latches (the Breaker) remember */
  state: Record<string, Hex>;
}

/**
 * Check a payment against a line of TapeOut circuits before an agent signs it from any wallet: no Fusebox wallet
 * needed. Every verdict is TapeOut's own eval/step on X Layer, read-only and free; you supply the context a Fusebox
 * wallet would keep on-chain (today's spend, the payee, approvals, latch state).
 */
export async function preflight(req: PreflightRequest, opts: { api?: string } = {}): Promise<PreflightResult> {
  const api = (opts.api ?? "https://fusebox-xlayer.vercel.app").replace(/\/$/, "");
  const body = { ...req, payment: { ...req.payment, amount: String(req.payment.amount) }, context: req.context ? { ...req.context, spentToday: req.context.spentToday === undefined ? undefined : String(req.context.spentToday) } : undefined };
  const r = await fetch(`${api}/api/preflight`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  const j = (await r.json().catch(() => ({}))) as PreflightResult & { error?: string };
  if (!r.ok) throw new FuseboxError(j.error ?? `Pre-flight unavailable (${r.status}).`);
  return j;
}

export interface FuseboxOptions {
  /** the Fusebox wallet (default: Atlas, the public demo wallet) */
  wallet?: Address;
  /** X Layer RPC (default https://rpc.xlayer.tech) */
  rpc?: string;
  /** the agent's (or an approver's) key or viem account; without it the client is read-only */
  account?: Account | Hex;
  /** where history() reads the indexed log (default the hosted Fusebox app) */
  api?: string;
  publicClient?: PublicClient;
  walletClient?: WalletClient;
}

function decodeMeta(uri: string): { name?: string; summary?: string; rule?: string } | null {
  const m = /^data:application\/json(;charset=utf-8)?(;base64)?,(.*)$/is.exec(uri.trim());
  if (!m) return null;
  try {
    const raw = m[2] ? (typeof atob === "function" ? new TextDecoder().decode(Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0))) : Buffer.from(m[3], "base64").toString("utf8")) : decodeURIComponent(m[3]);
    const j = JSON.parse(raw) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : undefined);
    return { name: s(j.name), summary: s(j.summary), rule: s(j.rule) };
  } catch { return null; }
}

export class FuseboxError extends Error {}

/** A client for one Fusebox wallet. */
export class Fusebox {
  readonly wallet: Address;
  readonly public: PublicClient;
  readonly account: Account | null;
  readonly walletClient: WalletClient | null;
  private readonly api: string;
  private meta = new Map<number, { name?: string; summary?: string; rule?: string } | null>();

  constructor(opts: FuseboxOptions = {}) {
    this.wallet = getAddress(opts.wallet ?? ADDRESSES.atlas);
    const rpc = opts.rpc ?? "https://rpc.xlayer.tech";
    const chain = { ...xLayer, rpcUrls: { default: { http: [rpc] } } };
    this.public = opts.publicClient ?? (createPublicClient({ chain, transport: http(rpc), batch: { multicall: true } }) as PublicClient);
    this.account = typeof opts.account === "string" ? privateKeyToAccount(opts.account) : opts.account ?? null;
    this.walletClient = opts.walletClient ?? (this.account ? createWalletClient({ chain, transport: http(rpc), account: this.account }) : null);
    this.api = (opts.api ?? "https://fusebox-xlayer.vercel.app").replace(/\/$/, "");
  }

  private get W() { return { address: this.wallet, abi: fuseboxWalletAbi } as const; }

  /** Every fuse on the wallet's line, in order. */
  async fuses(): Promise<FuseState[]> {
    const n = Number(await this.public.readContract({ ...this.W, functionName: "fuseCount" }));
    const registry = await this.public.readContract({ ...this.W, functionName: "registry" });
    return Promise.all(Array.from({ length: n }, async (_, i) => {
      const s = await this.public.readContract({ ...this.W, functionName: "slotAt", args: [BigInt(i)] });
      const id = Number(s.fuseId);
      const [f, spent, uri, blown] = await Promise.all([
        this.public.readContract({ address: registry, abi: fuseRegistryAbi, functionName: "fuse", args: [s.fuseId] }),
        this.public.readContract({ ...this.W, functionName: "spentToday", args: [BigInt(i)] }),
        this.meta.has(id) ? Promise.resolve(null) : this.public.readContract({ address: registry, abi: fuseRegistryAbi, functionName: "metadataURI", args: [s.fuseId] }).catch(() => ""),
        s.nState > 0
          ? this.public.readContract({ address: s.processor, abi: tapeoutProcessorAbi, functionName: "step", args: [s.circuitId, s.state, "0x04"] }).then(([, out]) => (Number(BigInt(out === "0x" ? "0x0" : out)) & 1) === 0).catch(() => s.state !== "0x" && BigInt(s.state) !== 0n)
          : Promise.resolve(false),
      ]);
      if (!this.meta.has(id)) this.meta.set(id, uri ? decodeMeta(uri) : null);
      const meta = this.meta.get(id);
      return {
        slot: i, fuseId: id, name: (SHIPPED.has(id) ? SOCKET_NAME[Number(s.socket)] : meta?.name) ?? SOCKET_NAME[Number(s.socket)] ?? `Fuse ${id}`,
        socket: Number(s.socket), circuitId: Number(s.circuitId), processor: s.processor, fee: usd(f.fee), maxFee: usd(s.maxFee),
        settings: { a: Number(s.params.a), b: Number(s.params.b) }, blown, spentToday: usd(spent),
      };
    }));
  }

  /** Balance, prepaid fees, the fuses and whether any is blown, counts and daily budgets. */
  async status(): Promise<WalletStatus> {
    const registry = await this.public.readContract({ ...this.W, functionName: "registry" });
    const [owner, paused, bal, fee, n, ok, no, maxD, maxB, fuses] = await Promise.all([
      this.public.readContract({ ...this.W, functionName: "owner" }),
      this.public.readContract({ ...this.W, functionName: "paused" }),
      this.public.readContract({ address: ADDRESSES.usdt0, abi: erc20, functionName: "balanceOf", args: [this.wallet] }),
      this.public.readContract({ address: registry, abi: fuseRegistryAbi, functionName: "feeBalance", args: [this.wallet] }),
      this.public.readContract({ ...this.W, functionName: "decisionCount" }),
      this.public.readContract({ ...this.W, functionName: "allowedCount" }),
      this.public.readContract({ ...this.W, functionName: "blockedCount" }),
      this.public.readContract({ ...this.W, functionName: "maxDecisionsPerDay" }),
      this.public.readContract({ ...this.W, functionName: "maxBlockedPerDay" }),
      this.fuses(),
    ]);
    return { wallet: this.wallet, owner, paused, balance: usd(bal), feeBalance: usd(fee), decisions: Number(n), paid: Number(ok), stopped: Number(no), limits: { decisionsPerDay: Number(maxD), blockedPerDay: Number(maxB) }, fuses };
  }

  /** Dry-run a USDT0 payment against every fuse: free, read-only, nothing moves. */
  async check(to: string, amount: string | number): Promise<CheckResult> {
    const payee = parseTo(to), amt = parseAmount(amount);
    const [[allowed, status], fuses, block, since, mask] = await Promise.all([
      this.public.readContract({ ...this.W, functionName: "check", args: [ADDRESSES.usdt0, payee, amt] }),
      this.fuses(),
      this.public.getBlockNumber(),
      this.public.readContract({ ...this.W, functionName: "payeeAddedAt", args: [payee] }),
      this.public.readContract({ ...this.W, functionName: "approvalMaskOf", args: [ADDRESSES.usdt0, payee, amt] }),
    ]);
    const a = Number(usd(amt)), hours = since ? (Date.now() / 1000 - Number(since)) / 3600 : 0;
    const approvals = [0, 1, 2].filter((b) => (Number(mask) >> b) & 1).length;
    const verdicts = fuses.map((f, i) => {
      const v = STATUS[status[i]] ?? "failed", pass = v === "pass", { a: p, b: q } = f.settings;
      let why: string;
      if (v === "failed") why = "the circuit call failed, so the fuse fails closed";
      else if (v === "untrusted") why = "TapeOut's processor code changed and isn't attested, so the fuse fails closed";
      else if (!SHIPPED.has(f.fuseId)) { const m = this.meta.get(f.fuseId); why = pass ? "holds" : `refused under its rule${m?.rule ? ` (${m.rule})` : m?.summary ? `: ${m.summary}` : ""}`; }
      else if (f.socket === 1) why = pass ? `within today's cap (${Math.max(0, p - Number(f.spentToday))} of ${p} USDT0 left)` : `${a} USDT0 would pass today's ${p} USDT0 cap (${f.spentToday} spent)`;
      else if (f.socket === 2) why = pass ? (since && hours >= p ? "a saved payee, past its cooling-off" : `saved ${hours.toFixed(1)} h ago and within the ${q} USDT0 trial`) : !since ? "not a saved payee" : `saved ${hours.toFixed(1)} h ago: until ${p} h have passed it can receive at most ${q} USDT0`;
      else if (f.socket === 3) why = f.blown ? "already blown; nothing pays until the owner resets it" : pass ? "not tripped" : "a payment to a stranger trips it, and it stays blown until the owner resets it";
      else if (f.socket === 5) why = pass ? `not a repeat of a payment in the last ${p} h (or the owner cleared one)` : `the same amount to this payee already went out in the last ${p} h; the owner can clear one repeat`;
      else why = pass ? (a > p ? `over ${p} USDT0 and approved by ${approvals} of 3` : `under the ${p} USDT0 approval threshold`) : `over ${p} USDT0: needs two of three approvers, has ${approvals}`;
      return { name: f.name, verdict: v, why };
    });
    const no = verdicts.filter((x) => x.verdict !== "pass");
    // when an approval fuse (socket 4) is among the no's, point at the page where approvers sign this exact payment
    const approvalUrl = !allowed && fuses.some((f, i) => f.socket === 4 && verdicts[i].verdict === "blew") ? `${this.api}/app/approve?wallet=${this.wallet}&to=${payee}&amount=${a}` : undefined;
    const summary = allowed ? `Every fuse holds: the wallet would pay ${a} USDT0 to ${payee}.` : `Stopped: ${no.map((x) => `${x.name} (${x.why})`).join("; ")}. Nothing would move.${approvalUrl && no.length === 1 ? ` Two of the wallet's approvers can sign it at ${approvalUrl}; retry once they have.` : ""}`;
    return { allowed, to: payee, amount: String(a), block: Number(block), fuses: verdicts, summary, approvalUrl };
  }

  /**
   * Pay in USDT0 through the fuses with the agent's key. By default it checks first and doesn't send a payment the
   * fuses would refuse (a refused payment is still recorded and its checks are still paid for). Pass
   * { checkFirst: false } to record the attempt anyway.
   */
  async pay(to: string, amount: string | number, memo: string, opts: { checkFirst?: boolean; notify?: boolean } = {}): Promise<PayResult> {
    if (!this.walletClient || !this.account) throw new FuseboxError("Read-only client: pass the agent's key as `account` to pay.");
    const payee = parseTo(to), amt = parseAmount(amount);
    if (memo.length > 200) throw new FuseboxError("Keep the memo to one line (200 characters).");
    if (!(await this.public.readContract({ ...this.W, functionName: "isAgent", args: [this.account.address] }))) throw new FuseboxError(`${this.account.address} isn't an agent of ${this.wallet}.`);
    if (opts.checkFirst !== false) {
      const c = await this.check(payee, usd(amt));
      // needsApproval only when signatures alone would let the retry through
      const onlyApproval = !!c.approvalUrl && c.fuses.filter((f) => f.verdict !== "pass").length === 1;
      if (!c.allowed) {
        // only signatures stand between the agent and this payment: tell the approvers' phones (unless asked not to)
        const notified = onlyApproval && opts.notify !== false ? await this.requestApproval(payee, usd(amt), memo).then((r) => r.sent).catch(() => null) : undefined;
        return { paid: false, sent: false, fuses: c.fuses.map(({ name, verdict }) => ({ name, verdict })), summary: `Not sent. ${c.summary}${notified ? ` The approvers' devices were alerted (${notified}).` : ""}`, check: c, needsApproval: onlyApproval ? { url: c.approvalUrl!, notified } : undefined };
      }
    }
    // a decision is charged up front from the prepaid fee balance: say so plainly instead of sending a doomed tx
    const [line, registry] = await Promise.all([this.fuses(), this.public.readContract({ ...this.W, functionName: "registry" })]);
    const per = line.reduce((t, f) => t + Math.min(Number(f.fee), Number(f.maxFee)), 0);
    const have = Number(usd(await this.public.readContract({ address: registry, abi: fuseRegistryAbi, functionName: "feeBalance", args: [this.wallet] })));
    if (have + 1e-9 < per) throw new FuseboxError(`The wallet's prepaid fee balance (${have} USDT0) can't cover one decision (${per.toFixed(6)} USDT0): the owner needs to top it up before the agent can pay.`);
    const args = [ADDRESSES.usdt0, payee, amt, memo] as const;
    const gas = await this.public.estimateContractGas({ ...this.W, functionName: "pay", args, account: this.account }).then((g) => (g * 13n) / 10n).catch(() => 3_000_000n);
    const hash = await this.walletClient.writeContract({ ...this.W, functionName: "pay", args, gas, account: this.account, chain: this.walletClient.chain ?? xLayer });
    const r = await this.public.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (r.status !== "success") throw new FuseboxError(`The transaction reverted: ${EXPLORER}/tx/${hash}`);
    // Telegram alerts (@FuseboxAlertsBot) for anyone following this wallet; the app reads the decision back from X Layer
    void fetch(`${this.api}/api/telegram/notify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tx: hash }), signal: AbortSignal.timeout(8_000) }).catch(() => {});
    let d: { decisionId: bigint; allowed: boolean; status: readonly number[]; feePaid: bigint } | undefined;
    for (const l of r.logs) {
      if (l.address.toLowerCase() !== this.wallet.toLowerCase()) continue;
      try { const ev = decodeEventLog({ abi: fuseboxWalletAbi, data: l.data, topics: l.topics }); if (ev.eventName === "Decision") d = ev.args as unknown as typeof d; } catch { /* another event */ }
    }
    if (!d) throw new FuseboxError(`No decision in the receipt: ${EXPLORER}/tx/${hash}`);
    const names = (await this.fuses()).map((f) => f.name);
    const fuses = d.status.map((s, i) => ({ name: names[i] ?? `Fuse ${i + 1}`, verdict: STATUS[s] ?? "failed" }));
    const blew = fuses.filter((f) => f.verdict !== "pass").map((f) => f.name);
    return {
      paid: d.allowed, sent: true, decisionId: Number(d.decisionId), tx: hash, txUrl: `${EXPLORER}/tx/${hash}`, feePaid: usd(d.feePaid), fuses,
      summary: d.allowed ? `Paid ${usd(amt)} USDT0 to ${payee} (decision #${d.decisionId}).` : `Stopped by ${blew.join(", ")}: nothing moved (decision #${d.decisionId}).`,
    };
  }

  /**
   * fetch() for paid APIs (x402). When the URL answers 402 with a Fusebox offer, the price goes through the wallet's
   * fuses like any payment, and only a payment they allow is made; then the request is retried with the proof.
   * `maxPrice` (USDT0) refuses anything dearer without asking the fuses; `dryRun` only reports what they'd say.
   * Use a string or JSON body: a stream can't be sent twice.
   */
  async fetch(input: string | URL, init: RequestInit = {}, opts: { maxPrice?: string | number; dryRun?: boolean; memo?: string } = {}): Promise<FetchResult> {
    const url = String(input);
    const first = await fetch(url, init);
    if (first.status !== 402) return { response: first };
    const offer: PaymentRequired | null = await readPaymentRequired(first);
    if (!offer) throw new FuseboxError(`${url} answered 402 without an x402 offer.`);
    const req: PaymentRequirements | undefined = pickFusebox(offer);
    if (!req) throw new FuseboxError(`${url} doesn't take Fusebox payments; it offers ${offer.accepts.map((a) => `${a.scheme} on ${a.network}`).join(", ") || "nothing"}.`);
    const price = usd(BigInt(req.amount)), payTo = getAddress(req.payTo.toLowerCase()), resource = offer.resource?.url ?? url;
    const base = { price, payTo, resource };
    if (opts.maxPrice !== undefined && Number(price) > Number(opts.maxPrice)) {
      return { response: first, payment: { ...base, paid: false, summary: `Not paid: ${url} costs ${price} USDT0, over the ${opts.maxPrice} USDT0 you allowed.` } };
    }
    if (opts.dryRun || !this.account) {
      const c = await this.check(payTo, price);
      const why = c.allowed ? `the fuses would pay ${price} USDT0 to ${payTo} for it` : c.summary;
      return { response: first, payment: { ...base, paid: false, check: c, fuses: c.fuses.map(({ name, verdict }) => ({ name, verdict })), summary: `${opts.dryRun ? "Dry run" : "Read-only client"}: ${url} costs ${price} USDT0; ${why}` } };
    }
    const memo = opts.memo ? `${memoFor(req, resource).split(" ").slice(0, 2).join(" ")} ${opts.memo}`.slice(0, 200) : memoFor(req, resource);
    const p = await this.pay(payTo, price, memo);
    if (!p.paid || !p.tx) return { response: first, payment: { ...base, paid: false, fuses: p.fuses, summary: `Not paid for ${url}: ${p.summary}`, needsApproval: p.needsApproval, tx: p.tx, txUrl: p.txUrl, decisionId: p.decisionId } };
    const payload: PaymentPayload = { x402Version: X402_VERSION, resource: offer.resource, accepted: req, payload: { wallet: this.wallet, transaction: p.tx, decisionId: p.decisionId } };
    const headers = new Headers(init.headers);
    headers.set(HEADER.signature, encodeHeader(payload));
    if (offer.x402Version < 2) headers.set(HEADER.v1Payment, encodeHeader(payload));
    const second = await fetch(url, { ...init, headers });
    const raw = second.headers.get(HEADER.response) ?? second.headers.get(HEADER.v1Response);
    let settlement: SettleResponse | undefined; try { settlement = raw ? decodeHeader<SettleResponse>(raw) : undefined; } catch { /* the seller sent no readable receipt */ }
    const ok = second.ok;
    return {
      response: second,
      payment: { ...base, paid: ok, fuses: p.fuses, tx: p.tx, txUrl: p.txUrl, decisionId: p.decisionId, settlement,
        summary: ok ? `Paid ${price} USDT0 to ${payTo} for ${url} (decision #${p.decisionId}).` : `Paid ${price} USDT0 (decision #${p.decisionId}) but ${url} answered ${second.status}: ${(await readPaymentRequired(second))?.error ?? "no reason given"}.` },
    };
  }

  /**
   * As the agent: ask the wallet's approvers to sign off a payment an approval fuse is holding. Signed with the agent's
   * key; Fusebox checks it on X Layer and alerts every approver who turned on alerts. pay() does this for you when
   * signatures are all that stand in the way.
   */
  async requestApproval(to: string, amount: string | number, memo = ""): Promise<{ seats: number; sent: number; url: string }> {
    if (!this.walletClient || !this.account) throw new FuseboxError("Pass the agent's key as `account` to ask for approval.");
    const payee = parseTo(to), a = usd(parseAmount(amount)), m = memo.slice(0, 200), issued = Math.floor(Date.now() / 1000);
    const message = `Fusebox approval request\nWallet: ${this.wallet}\nTo: ${payee}\nAmount: ${a} USDT0\nMemo: ${m}\nIssued: ${issued}`;
    const signature = await this.walletClient.signMessage({ account: this.account, message });
    const r = await fetch(`${this.api}/api/push/notify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: this.wallet, to: payee, amount: a, memo: m, issued, signature }), signal: AbortSignal.timeout(20_000) });
    const j = (await r.json().catch(() => ({}))) as { seats?: number; sent?: number; url?: string; error?: string };
    if (!r.ok) throw new FuseboxError(j.error ?? `Couldn't reach the approvers (${r.status}).`);
    return { seats: j.seats ?? 0, sent: j.sent ?? 0, url: j.url ?? "" };
  }

  /** As an approver: sign off this exact payment (payee and amount) for Two of Three. */
  async approve(to: string, amount: string | number): Promise<Hash> {
    if (!this.walletClient || !this.account) throw new FuseboxError("Pass the approver's key as `account` to approve.");
    const hash = await this.walletClient.writeContract({ ...this.W, functionName: "approvePayment", args: [ADDRESSES.usdt0, parseTo(to), parseAmount(amount)], account: this.account, chain: this.walletClient.chain ?? xLayer });
    await this.public.waitForTransactionReceipt({ hash });
    return hash;
  }

  /** As the agent, an approver or the owner: stop every payment now (only the owner can undo it). */
  async freeze(): Promise<Hash> {
    if (!this.walletClient || !this.account) throw new FuseboxError("Pass a key as `account` to freeze.");
    const hash = await this.walletClient.writeContract({ ...this.W, functionName: "freeze", account: this.account, chain: this.walletClient.chain ?? xLayer });
    await this.public.waitForTransactionReceipt({ hash });
    return hash;
  }

  /** Payments waiting on `approver`'s signature, across every Fusebox wallet where they hold a seat. */
  async pending(approver: string): Promise<PendingApproval[]> {
    const a = parseTo(approver);
    const r = await fetch(`${this.api}/api/approvals?approver=${a}`);
    if (!r.ok) throw new FuseboxError(`Approvals unavailable (${r.status}).`);
    const j = (await r.json()) as { open: (Omit<PendingApproval, "signed" | "url"> & { mask: number })[] };
    return j.open.map(({ mask, ...x }) => ({ ...x, signed: [0, 1, 2].filter((i) => (mask >> i) & 1).length, url: `${this.api}/app/approve?wallet=${x.wallet}&to=${x.to}&amount=${x.amount}` }));
  }

  /** The wallet's decisions, oldest first, from Fusebox's indexed log (X Layer RPCs cap log ranges). */
  async history(): Promise<Decision[]> {
    const r = await fetch(`${this.api}/api/wallet/${this.wallet}/history`);
    if (!r.ok) throw new FuseboxError(`History unavailable (${r.status}).`);
    const j = (await r.json()) as { names: string[]; rows: { id: number; t: number; to: Address; a: number; ok: boolean; s: number[]; f: number }[] };
    return j.rows.map((x) => ({ id: x.id, time: x.t, to: x.to, amount: String(x.a), paid: x.ok, fee: String(x.f), fuses: x.s.map((s, i) => ({ name: x.s.length === j.names.length ? j.names[i] : `Fuse ${i + 1}`, verdict: STATUS[s] ?? "failed" })) }));
  }

  /** Call `onDecision` for every new decision as it lands on X Layer. Returns a function that stops watching. */
  watch(onDecision: (d: Decision) => void, opts: { pollingInterval?: number } = {}): () => void {
    let names: string[] = [];
    void this.fuses().then((f) => { names = f.map((x) => x.name); }).catch(() => {});
    return this.public.watchContractEvent({
      address: this.wallet, abi: fuseboxWalletAbi, eventName: "Decision", poll: true, pollingInterval: opts.pollingInterval ?? 4000,
      onLogs: (logs) => {
        for (const l of logs) {
          const a = l.args as { decisionId: bigint; to: Address; amount: bigint; allowed: boolean; status: readonly number[]; feePaid: bigint };
          onDecision({ id: Number(a.decisionId), time: Math.floor(Date.now() / 1000), to: a.to, amount: usd(a.amount), paid: a.allowed, fee: usd(a.feePaid), tx: l.transactionHash ?? undefined, fuses: a.status.map((s, i) => ({ name: names[i] ?? `Fuse ${i + 1}`, verdict: STATUS[s] ?? "failed" })) });
        }
      },
    });
  }
}

function parseTo(to: string): Address {
  if (!isAddress(to, { strict: false })) throw new FuseboxError(`"${to}" isn't a valid 0x address.`);
  return getAddress(to.toLowerCase());
}
function parseAmount(a: string | number): bigint {
  const s = String(a);
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(s) || Number(s) <= 0) throw new FuseboxError(`"${s}" isn't an amount above 0 with up to 6 decimals.`);
  return parseUnits(s, 6);
}
