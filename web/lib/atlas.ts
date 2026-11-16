import "server-only";
import { unstable_cache } from "next/cache";
import { decodeEventLog, formatUnits, type Address, type Hex } from "viem";
import { fuseboxLogs } from "./logs";
import { client, DEPLOYMENT, IS_FORK, RPC } from "./chain";
import { fuseboxWalletAbi, fuseRegistryAbi, fuseboxFactoryAbi, tapeoutProcessorAbi } from "./abi";
import { decodeDataUri } from "./fuseMeta";

const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const SOCKET_KEY: Record<number, string> = { 1: "daily-cap", 2: "payee-guard", 3: "breaker", 4: "approval-2of3" };
const NAME: Record<string, string> = { "daily-cap": "Daily Cap", "payee-guard": "Payee Guard", breaker: "Breaker", "approval-2of3": "Two of Three" };
export const STATUS = ["pass", "blew", "failed", "untrusted"] as const;
export type FuseStatus = (typeof STATUS)[number];
const usd = (v: bigint) => formatUnits(v, 6);

export interface FuseSlot {
  slot: number; fuseId: number; key: string; name: string; circuitId: number; processor: Address;
  gates: number; nState: number; fee: string; maxFee: string; unit: string; a: number; b: number; token: Address; socket: number;
  latched: boolean; designer: Address; decisions: number; earned: string; lifetimeEarned: string; spentToday: string;
  /** one of the four fuses Fusebox shipped (they have hand-drawn schematics and built-in copy) */
  original?: boolean; summary?: string; paramLabels?: { a?: string; b?: string };
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
  /** Owner-console fields (absent from older snapshots). */
  agents?: Address[]; pendingOwner?: Address; approvalTtl?: number;
  limits?: { maxDecisions: number; maxBlocked: number; decisionsToday: number; blockedToday: number; day: number };
}

// ------------------------------------------------------------------ decision log (from the shared log layer)
const blockTime = new Map<number, number>();
// a block's timestamp never changes: keep it in the shared data cache so a cold server doesn't re-ask the RPC for each one
const cachedBlockTime = unstable_cache(async (b: number) => Number((await client.getBlock({ blockNumber: BigInt(b) })).timestamp), ["fusebox-blocktime", RPC], { revalidate: false });
const isAtlas = (a: Address) => a.toLowerCase() === DEPLOYMENT.atlas.toLowerCase();
async function readHistory(addr: Address, head: bigint) {
  // the shared log layer covers every factory wallet from its creation, so any wallet's full history is here
  const logs = (await fuseboxLogs(Number(head))).filter((l) => l.address === addr.toLowerCase());
  const rows: DecisionRow[] = []; const payees = new Map<Address, number>(); const agents = new Set<Address>();
  const need = [...new Set(logs.map((l) => l.blockNumber))].filter((b) => !blockTime.has(b));
  await Promise.all(need.map(async (b) => blockTime.set(b, await cachedBlockTime(b))));
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

/** A wallet's whole decision history, oldest first, with the fuse names of its current line (for exports and feeds). */
export async function getHistory(addr: Address) {
  const head = await client.getBlockNumber();
  const W = { address: addr, abi: fuseboxWalletAbi } as const;
  const [hist, n] = await Promise.all([readHistory(addr, head), client.readContract({ ...W, functionName: "fuseCount" })]);
  const slots = await Promise.all(Array.from({ length: Number(n) }, (_, i) => client.readContract({ ...W, functionName: "slotAt", args: [BigInt(i)] })));
  // the same names as the wallet page: the shipped fuses by socket, any other design by its own metadata
  const names = await Promise.all(slots.map(async (s) => {
    const byKey = NAME[SOCKET_KEY[Number(s.socket)] ?? ""] ?? `socket ${s.socket}`;
    if (DEPLOYMENT.fuseIds.includes(Number(s.fuseId))) return byKey;
    const uri = await client.readContract({ address: DEPLOYMENT.registry, abi: fuseRegistryAbi, functionName: "metadataURI", args: [s.fuseId] }).catch(() => "");
    return (uri && decodeDataUri(uri)?.name) || byKey;
  }));
  return { rows: hist.rows, payees: hist.payees, names, sockets: slots.map((s) => Number(s.socket)), settings: slots.map((s) => ({ a: Number(s.params.a), b: Number(s.params.b) })) };
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
  // the head, the wallet's state and (once the head is known) its history all load at once
  const headP = client.getBlock();
  const histP = headP.then((h) => readHistory(addr, h.number));
  histP.catch(() => {}); // awaited below; this only stops an early failure from leaving it unhandled
  const [head, [owner, paused, n, decisions, allowed, blocked, approvers, balance, feeBalance, protocolBps, pendingOwner, approvalTtl, maxDec, maxBlk, decToday, blkToday, day]] = await Promise.all([headP, Promise.all([
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
    client.readContract({ ...W, functionName: "pendingOwner" }),
    client.readContract({ ...W, functionName: "approvalTtl" }),
    client.readContract({ ...W, functionName: "maxDecisionsPerDay" }),
    client.readContract({ ...W, functionName: "maxBlockedPerDay" }),
    client.readContract({ ...W, functionName: "decisionsToday" }),
    client.readContract({ ...W, functionName: "blockedToday" }),
    client.readContract({ ...W, functionName: "counterDay" }),
  ])]);
  const fuses = await Promise.all(Array.from({ length: Number(n) }, async (_, i) => {
    const s = await client.readContract({ ...W, functionName: "slotAt", args: [BigInt(i)] });
    // a sequential fuse is "blown" when a clean payment (attempt, payee saved) would be refused from its current state;
    // asking the processor works for any design on the socket, however many latches it keeps
    const blocked = s.nState > 0
      ? client.readContract({ address: s.processor, abi: tapeoutProcessorAbi, functionName: "step", args: [s.circuitId, s.state, "0x04"] }).then(([, out]) => (Number(BigInt(out || "0x0")) & 1) === 0).catch(() => s.state !== "0x" && BigInt(s.state) !== 0n)
      : Promise.resolve(false);
    const [f, designer, dCount, earned, life, spent, uri, latched] = await Promise.all([
      client.readContract({ ...R, functionName: "fuse", args: [s.fuseId] }),
      client.readContract({ ...R, functionName: "designerOf", args: [s.fuseId] }),
      client.readContract({ ...R, functionName: "decisions", args: [s.fuseId] }),
      client.readContract({ ...R, functionName: "earned", args: [s.fuseId] }),
      client.readContract({ ...R, functionName: "lifetimeEarned", args: [s.fuseId] }),
      client.readContract({ ...W, functionName: "spentToday", args: [BigInt(i)] }),
      client.readContract({ ...R, functionName: "metadataURI", args: [s.fuseId] }).catch(() => ""),
      blocked,
    ]);
    const meta = uri ? decodeDataUri(uri) : null;
    const original = DEPLOYMENT.fuseIds.includes(Number(s.fuseId));
    const key = SOCKET_KEY[Number(s.socket)] ?? `socket-${s.socket}`;
    return {
      slot: i, fuseId: Number(s.fuseId), key, name: (original ? NAME[key] : meta?.name) ?? NAME[key] ?? key, circuitId: Number(s.circuitId), processor: s.processor,
      gates: Number(f.gateCount), nState: Number(s.nState), fee: usd(f.fee), maxFee: usd(s.maxFee),
      unit: usd(s.params.unit), a: Number(s.params.a), b: Number(s.params.b),
      latched, designer, decisions: Number(dCount), original, summary: meta?.summary, paramLabels: original ? undefined : meta?.params,
      earned: usd(earned), lifetimeEarned: usd(life), spentToday: usd(spent), token: s.params.token, socket: Number(s.socket),
    } satisfies FuseSlot;
  }));
  const hist = await histP;
  const paidToDesigners = usd(hist.rows.reduce((t, r) => t + BigInt(Math.round(Number(r.fee) * 1e6)), 0n));
  return {
    source: IS_FORK ? "fork" : "mainnet", block: Number(head.number), time: Number(head.timestamp),
    wallet: addr, registry: DEPLOYMENT.registry, processor: DEPLOYMENT.processor, owner, agent: isAtlas(addr) ? DEPLOYMENT.agent : ([...hist.agents][0] ?? ("0x0000000000000000000000000000000000000000" as Address)), usdt0: DEPLOYMENT.usdt0,
    paused, balance: usd(balance), feeBalance: usd(feeBalance), protocolBps: Number(protocolBps),
    counts: { decisions: Number(decisions), allowed: Number(allowed), blocked: Number(blocked) },
    fuses, decisions: [...hist.rows].sort((a, b) => b.id - a.id).slice(0, 60),
    payees: [...hist.payees].map(([address, since]) => ({ address, since })), approvers: [...approvers],
    paidToDesigners, isAtlas: isAtlas(addr),
    agents: [...hist.agents], pendingOwner, approvalTtl: Number(approvalTtl),
    // the counters roll over at the first decision of a new UTC day; before that, today's count is 0
    limits: { maxDecisions: Number(maxDec), maxBlocked: Number(maxBlk), day: Number(day),
      decisionsToday: Number(day) === Math.floor(Number(head.timestamp) / 86400) ? Number(decToday) : 0,
      blockedToday: Number(day) === Math.floor(Number(head.timestamp) / 86400) ? Number(blkToday) : 0 },
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
      why = ok ? `Within today's cap: ${left} of ${f.a} USD₮0 left.` : `${amt} USD₮0 would pass today's ${f.a} USD₮0 cap (${Number(f.spentToday)} spent).`;
    } else if (f.key === "payee-guard") {
      const s = Number(since);
      const hours = s ? (now - s) / 3600 : 0;
      why = ok ? (s && hours >= f.a ? "A saved payee, past its cooling-off." : `Saved ${hours.toFixed(1)} h ago and still cooling off, but ${amt} USD₮0 is within the ${f.b} USD₮0 trial.`)
        : !s ? "Not a saved payee." : `Saved ${hours.toFixed(1)} h ago: still cooling off (${f.a} h), and ${amt} USD₮0 is over the ${f.b} USD₮0 trial.`;
    } else if (f.key === "breaker") {
      why = f.latched ? "Already blown. Nothing pays until the owner resets it." : ok ? "Not tripped." : "A payment to a stranger trips it, and it stays blown until the owner resets it.";
    } else if (f.key === "approval-2of3") {
      why = ok ? (amt > f.a ? `Over ${f.a} USD₮0 and approved by ${approvals} of 3.` : `Under the ${f.a} USD₮0 approval threshold.`) : `Over ${f.a} USD₮0: needs two of three approvers, has ${approvals}.`;
    }
    return { name: f.name, key: f.key, status: st, why };
  });
  return { allowed, block: Number(head), amount: formatUnits(amount, 6), to, fuses };
}
