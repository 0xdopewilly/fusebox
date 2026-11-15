import type { Address } from "viem";

/**
 * What an owner sets on each socket, mirroring contracts/src/libraries/Sockets.sol. Parameters are 8-bit:
 * amounts count in steps of the install's `unit` (1 USDT0 by default) up to 254, hours up to 255.
 */
export interface ParamField { k: "a" | "b"; label: string; suffix: string; max: number; def: number; money: boolean }
export interface SocketSpec { socket: number; key: string; name: string; fields: ParamField[]; say: string }

export const SOCKETS: Record<number, SocketSpec> = {
  1: { socket: 1, key: "daily-cap", name: "Daily Cap", say: "No more than the cap in a UTC day, however the agent is asked.",
    fields: [{ k: "a", label: "Cap per UTC day", suffix: "USDT0", max: 254, def: 50, money: true }] },
  2: { socket: 2, key: "payee-guard", name: "Payee Guard", say: "Saved payees only; a newly saved payee gets a trial amount until its cooling-off ends.",
    fields: [{ k: "a", label: "Cooling-off", suffix: "hours", max: 255, def: 24, money: false }, { k: "b", label: "Trial amount", suffix: "USDT0", max: 254, def: 2, money: true }] },
  3: { socket: 3, key: "breaker", name: "Breaker", say: "Trips on a payment to a stranger and stays blown until the owner resets it.", fields: [] },
  4: { socket: 4, key: "approval-2of3", name: "Two of Three", say: "Above a threshold, two of three approvers must sign that exact payment.",
    fields: [{ k: "a", label: "Approvals above", suffix: "USDT0", max: 254, def: 20, money: true }] },
};
export const socketOf = (key: string) => Object.values(SOCKETS).find((s) => s.key === key);

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
  return { token, unit, a: vals.a ?? 0, b: socket === 2 ? vals.b ?? 0 : 0 };
}

/** One line describing an install's settings, in the owner's terms. */
export function describe(socket: number, a: number, b: number, unit = "1"): string {
  const amt = (n: number) => `${+(n * Number(unit)).toFixed(6)} USDT0`;
  if (socket === 1) return `${amt(a)} a UTC day`;
  if (socket === 2) return `${a} h cooling-off · ${amt(b)} trial`;
  if (socket === 3) return "Trips on strangers";
  if (socket === 4) return `Approvals above ${amt(a)}`;
  return "";
}
