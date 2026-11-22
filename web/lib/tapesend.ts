import "server-only";
import { concatHex, createWalletClient, fallback, http, keccak256, parseAbi, parseAbiItem, stringToHex, hexToString, type Address, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "viem/chains";
import { client, DEPLOYMENT, RPCS } from "./chain";
import { getJson, putJson, putOnce, remove } from "./store";
import { plainStop, type Decision } from "./telegram";

/**
 * On-chain fuse alerts over TapeSend (TapeOut's DeWEB messaging layer). Every payment a Fusebox wallet's fuses stop is
 * posted, once, to that wallet's TapeSend inbox on X Layer: endpoint uint32(0) ‖ uint64(196) ‖ wallet, on the DeWEB
 * hub. The sender is the container of Fusebox's circuit #15, which FuseboxHerald holds; this server only has the
 * herald's crier key, which can post and do nothing else. Anyone can read the inbox straight from the hub.
 */
const H = DEPLOYMENT.herald;
const KEY = process.env.HERALD_CRIER_KEY as Hex | undefined;
export const TS_READY = !!H && !!KEY && /^0x[0-9a-fA-F]{64}$/.test(KEY);
export const HERALD = H;
const PER_HOUR = 6; // alerts per wallet per hour; beyond that the wallet page and Telegram still show every stop

const heraldAbi = parseAbi([
  "function post(bytes32 to, bytes32 ref, bytes payload) returns (uint256)",
  "function postMany(bytes32[] to, bytes[] payloads)",
]);
const hubAbi = parseAbi([
  "function inboxCount(bytes32 to) view returns (uint256)",
  "function inboxPage(bytes32 to, uint256 start, uint256 n) view returns ((address from, uint56 blockNumber, uint40 timestamp, bytes32 digest)[])",
]);
const SENT = parseAbiItem("event Sent(bytes32 indexed to, address indexed from, bytes32 indexed ref, uint256 inboxIndex, uint256 outboxIndex, bytes payload)");

/** TapeSend endpoint of an address on X Layer. */
export const endpointOf = (a: Address): Hex => `0x${((BigInt(DEPLOYMENT.chainId) << 160n) | BigInt(a)).toString(16).padStart(64, "0")}`;

/** A public TapeSend message: magic "TS", format 2, kind 0 (public), then the TAP-10 content JSON. */
export function encodeMessage(m: { subject: string; body: string; ts?: number }): Hex {
  const json = JSON.stringify({ v: 1, kind: "message", subject: m.subject, body: m.body, ...(m.ts !== undefined ? { ts: m.ts } : {}) });
  return concatHex(["0x54530200", stringToHex(json)]);
}
export function decodeMessage(payload: Hex): { subject: string; body: string; ts: number | null } | null {
  if (!payload.toLowerCase().startsWith("0x54530200")) return null;
  try {
    const v = JSON.parse(hexToString(`0x${payload.slice(10)}`)) as { v?: number; kind?: string; subject?: unknown; body?: unknown; ts?: unknown };
    if (v.v !== 1 || v.kind !== "message" || typeof v.body !== "string") return null;
    return { subject: typeof v.subject === "string" ? v.subject.slice(0, 200) : "", body: v.body.slice(0, 4000), ts: Number.isSafeInteger(v.ts) ? (v.ts as number) : null };
  } catch { return null; }
}

function crier() {
  return createWalletClient({
    account: privateKeyToAccount(KEY!),
    chain: { ...xLayer, rpcUrls: { default: { http: [RPCS[0]] } } },
    transport: fallback(RPCS.map((u) => http(u, { timeout: 10_000 }))),
  });
}

/** Claims the right to post this stop: once per decision, and at most PER_HOUR per wallet per hour. */
async function claim(d: Decision): Promise<boolean> {
  if (d.allowed) return false;
  const key = d.wallet.toLowerCase();
  const hour = Math.floor(Date.now() / 3_600_000);
  const rate = (await getJson<{ hour: number; n: number }>(`ts/rate/${key}.json`)) ?? { hour, n: 0 };
  const n = rate.hour === hour ? rate.n : 0;
  if (n >= PER_HOUR) return false;
  if (!(await putOnce(`ts/sent/${key}/${d.id}.json`, { tx: d.tx, at: Date.now() }))) return false;
  await putJson(`ts/rate/${key}.json`, { hour, n: n + 1 });
  return true;
}

/** Posts every stop among `ds` that hasn't been posted, in one transaction. Returns the transaction, if any. */
export async function postStops(ds: Decision[]): Promise<{ posted: number; tx?: Hash }> {
  if (!TS_READY) return { posted: 0 };
  const todo: Decision[] = [];
  for (const d of ds) if (await claim(d)) todo.push(d);
  if (!todo.length) return { posted: 0 };
  const ts = Math.floor(Date.now() / 1000);
  const to = todo.map((d) => endpointOf(d.wallet));
  const payloads = todo.map((d) => encodeMessage({ ...plainStop(d), ts }));
  const w = crier();
  try {
    const tx = todo.length === 1
      ? await w.writeContract({ address: H!.address, abi: heraldAbi, functionName: "post", args: [to[0], `0x${"0".repeat(64)}`, payloads[0]] })
      : await w.writeContract({ address: H!.address, abi: heraldAbi, functionName: "postMany", args: [to, payloads] });
    return { posted: todo.length, tx };
  } catch (e) {
    // nothing went out: let the next notify or sweep try these again
    await Promise.all(todo.map((d) => remove(`ts/sent/${d.wallet.toLowerCase()}/${d.id}.json`).catch(() => {})));
    throw e;
  }
}

// ---- reading an inbox back -----------------------------------------------------------------------------------

export interface ChainAlert { index: number; fromFusebox: boolean; from: Address; time: number; subject: string; body: string; tx: Hash; verified: boolean }

/**
 * The latest messages in a wallet's TapeSend inbox, read from the hub: the inbox entry (sender, block, digest) from
 * storage, the payload from that block's Sent event, checked against the digest. Messages from anyone but Fusebox's
 * container are reported as such and never shown as Fusebox's.
 */
export async function inboxOf(wallet: Address, n = 10): Promise<{ count: number; alerts: ChainAlert[] }> {
  if (!H) return { count: 0, alerts: [] };
  const to = endpointOf(wallet);
  const count = Number(await client.readContract({ address: H.hub, abi: hubAbi, functionName: "inboxCount", args: [to] }));
  if (!count) return { count, alerts: [] };
  const start = Math.max(0, count - n);
  const page = await client.readContract({ address: H.hub, abi: hubAbi, functionName: "inboxPage", args: [to, BigInt(start), BigInt(count - start)] });
  const blocks = [...new Set(page.map((e) => Number(e.blockNumber)))];
  const logs = (await Promise.all(blocks.map((b) => client.getLogs({ address: H.hub, event: SENT, args: { to }, fromBlock: BigInt(b), toBlock: BigInt(b) })))).flat();
  const alerts: ChainAlert[] = [];
  page.forEach((e, k) => {
    const index = start + k;
    const l = logs.find((x) => Number(x.args.inboxIndex) === index);
    const payload = (l?.args.payload ?? "0x") as Hex;
    const ref = (l?.args.ref ?? `0x${"0".repeat(64)}`) as Hex;
    const verified = !!l && keccak256(concatHex([ref, keccak256(payload)])) === e.digest;
    const m = verified ? decodeMessage(payload) : null;
    alerts.push({
      index, from: e.from, fromFusebox: e.from.toLowerCase() === H.container.toLowerCase(), time: Number(e.timestamp),
      subject: m?.subject ?? "", body: m?.body ?? "", tx: (l?.transactionHash ?? "0x") as Hash, verified: verified && !!m,
    });
  });
  return { count, alerts: alerts.reverse() };
}

// ---- the sweep's own cursor and wallet list ------------------------------------------------------------------

export const tsState = {
  get: () => getJson<{ block: number; wallets: string[] }>("ts/sweep.json"),
  set: (block: number, wallets: string[]) => putJson("ts/sweep.json", { block, wallets, at: Date.now() }),
};
