"use client";
import { parseUnits, toHex, type Address, type Hex } from "viem";
import { tapeoutProcessorAbi } from "./abi";
import { pub } from "./client-chain";
import { SOCKETS } from "./sockets";

/**
 * Runs a sequence of payments through a line of fuses using TapeOut's own processor on X Layer: every verdict is
 * an `eval` (or `step`, for fuses with latches) eth_call. Free and read-only. The inputs are derived exactly as
 * FuseboxWallet._paymentInputs does: amounts rounded up to whole units and saturated at 255, today's spend counted
 * from paid payments only, payee age in hours saturated at 255, the Breaker's "suspect" = not in the payee book,
 * and latch state carried forward after every decision, paid or stopped.
 */
export interface SimFuse { fuseId: number; name: string; socket: number; processor: Address; circuitId: number; nState: number; a: number; b: number }
export type Payee = "saved" | "new" | "stranger";
export interface SimPayment { memo: string; to: Payee; amount: string; seats: [boolean, boolean, boolean] }
export type Verdict = "pass" | "blew" | "error";
export interface SimStep { allowed: boolean; verdicts: Verdict[]; spentBefore: number; latchedAfter: boolean[] }

const UNIT = 1_000_000n; // the app installs every amount-reading fuse with a 1 USDT0 step

const quantise = (raw: bigint) => (raw === 0n ? 0 : Math.min(255, Number((raw - 1n) / UNIT + 1n)));

/** A socket's input bits from named fields, least-significant first, packed as TAP-02 expects (bit i%8 of byte i/8). */
export function packInputs(socket: number, fields: Record<string, number>): Hex {
  const pins = SOCKETS[socket]?.pins ?? [];
  const bits: number[] = [];
  for (const [name, width] of pins) { const v = fields[name] ?? 0; for (let k = 0; k < width; k++) bits.push((v >> k) & 1); }
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((b, i) => { if (b) bytes[i >> 3] |= 1 << (i & 7); });
  return toHex(bytes);
}

function inputsFor(f: SimFuse, p: SimPayment, spentRaw: bigint, newPayeeHours: number): Record<string, number> {
  const amount = quantise(parseUnits(p.amount || "0", 6));
  const listed = p.to !== "stranger" ? 1 : 0;
  if (f.socket === 1) return { amount, spent: quantise(spentRaw), cap: f.a };
  if (f.socket === 2) return { listed, age: p.to === "saved" ? 255 : p.to === "new" ? Math.min(255, newPayeeHours) : 0, cooldown: f.a, amount, trial: f.b };
  if (f.socket === 3) return { set: 0, clear: 0, attempt: 1, suspect: 1 - listed };
  if (f.socket === 4) return { approvals: (p.seats[0] ? 1 : 0) | (p.seats[1] ? 2 : 0) | (p.seats[2] ? 4 : 0), amount, threshold: f.a };
  return {};
}

const okOut = (out: Hex) => (Number(BigInt(out === "0x" ? "0x0" : out)) & 1) === 1;

/** Run every payment in order. `onStep` reports each decision as it lands, so the UI can reveal them one by one. */
export async function runLine(fuses: SimFuse[], payments: SimPayment[], opts: { spentToday: string; newPayeeHours: number }, onStep?: (i: number, s: SimStep) => void): Promise<SimStep[]> {
  let spent = parseUnits(opts.spentToday || "0", 6);
  const state: Hex[] = fuses.map((f) => toHex(new Uint8Array(Math.ceil(f.nState / 8))));
  const latched = fuses.map(() => false);
  const out: SimStep[] = [];
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    const spentBefore = Number(spent) / 1e6;
    const res = await Promise.all(fuses.map(async (f, k) => {
      const inputs = packInputs(f.socket, inputsFor(f, p, spent, opts.newPayeeHours));
      try {
        if (f.nState > 0) {
          const [next, o] = await pub.readContract({ address: f.processor, abi: tapeoutProcessorAbi, functionName: "step", args: [BigInt(f.circuitId), state[k], inputs] });
          return { v: (okOut(o) ? "pass" : "blew") as Verdict, next };
        }
        const o = await pub.readContract({ address: f.processor, abi: tapeoutProcessorAbi, functionName: "eval", args: [BigInt(f.circuitId), inputs] });
        return { v: (okOut(o) ? "pass" : "blew") as Verdict, next: undefined };
      } catch { return { v: "error" as Verdict, next: undefined }; }
    }));
    const allowed = res.every((r) => r.v === "pass");
    // carry each latch forward, then ask the circuit whether a clean payment (saved payee) would now pass:
    // that's "blown", whatever the design keeps in its latches (a first strike isn't blown)
    await Promise.all(res.map(async (r, k) => {
      if (r.next === undefined || r.v === "error") return;
      state[k] = r.next;
      const f = fuses[k];
      try {
        const [, o] = await pub.readContract({ address: f.processor, abi: tapeoutProcessorAbi, functionName: "step", args: [BigInt(f.circuitId), state[k], packInputs(f.socket, { set: 0, clear: 0, attempt: 1, suspect: 0 })] });
        latched[k] = !okOut(o);
      } catch { /* keep the last answer */ }
    }));
    if (allowed) spent += parseUnits(p.amount || "0", 6);
    const step: SimStep = { allowed, verdicts: res.map((r) => r.v), spentBefore, latchedAfter: [...latched] };
    out.push(step);
    onStep?.(i, step);
  }
  return out;
}
