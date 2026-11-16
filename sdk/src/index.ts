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

export { fuseboxWalletAbi, fuseRegistryAbi, fuseboxFactoryAbi, tapeoutProcessorAbi } from "./abi.js";

/** X Layer mainnet (chain 196). */
export const xLayer: Chain = defineChain({
  id: 196, name: "X Layer", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } },
  blockExplorers: { default: { name: "OKLink", url: "https://www.oklink.com/xlayer" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

/** Fusebox on X Layer mainnet. Atlas is the public demo wallet. */
export const ADDRESSES = {
  registry: "0x852a278322667BB86A2665a38CbC5Bfd551B20d7",
  factory: "0x192C099a18ed42612b6e74f243f8dF1EE0E3E7a5",
  atlas: "0x0Db0457715a6445D8a65F820d717a6B39Be66800",
  usdt0: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
} as const satisfies Record<string, Address>;

const EXPLORER = "https://www.oklink.com/xlayer";
const SHIPPED = new Set([1, 2, 3, 4]); // the four fuses Fusebox shipped; other designs describe themselves in metadata
const SOCKET_NAME: Record<number, string> = { 1: "Daily Cap", 2: "Payee Guard", 3: "Breaker", 4: "Two of Three" };
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
}

export interface Decision {
  id: number; time: number; to: Address; amount: string; paid: boolean; fee: string; tx?: Hash;
  fuses: { name: string; verdict: Verdict }[];
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
      else why = pass ? (a > p ? `over ${p} USDT0 and approved by ${approvals} of 3` : `under the ${p} USDT0 approval threshold`) : `over ${p} USDT0: needs two of three approvers, has ${approvals}`;
      return { name: f.name, verdict: v, why };
    });
    const no = verdicts.filter((x) => x.verdict !== "pass");
    const summary = allowed ? `Every fuse holds: the wallet would pay ${a} USDT0 to ${payee}.` : `Stopped: ${no.map((x) => `${x.name} (${x.why})`).join("; ")}. Nothing would move.`;
    return { allowed, to: payee, amount: String(a), block: Number(block), fuses: verdicts, summary };
  }

  /**
   * Pay in USDT0 through the fuses with the agent's key. By default it checks first and doesn't send a payment the
   * fuses would refuse (a refused payment is still recorded and its checks are still paid for). Pass
   * { checkFirst: false } to record the attempt anyway.
   */
  async pay(to: string, amount: string | number, memo: string, opts: { checkFirst?: boolean } = {}): Promise<PayResult> {
    if (!this.walletClient || !this.account) throw new FuseboxError("Read-only client: pass the agent's key as `account` to pay.");
    const payee = parseTo(to), amt = parseAmount(amount);
    if (memo.length > 200) throw new FuseboxError("Keep the memo to one line (200 characters).");
    if (!(await this.public.readContract({ ...this.W, functionName: "isAgent", args: [this.account.address] }))) throw new FuseboxError(`${this.account.address} isn't an agent of ${this.wallet}.`);
    if (opts.checkFirst !== false) {
      const c = await this.check(payee, usd(amt));
      if (!c.allowed) return { paid: false, sent: false, fuses: c.fuses.map(({ name, verdict }) => ({ name, verdict })), summary: `Not sent. ${c.summary}`, check: c };
    }
    const args = [ADDRESSES.usdt0, payee, amt, memo] as const;
    const gas = await this.public.estimateContractGas({ ...this.W, functionName: "pay", args, account: this.account }).then((g) => (g * 13n) / 10n).catch(() => 3_000_000n);
    const hash = await this.walletClient.writeContract({ ...this.W, functionName: "pay", args, gas, account: this.account, chain: this.walletClient.chain ?? xLayer });
    const r = await this.public.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (r.status !== "success") throw new FuseboxError(`The transaction reverted: ${EXPLORER}/tx/${hash}`);
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
