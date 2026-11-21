import "server-only";
import { getAddress, parseUnits, type Address } from "viem";
import { client, DEPLOYMENT } from "./chain";
import { fuseboxWalletAbi } from "./abi";
import { factoryWallets } from "./logs";
import { getHistory } from "./atlas";

/**
 * An approver's inbox: every payment an agent was refused by an approval fuse (socket 4) in a wallet where this
 * address holds a seat, until a later decision pays that exact payee and amount. Each open request carries the
 * signatures it has now (approvalMaskOf: zero once the approval window lapses or the seats change).
 */
export interface Request {
  wallet: Address; isAtlas: boolean; to: Address; amount: string; memo: string; attempts: number; first: number; last: number;
  seats: Address[]; mySeat: number; mask: number; threshold: number | null; saved: boolean;
  paid?: number; // set when a later decision paid it (unix time)
}
export interface Inbox { approver: Address; block: number; wallets: number; seated: number; open: Request[]; recent: Request[] }

const APPROVAL_SOCKET = 4;
const cache = new Map<string, { at: number; data: Inbox }>();

export interface SeatMap { head: number; wallets: number; seated: { w: Address; seats: Address[] }[] }

/** Every factory wallet's approver seats, read once (a sweep reuses it for every approver). */
export async function seatMap(): Promise<SeatMap> {
  const head = Number(await client.getBlockNumber());
  const wallets = await factoryWallets(head);
  const seatsOf = await Promise.all(wallets.map((w) => client.readContract({ address: w, abi: fuseboxWalletAbi, functionName: "approvers" }).then((s) => [...s] as Address[]).catch(() => null)));
  return { head, wallets: wallets.length, seated: wallets.map((w, i) => ({ w: getAddress(w), seats: seatsOf[i] ?? [] })).filter((x) => x.seats.some((s) => s !== "0x0000000000000000000000000000000000000000")) };
}

/** Whether the address holds a seat on any Fusebox wallet. */
export const holdsSeat = (m: SeatMap, a: Address) => m.seated.some((x) => x.seats.some((s) => s.toLowerCase() === a.toLowerCase()));

export async function inboxFor(approverIn: Address, opts: { fresh?: boolean; seats?: SeatMap } = {}): Promise<Inbox> {
  const approver = getAddress(approverIn);
  const hit = cache.get(approver);
  if (!opts.fresh && hit && Date.now() - hit.at < 8000) return hit.data;
  const map = opts.seats ?? (await seatMap());
  const head = map.head, wallets = { length: map.wallets };
  const mine = map.seated.filter((x) => x.seats.some((s) => s.toLowerCase() === approver.toLowerCase()));

  const open: Request[] = [], recent: Request[] = [];
  await Promise.all(mine.map(async ({ w, seats }) => {
    const h = await getHistory(w);
    const appr = h.sockets.map((s, i) => (s === APPROVAL_SOCKET ? i : -1)).filter((i) => i >= 0);
    if (!appr.length) return;
    const threshold = h.settings[appr[0]]?.a ?? null;
    const saved = new Set([...h.payees.keys()].map((a) => a.toLowerCase()));
    const req = new Map<string, Request>();
    for (const r of h.rows) {
      const key = `${r.to.toLowerCase()}:${r.amount}`;
      const byApproval = !r.allowed && r.status.length === h.sockets.length && appr.some((i) => r.status[i] === "blew");
      if (byApproval) {
        const x = req.get(key);
        if (x && !x.paid) { x.attempts++; x.last = r.time; x.memo = r.memo; }
        else req.set(key, { wallet: w, isAtlas: w.toLowerCase() === DEPLOYMENT.atlas.toLowerCase(), to: r.to, amount: r.amount, memo: r.memo, attempts: 1, first: r.time, last: r.time, seats: seats!, mySeat: seats!.findIndex((s) => s.toLowerCase() === approver.toLowerCase()), mask: 0, threshold, saved: saved.has(r.to.toLowerCase()) });
      } else if (r.allowed) {
        const x = req.get(key);
        if (x && !x.paid) x.paid = r.time;
      }
    }
    await Promise.all([...req.values()].map(async (x) => {
      if (x.paid) { recent.push(x); return; }
      x.mask = Number(await client.readContract({ address: w, abi: fuseboxWalletAbi, functionName: "approvalMaskOf", args: [DEPLOYMENT.usdt0, x.to, parseUnits(x.amount, 6)] }).catch(() => 0));
      open.push(x);
    }));
  }));
  open.sort((a, b) => b.last - a.last);
  recent.sort((a, b) => (b.paid ?? 0) - (a.paid ?? 0));
  const data: Inbox = { approver, block: head, wallets: wallets.length, seated: mine.length, open: open.slice(0, 50), recent: recent.slice(0, 10) };
  cache.set(approver, { at: Date.now(), data });
  return data;
}
