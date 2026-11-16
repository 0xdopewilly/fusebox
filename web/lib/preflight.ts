import "server-only";
import { parseUnits, toHex, type Address, type Hex } from "viem";
import { client, DEPLOYMENT } from "./chain";
import { fuseRegistryAbi, tapeoutProcessorAbi } from "./abi";
import { decodeDataUri } from "./fuseMeta";
import { SOCKETS } from "./sockets";

/**
 * Pre-flight: run a payment through a line of TapeOut circuits for any agent wallet, before it signs. Every verdict is
 * TapeOut's own `eval` (or `step`, for circuits with latches) on X Layer as an eth_call: free, read-only, nothing moves.
 * Fusebox wallets keep the context on-chain; here the caller supplies it (what it spent today, whether the payee is
 * saved and since when, which approvers signed, the latch state from its last call), and gets the next latch state back.
 * Inputs are derived exactly as FuseboxWallet does: amounts rounded up to whole USD₮0 and saturated at 255, payee age
 * in hours saturated at 255, the Breaker's "suspect" = the payee isn't saved.
 */
export interface PreflightFuse { fuseId: number; a?: number; b?: number }
export interface PreflightContext {
  /** USD₮0 already paid today through this line (default 0) */
  spentToday?: string;
  /** the payee: saved in the agent's payee book, and how many hours ago (default: not saved) */
  payee?: { saved: boolean; hoursSinceSaved?: number };
  /** which of three approvers signed this exact payment: three booleans, or a count (default none) */
  approvals?: [boolean, boolean, boolean] | number;
  /** latch state per line position, from the previous response's `state` (default: fresh) */
  state?: Record<string, Hex>;
}
export interface PreflightRequest { line: PreflightFuse[]; payment: { amount: string; to?: string }; context?: PreflightContext }
export type PreflightVerdict = "pass" | "blew" | "error";
export interface PreflightResult {
  allowed: boolean; block: number;
  fuses: { fuseId: number; name: string; socket: number; circuitId: number; processor: Address; settings: { a: number; b: number }; verdict: PreflightVerdict; why: string; blownAfter?: boolean }[];
  /** latch state to send back next time, per line position (only circuits that have latches) */
  state: Record<string, Hex>;
  summary: string;
}

export class PreflightError extends Error {}

const UNIT = 1_000_000n;
const quantise = (raw: bigint) => (raw === 0n ? 0 : Math.min(255, Number((raw - 1n) / UNIT + 1n)));
const okOut = (out: Hex) => (Number(BigInt(out === "0x" ? "0x0" : out)) & 1) === 1;
function pack(socket: number, fields: Record<string, number>): Hex {
  const pins = SOCKETS[socket]?.pins ?? [];
  const bits: number[] = [];
  for (const [name, width] of pins) { const v = fields[name] ?? 0; for (let k = 0; k < width; k++) bits.push((v >> k) & 1); }
  const bytes = new Uint8Array(Math.max(1, Math.ceil(bits.length / 8)));
  bits.forEach((b, i) => { if (b) bytes[i >> 3] |= 1 << (i & 7); });
  return toHex(bytes);
}

/** fuse heads change only when a designer relists: keep them a minute */
const heads = new Map<number, { at: number; v: { processor: Address; circuitId: bigint; socket: number; nState: number; listed: boolean; name: string } }>();
async function head(fuseId: number) {
  const hit = heads.get(fuseId);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const R = { address: DEPLOYMENT.registry, abi: fuseRegistryAbi } as const;
  const [f, uri] = await Promise.all([
    client.readContract({ ...R, functionName: "fuse", args: [BigInt(fuseId)] }).catch((e: Error) => { if (/UnknownFuse/.test(e?.message ?? "")) return null; throw e; }),
    client.readContract({ ...R, functionName: "metadataURI", args: [BigInt(fuseId)] }).catch(() => ""),
  ]);
  if (!f || /^0x0{40}$/i.test(f.processor)) throw new PreflightError(`Fuse ${fuseId} doesn't exist in Fusebox's registry.`);
  const meta = uri ? decodeDataUri(uri) : null;
  const v = { processor: f.processor, circuitId: f.circuitId, socket: Number(f.socket), nState: Number(f.nState), listed: f.listed, name: meta?.name ?? SOCKETS[Number(f.socket)]?.name ?? `Fuse ${fuseId}` };
  heads.set(fuseId, { at: Date.now(), v });
  return v;
}

const intIn = (v: unknown, lo: number, hi: number, what: string) => {
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) throw new PreflightError(`${what} must be a whole number from ${lo} to ${hi}.`);
  return v;
};

export async function preflight(req: PreflightRequest): Promise<PreflightResult> {
  if (!Array.isArray(req?.line) || req.line.length < 1 || req.line.length > 8) throw new PreflightError("Send a line of 1 to 8 fuses: [{ fuseId, a, b }].");
  const amountStr = String(req.payment?.amount ?? "");
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(amountStr) || Number(amountStr) <= 0) throw new PreflightError("payment.amount must be a USD₮0 amount above 0, up to 6 decimals.");
  const ctx = req.context ?? {};
  const spentStr = String(ctx.spentToday ?? "0");
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(spentStr)) throw new PreflightError("context.spentToday must be a USD₮0 amount.");
  const hours = intIn(ctx.payee?.hoursSinceSaved, 0, 1_000_000, "context.payee.hoursSinceSaved");
  const saved = !!ctx.payee?.saved;
  const seats = Array.isArray(ctx.approvals) ? ctx.approvals.map(Boolean) : Array.from({ length: 3 }, (_, i) => i < (intIn(ctx.approvals ?? 0, 0, 3, "context.approvals") ?? 0));
  const approvals = (seats[0] ? 1 : 0) | (seats[1] ? 2 : 0) | (seats[2] ? 4 : 0);
  const amount = quantise(parseUnits(amountStr, 6)), spent = quantise(parseUnits(spentStr, 6));
  const age = saved ? Math.min(255, hours ?? 255) : 0;

  const [block, line] = await Promise.all([client.getBlockNumber(), Promise.all(req.line.map(async (f, i) => {
    const id = intIn(f.fuseId, 1, 1_000_000, `line[${i}].fuseId`)!;
    const h = await head(id);
    if (!h.listed) throw new PreflightError(`Fuse ${id} (${h.name}) isn't listed, so wallets can't install it.`);
    const spec = SOCKETS[h.socket];
    if (!spec) throw new PreflightError(`Fuse ${id} uses socket ${h.socket}, which pre-flight doesn't know how to feed.`);
    const [fa, fb] = spec.fields;
    const a = intIn(f.a, 0, fa?.max ?? 255, `line[${i}].a (${fa?.label ?? "setting a"})`) ?? fa?.def ?? 0;
    const b = intIn(f.b, 0, fb?.max ?? 255, `line[${i}].b (${fb?.label ?? "setting b"})`) ?? fb?.def ?? 0;
    return { ...h, fuseId: id, a, b, index: String(i) };
  }))]);

  const fieldsFor = (f: (typeof line)[number]): Record<string, number> =>
    f.socket === 1 ? { amount, spent, cap: f.a }
    : f.socket === 2 ? { listed: saved ? 1 : 0, age, cooldown: f.a, amount, trial: f.b }
    : f.socket === 3 ? { set: 0, clear: 0, attempt: 1, suspect: saved ? 0 : 1 }
    : { approvals, amount, threshold: f.a };

  const state: Record<string, Hex> = {};
  const results = await Promise.all(line.map(async (f) => {
    const inputs = pack(f.socket, fieldsFor(f));
    try {
      if (f.nState > 0) {
        const prev = ctx.state?.[f.index];
        const st = prev && /^0x[0-9a-fA-F]*$/.test(prev) ? prev : toHex(new Uint8Array(Math.ceil(f.nState / 8)));
        const [next, o] = await client.readContract({ address: f.processor, abi: tapeoutProcessorAbi, functionName: "step", args: [f.circuitId, st, inputs] });
        state[f.index] = next;
        // blown after this decision = a clean payment (a saved payee) would now be refused
        const [, clean] = await client.readContract({ address: f.processor, abi: tapeoutProcessorAbi, functionName: "step", args: [f.circuitId, next, pack(f.socket, { set: 0, clear: 0, attempt: 1, suspect: 0 })] });
        return { verdict: (okOut(o) ? "pass" : "blew") as PreflightVerdict, blownAfter: !okOut(clean) };
      }
      const o = await client.readContract({ address: f.processor, abi: tapeoutProcessorAbi, functionName: "eval", args: [f.circuitId, inputs] });
      return { verdict: (okOut(o) ? "pass" : "blew") as PreflightVerdict };
    } catch { return { verdict: "error" as PreflightVerdict }; }
  }));

  const amt = Number(amountStr), spentN = Number(spentStr), signed = seats.filter(Boolean).length;
  const fuses = line.map((f, i) => {
    const r = results[i], pass = r.verdict === "pass";
    let why: string;
    if (r.verdict === "error") why = "TapeOut's processor didn't answer, so treat it as a no";
    else if (f.socket === 1) why = pass ? `${amt} USD₮0 fits today's ${f.a} USD₮0 cap (${spentN} spent)` : `${amt} USD₮0 would take today's spend past the ${f.a} USD₮0 cap (${spentN} spent)`;
    else if (f.socket === 2) why = !saved ? (pass ? "the payee isn't saved, but this design allows it" : "the payee isn't in the payee book") : pass ? (age >= f.a ? "a saved payee, past its cooling-off" : `saved ${age} h ago; within the ${f.b} USD₮0 trial`) : `saved ${age} h ago, still cooling off (${f.a} h); over the ${f.b} USD₮0 trial`;
    else if (f.socket === 3) why = !pass ? (saved ? "already blown; nothing pays until it's reset" : "a payment to a stranger trips it") : r.blownAfter ? "this one passes, but it leaves the breaker blown" : "not tripped";
    else why = pass ? (amt > f.a ? `over ${f.a} USD₮0 and signed by ${signed} of 3` : `under the ${f.a} USD₮0 approval threshold`) : `over ${f.a} USD₮0: needs two of three approvers, has ${signed}`;
    if (f.name !== SOCKETS[f.socket]?.name && r.verdict !== "error") why = pass ? "holds under its own rule" : "refused under its own rule";
    return { fuseId: f.fuseId, name: f.name, socket: f.socket, circuitId: Number(f.circuitId), processor: f.processor, settings: { a: f.a, b: f.b }, verdict: r.verdict, why, ...(r.blownAfter !== undefined ? { blownAfter: r.blownAfter } : {}) };
  });
  const allowed = fuses.every((f) => f.verdict === "pass");
  const no = fuses.filter((f) => f.verdict !== "pass");
  return { allowed, block: Number(block), fuses, state, summary: allowed ? `Every circuit holds: ${amt} USD₮0 can go.` : `Stopped by ${no.map((f) => `${f.name} (${f.why})`).join("; ")}. Don't sign it.` };
}
