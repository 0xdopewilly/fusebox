import type { Address } from "viem";

/**
 * What an owner sets on each socket, mirroring contracts/src/libraries/Sockets.sol. Parameters are 8-bit:
 * amounts count in steps of the install's `unit` (1 USD₮0 by default) up to 254, hours up to 255.
 */
export interface ParamField { k: "a" | "b"; label: string; suffix: string; max: number; def: number; money: boolean }
export interface SocketSpec { socket: number; key: string; name: string; fields: ParamField[]; say: string; pins: [string, number, string][] }

export const SOCKETS: Record<number, SocketSpec> = {
  1: { socket: 1, key: "daily-cap", name: "Daily Cap", say: "No more than the cap in a UTC day, however the agent is asked.",
    fields: [{ k: "a", label: "Cap per UTC day", suffix: "USD₮0", max: 254, def: 50, money: true }],
    pins: [["amount", 8, "this payment in units, rounded up (255 for another token)"], ["spent", 8, "spent today through this slot, in units"], ["cap", 8, "the owner's daily cap in units (0 to 254)"]] },
  2: { socket: 2, key: "payee-guard", name: "Payee Guard", say: "Saved payees only; a newly saved payee gets a trial amount until its cooling-off ends.",
    fields: [{ k: "a", label: "Cooling-off", suffix: "hours", max: 255, def: 24, money: false }, { k: "b", label: "Trial amount", suffix: "USD₮0", max: 254, def: 2, money: true }],
    pins: [["listed", 1, "the payee is in the owner's payee book"], ["age", 8, "hours since the payee was saved (0 if not)"], ["cooldown", 8, "the install's cooling-off, in hours"], ["amount", 8, "this payment in units (255 for another token)"], ["trial", 8, "largest payment to a payee still cooling off"]] },
  3: { socket: 3, key: "breaker", name: "Breaker", say: "Trips on a payment to a stranger and stays blown until the owner resets it.", fields: [],
    pins: [["set", 1, "owner or agent freeze (control beats)"], ["clear", 1, "owner reset (control beats)"], ["attempt", 1, "1 on every payment decision"], ["suspect", 1, "the payee isn't in the payee book"]] },
  4: { socket: 4, key: "approval-2of3", name: "Two of Three", say: "Above a threshold, two of three approvers must sign that exact payment.",
    fields: [{ k: "a", label: "Approvals above", suffix: "USD₮0", max: 254, def: 20, money: true }],
    pins: [["approvals", 3, "bit k: seat k approved this exact payment in time"], ["amount", 8, "this payment in units (255 for another token)"], ["threshold", 8, "payments up to this need no approval"]] },
  5: { socket: 5, key: "repeat-guard", name: "Repeat Guard", say: "The same payment (payee and amount) twice inside the window is stopped, unless the owner clears it once.",
    fields: [{ k: "a", label: "Window", suffix: "hours", max: 254, def: 24, money: false }],
    pins: [["repeat", 1, "this exact payment (token, payee, amount) already went out inside the window"], ["cleared", 1, "the owner cleared one repeat of it, not yet used or expired"]] },
};
export const socketOf = (key: string) => Object.values(SOCKETS).find((s) => s.key === key);

/** The socket's settings, relabelled by the fuse's metadata; with labels, an unlabelled setting is hidden (unused). */
export function fieldsFor(socket: number, labels?: { a?: string; b?: string }): ParamField[] {
  const base = SOCKETS[socket]?.fields ?? [];
  if (!labels) return base;
  return base.filter((f) => labels[f.k]).map((f) => ({ ...f, label: labels[f.k]! }));
}

export const USDT_UNIT = 1_000_000n;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** Whole steps only, within the socket's range; anything else is a message for the owner. */
export function readField(f: ParamField, v: string): { n: number } | { error: string } {
  const t = v.trim();
  if (!/^\d+$/.test(t)) return { error: `${f.label}: a whole number of ${f.suffix}` };
  const n = Number(t);
  if (n > f.max) return { error: `${f.label}: at most ${f.max} ${f.suffix}` };
  return { n };
}

/** Params for addFuse / setFuseParams. Editing keeps the install's token and unit (changing them resets the cap's count). */
export function toParams(socket: number, vals: { a?: number; b?: number }, token: Address, unit: bigint = USDT_UNIT) {
  if (socket === 3) return { token: ZERO, unit: 0n, a: 0, b: 0 };
  if (socket === 5) return { token: ZERO, unit: 0n, a: vals.a ?? 0, b: 0 }; // a window in hours, nothing else
  return { token, unit, a: vals.a ?? 0, b: socket === 2 ? vals.b ?? 0 : 0 };
}

/** One line describing an install's settings, in the owner's terms (the designer's labels when the fuse has them). */
export function describe(socket: number, a: number, b: number, unit = "1", labels?: { a?: string; b?: string }): string {
  const amt = (n: number) => `${+(n * Number(unit)).toFixed(6)} USD₮0`;
  if (labels) return fieldsFor(socket, labels).map((f) => `${f.label} ${f.money ? amt(f.k === "a" ? a : b) : `${f.k === "a" ? a : b} ${f.suffix}`}`).join(" · ") || "No settings";
  if (socket === 1) return `${amt(a)} a UTC day`;
  if (socket === 2) return `${a} h cooling-off · ${amt(b)} trial`;
  if (socket === 3) return "Trips on strangers";
  if (socket === 4) return `Approvals above ${amt(a)}`;
  if (socket === 5) return `Same payment once per ${a} h`;
  return "";
}
