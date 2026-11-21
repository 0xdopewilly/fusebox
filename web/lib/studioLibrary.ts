/**
 * Ready-made rules for Fuse Studio: common agent-payment policies, each a normal Studio rule. Loading one fills
 * the editor; from there it is compiled, proved on every input and taped out like any rule built by hand.
 */
import type { Rule } from "./studio";

export interface Template {
  id: string;
  /** short name, also the default listing name */
  name: string;
  /** who reaches for it, in plain words */
  when: string;
  rule: Rule;
}

const all = { m: "all", k: 0 } as const, any = { m: "any", k: 0 } as const;

export const LIBRARY: Template[] = [
  // ---- socket 1: Daily Cap (amount, spent today, cap)
  { id: "daily-budget", name: "Daily budget", when: "An agent with a daily allowance. Once today's spending reaches the cap, it waits for tomorrow.",
    rule: { socket: 1, groups: [[{ kind: "total", k: 0 }]], strikes: 1 } },
  { id: "budget-ceiling", name: "Budget with a ceiling", when: "A daily budget, and no single payment above 100 USD₮0 even if someone raises the cap.",
    rule: { socket: 1, groups: [[{ kind: "total", k: 0 }, { kind: "fixed", k: 100 }]], strikes: 1, ops: [all], join: "any" } },
  { id: "no-big-tickets", name: "Spread it out", when: "One payment can't eat more than half of the day's budget, so a single bad call can't empty it.",
    rule: { socket: 1, groups: [[{ kind: "total", k: 0 }, { kind: "half", k: 0 }]], strikes: 1, ops: [all], join: "any" } },

  // ---- socket 2: Payee Guard (saved payee, hours since saved, cooling-off, amount, trial amount)
  { id: "payee-book-trial", name: "Payee book with a trial", when: "Saved payees only. A payee saved today can get a small test payment, not the full invoice.",
    rule: { socket: 2, groups: [[{ kind: "listed", k: 0 }], [{ kind: "cooled", k: 0 }, { kind: "trial", k: 0 }]], strikes: 1, ops: [all, any], join: "all" } },
  { id: "strict-payees", name: "Strict payee book", when: "Nothing goes to a payee until its cooling-off is over. No test payments.",
    rule: { socket: 2, groups: [[{ kind: "listed", k: 0 }, { kind: "cooled", k: 0 }]], strikes: 1, ops: [all], join: "any" } },
  { id: "small-new-big-old", name: "Trust grows with time", when: "Small payments to any saved payee; anything over 10 USD₮0 only to payees saved at least a week ago.",
    rule: { socket: 2, groups: [[{ kind: "listed", k: 0 }], [{ kind: "fixed", k: 10 }, { kind: "age", k: 168 }]], strikes: 1, ops: [all, any], join: "all" } },

  // ---- socket 3: Breaker (sequential)
  { id: "zero-tolerance", name: "Zero tolerance", when: "The first payment to a stranger blows the breaker. Everything stops until you reset it.",
    rule: { socket: 3, groups: [], strikes: 1 } },
  { id: "one-typo", name: "One mistake allowed", when: "A first payment to a stranger is refused and counted. A second one blows the breaker.",
    rule: { socket: 3, groups: [], strikes: 2 } },

  // ---- socket 4: Two of Three (approvals, amount, threshold)
  { id: "two-of-three", name: "Two of three sign big ones", when: "Payments up to the threshold go through; above it, two of three approvers sign that exact payment.",
    rule: { socket: 4, groups: [[{ kind: "small", k: 0 }], [{ kind: "kof3", k: 2 }]], strikes: 1, ops: [all, all], join: "any" } },
  { id: "lead-approver", name: "Lead approver", when: "Above the threshold, the lead approver (seat 1) and one other must sign.",
    rule: { socket: 4, groups: [[{ kind: "small", k: 0 }], [{ kind: "seat", k: 1 }, { kind: "kof3", k: 2 }]], strikes: 1, ops: [all, all], join: "any" } },
  { id: "approvals-ceiling", name: "Approvals with a ceiling", when: "Two of three sign above the threshold, and nothing over 200 USD₮0 goes out, signed or not.",
    rule: { socket: 4, groups: [[{ kind: "small", k: 0 }, { kind: "kof3", k: 2 }], [{ kind: "fixed", k: 200 }]], strikes: 1, ops: [any, all], join: "all" } },

  // ---- socket 5: Repeat Guard (repeat inside the window, owner cleared it)
  { id: "no-double-pay", name: "No double payments", when: "The same payment (payee and amount) twice inside the window is stopped, unless you clear it once.",
    rule: { socket: 5, groups: [[{ kind: "fresh", k: 0 }, { kind: "cleared", k: 0 }]], strikes: 1, ops: [any], join: "any" } },
  { id: "never-repeat", name: "Never twice", when: "A repeat inside the window is always stopped. No override, not even by you.",
    rule: { socket: 5, groups: [[{ kind: "fresh", k: 0 }]], strikes: 1 } },
];
