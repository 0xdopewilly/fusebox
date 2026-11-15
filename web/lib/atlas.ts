import "server-only";
import { decodeEventLog, formatUnits, type Address, type Hex } from "viem";
import { fuseboxLogs } from "./logs";
import { client, DEPLOYMENT, IS_FORK } from "./chain";
import { fuseboxWalletAbi, fuseRegistryAbi, fuseboxFactoryAbi } from "./abi";

const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const SOCKET_KEY: Record<number, string> = { 1: "daily-cap", 2: "payee-guard", 3: "breaker", 4: "approval-2of3" };
const NAME: Record<string, string> = { "daily-cap": "Daily Cap", "payee-guard": "Payee Guard", breaker: "Breaker", "approval-2of3": "Two of Three" };
export const STATUS = ["pass", "blew", "failed", "untrusted"] as const;
export type FuseStatus = (typeof STATUS)[number];
const usd = (v: bigint) => formatUnits(v, 6);

export interface FuseSlot {
  slot: number; fuseId: number; key: string; name: string; circuitId: number; processor: Address;
  gates: number; nState: number; fee: string; maxFee: string; unit: string; a: number; b: number;
  latched: boolean; designer: Address; decisions: number; earned: string; lifetimeEarned: string; spentToday: string;
}
export interface DecisionRow {
  id: number; block: number; time: number; tx: Hex; to: Address; amount: string; allowed: boolean;
  status: FuseStatus[]; fee: string; memo: string;
}
export interface Atlas {
  source: "fork" | "mainnet" | "snapshot"; block: number; time: number; isAtlas?: boolean;
  wallet: Address; registry: Address; processor: Address; owner: Address; agent: Address; usdt0: Address;
  paused: boolean; balance: string; feeBalance: string; protocolBps: number;
  counts: { decisions: number; allowed: number; blocked: number };
  fuses: FuseSlot[]; decisions: DecisionRow[]; payees: { address: Address; since: number }[]; approvers: Address[];
  paidToDesigners: string;
}

// ------------------------------------------------------------------ decision log (from the shared log layer)
const blockTime = new Map<number, number>();
const isAtlas = (a: Address) => a.toLowerCase() === DEPLOYMENT.atlas.toLowerCase();
async function readHistory(addr: Address, head: bigint) {
  // the shared log layer covers every factory wallet from its creation, so any wallet's full history is here
  const logs = (await fuseboxLogs(Number(head))).filter((l) => l.address === addr.toLowerCase());
  const rows: DecisionRow[] = []; const payees = new Map<Address, number>(); const agents = new Set<Address>();
  const need = [...new Set(logs.map((l) => l.blockNumber))].filter((b) => !blockTime.has(b));
  await Promise.all(need.map(async (b) => blockTime.set(b, Number((await client.getBlock({ blockNumber: BigInt(b) })).timestamp))));
  for (const l of [...logs].sort((x, y) => x.blockNumber - y.blockNumber || x.logIndex - y.logIndex)) {
    let ev;
    try { ev = decodeEventLog({ abi: fuseboxWalletAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }); } catch { continue; }
    if (ev.eventName === "PayeeAdded") payees.set(ev.args.payee, Number(ev.args.at));
    else if (ev.eventName === "PayeeRemoved") payees.delete(ev.args.payee);
    else if (ev.eventName === "AgentSet") { if (ev.args.enabled) agents.add(ev.args.agent); else agents.delete(ev.args.agent); }
    else if (ev.eventName === "Decision") {
      const a = ev.args;
      rows.push({ id: Number(a.decisionId), block: l.blockNumber, time: blockTime.get(l.blockNumber)!, tx: l.transactionHash, to: a.to, amount: usd(a.amount), allowed: a.allowed, status: a.status.map((s) => STATUS[s] ?? "failed"), fee: usd(a.feePaid), memo: a.memo });
    }
  }
  return { rows, payees, agents };
}

// ------------------------------------------------------------------ snapshot
const cache = new Map<string, { at: number; data: Atlas }>();
const inflight = new Map<string, Promise<Atlas>>();

export const getAtlas = () => getWallet(DEPLOYMENT.atlas);

/** Any wallet made by the Fusebox factory, with its full history. */
export async function getWallet(addr: Address): Promise<Atlas> {
  const key = addr.toLowerCase();
  const c = cache.get(key);
  if (c && Date.now() - c.at < 3_000) return c.data;
  if (inflight.has(key)) return inflight.get(key)!;
  const p = build(addr).finally(() => inflight.delete(key));
  inflight.set(key, p);
  const data = await p;
  cache.set(key, { at: Date.now(), data });
  return data;
}

export async function isFuseboxWallet(addr: Address) {
  return client.readContract({ address: DEPLOYMENT.factory, abi: fuseboxFactoryAbi, functionName: "isWallet", args: [addr] });
}

async function build(addr: Address): Promise<Atlas> {
  const W = { address: addr, abi: fuseboxWalletAbi } as const;
  const R = { address: DEPLOYMENT.registry, abi: fuseRegistryAbi } as const;
  const head = await client.getBlock();
  const [owner, paused, n, decisions, allowed, blocked, approvers, balance, feeBalance, protocolBps] = await Promise.all([
    client.readContract({ ...W, functionName: "owner" }),
    client.readContract({ ...W, functionName: "paused" }),
    client.readContract({ ...W, functionName: "fuseCount" }),
    client.readContract({ ...W, functionName: "decisionCount" }),
    client.readContract({ ...W, functionName: "allowedCount" }),
    client.readContract({ ...W, functionName: "blockedCount" }),
    client.readContract({ ...W, functionName: "approvers" }),
    client.readContract({ address: DEPLOYMENT.usdt0, abi: erc20, functionName: "balanceOf", args: [addr] }),
    client.readContract({ ...R, functionName: "feeBalance", args: [addr] }),
    client.readContract({ ...R, functionName: "protocolFeeBps" }),
  ]);
  const fuses = await Promise.all(Array.from({ length: Number(n) }, async (_, i) => {
    const s = await client.readContract({ ...W, functionName: "slotAt", args: [BigInt(i)] });
    const [f, designer, dCount, earned, life, spent] = await Promise.all([
      client.readContract({ ...R, functionName: "fuse", args: [s.fuseId] }),
      client.readContract({ ...R, functionName: "designerOf", args: [s.fuseId] }),
      client.readContract({ ...R, functionName: "decisions", args: [s.fuseId] }),
      client.readContract({ ...R, functionName: "earned", args: [s.fuseId] }),
      client.readContract({ ...R, functionName: "lifetimeEarned", args: [s.fuseId] }),
      client.readContract({ ...W, functionName: "spentToday", args: [BigInt(i)] }),
    ]);
    const key = SOCKET_KEY[Number(s.socket)] ?? `socket-${s.socket}`;
    return {
      slot: i, fuseId: Number(s.fuseId), key, name: NAME[key] ?? key, circuitId: Number(s.circuitId), processor: s.processor,
      gates: Number(f.gateCount), nState: Number(s.nState), fee: usd(f.fee), maxFee: usd(s.maxFee),
      unit: usd(s.params.unit), a: Number(s.params.a), b: Number(s.params.b),
      latched: s.nState > 0 && s.state !== "0x" && BigInt(s.state) !== 0n, designer, decisions: Number(dCount),
      earned: usd(earned), lifetimeEarned: usd(life), spentToday: usd(spent),
    } satisfies FuseSlot;
  }));
  const hist = await readHistory(addr, head.number);
  const paidToDesigners = usd(hist.rows.reduce((t, r) => t + BigInt(Math.round(Number(r.fee) * 1e6)), 0n));
  return {
    source: IS_FORK ? "fork" : "mainnet", block: Number(head.number), time: Number(head.timestamp),
    wallet: addr, registry: DEPLOYMENT.registry, processor: DEPLOYMENT.processor, owner, agent: isAtlas(addr) ? DEPLOYMENT.agent : ([...hist.agents][0] ?? ("0x0000000000000000000000000000000000000000" as Address)), usdt0: DEPLOYMENT.usdt0,
    paused, balance: usd(balance), feeBalance: usd(feeBalance), protocolBps: Number(protocolBps),
    counts: { decisions: Number(decisions), allowed: Number(allowed), blocked: Number(blocked) },
    fuses, decisions: [...hist.rows].sort((a, b) => b.id - a.id).slice(0, 60),
    payees: [...hist.payees].map(([address, since]) => ({ address, since })), approvers: [...approvers],
    paidToDesigners, isAtlas: isAtlas(addr),
  };
}

// ------------------------------------------------------------------ the playground: a real check() against Atlas
export interface CheckResult {
  allowed: boolean; block: number; amount: string; to: Address;
  fuses: { name: string; key: string; status: FuseStatus; why: string }[];
}

export async function checkPayment(to: Address, amount: bigint): Promise<CheckResult> {
  const W = { address: DEPLOYMENT.atlas, abi: fuseboxWalletAbi } as const;
  const [atlas, res, since, mask, head] = await Promise.all([
    getAtlas(),
    client.readContract({ ...W, functionName: "check", args: [DEPLOYMENT.usdt0, to, amount] }),
    client.readContract({ ...W, functionName: "payeeAddedAt", args: [to] }),
    client.readContract({ ...W, functionName: "approvalMaskOf", args: [DEPLOYMENT.usdt0, to, amount] }),
    client.getBlockNumber(),
  ]);
  const [allowed, status] = res;
  const amt = Number(formatUnits(amount, 6));
  const now = Date.now() / 1000;
  const approvals = [0, 1, 2].filter((b) => (Number(mask) >> b) & 1).length;
  const fuses = atlas.fuses.map((f, i) => {
    const st = STATUS[status[i]] ?? "failed";
    const ok = st === "pass";
    let why = "";
    if (st === "failed") why = "The circuit call failed, so the fuse fails closed.";
    else if (st === "untrusted") why = "TapeOut's processor code changed and isn't attested, so the fuse fails closed.";
    else if (f.key === "daily-cap") {
      const left = Math.max(0, f.a - Number(f.spentToday));
      why = ok ? `Within today's cap: ${left} of ${f.a} USDT0 left.` : `${amt} USDT0 would pass today's ${f.a} USDT0 cap (${Number(f.spentToday)} spent).`;
    } else if (f.key === "payee-guard") {
      const s = Number(since);
      const hours = s ? (now - s) / 3600 : 0;
      why = ok ? (s && hours >= f.a ? "A saved payee, past its cooling-off." : `Saved ${hours.toFixed(1)} h ago and still cooling off, but ${amt} USDT0 is within the ${f.b} USDT0 trial.`)
        : !s ? "Not a saved payee." : `Saved ${hours.toFixed(1)} h ago: still cooling off (${f.a} h), and ${amt} USDT0 is over the ${f.b} USDT0 trial.`;
    } else if (f.key === "breaker") {
      why = f.latched ? "Already blown. Nothing pays until the owner resets it." : ok ? "Not tripped." : "A payment to a stranger trips it, and it stays blown until the owner resets it.";
    } else if (f.key === "approval-2of3") {
      why = ok ? (amt > f.a ? `Over ${f.a} USDT0 and approved by ${approvals} of 3.` : `Under the ${f.a} USDT0 approval threshold.`) : `Over ${f.a} USDT0: needs two of three approvers, has ${approvals}.`;
    }
    return { name: f.name, key: f.key, status: st, why };
  });
  return { allowed, block: Number(head), amount: formatUnits(amount, 6), to, fuses };
}
