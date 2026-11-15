import layers from "./fuse-layers.json";

export interface Gate { d: number; latch: boolean; ins: number[]; out: number }
export interface FuseLayout { key: string; title: string; nIn: number; gates: number; depth: number; layout: Gate[] }

/** Real netlists of the four Fusebox fuses (circuits/build/fuses.json, via circuits/scripts/layers.ts). */
export const LAYERS = layers as FuseLayout[];

export const FUSE_META: Record<string, { ix: string; name: string; say: string; chips: [string, string?][]; fee: string; gas: string }> = {
  "daily-cap": { ix: "01", name: "Daily Cap", say: "No more than the owner's cap in a UTC day, however the agent is asked.", chips: [["24 inputs"], ["108 NAND"], ["283k gas"], ["0.001 USDT0 / check", "l"], ["Stateless"]], fee: "0.001", gas: "283k" },
  "payee-guard": { ix: "02", name: "Payee Guard", say: "Saved payees only. A new payee gets a small trial amount until its 24-hour cooling-off ends.", chips: [["33 inputs"], ["79 NAND"], ["211k gas"], ["0.001 USDT0 / check", "l"], ["Stateless"]], fee: "0.001", gas: "211k" },
  breaker: { ix: "03", name: "Breaker", say: "Trips on a payment to a stranger and stays blown until the owner resets it.", chips: [["4 inputs"], ["10 NAND + 1 LATCH"], ["50k gas"], ["0.0005 USDT0 / check", "l"], ["Remembers"]], fee: "0.0005", gas: "50k" },
  "approval-2of3": { ix: "04", name: "Two of Three", say: "Above a threshold, two of three approvers must sign that exact payment.", chips: [["19 inputs"], ["46 NAND"], ["132k gas"], ["0.002 USDT0 / check", "l"], ["Stateless"]], fee: "0.002", gas: "132k" },
};
