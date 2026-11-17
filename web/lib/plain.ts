/** Plain words for newcomers: the glossary behind every tappable term, and helpers that turn on-chain shorthand into
 *  something a person reads at a glance. */

export interface Gloss { term: string; say: string }

export const GLOSSARY = {
  fuse: { term: "Fuse", say: "A tiny logic circuit that checks one rule about a payment, like a daily limit or a known payee, and answers yes or no." },
  line: { term: "Line", say: "The fuses a wallet runs, one after another. A payment goes through only if every fuse on the line says yes." },
  tapeout: { term: "TapeOut", say: "An on-chain chip foundry on X Layer. Every fuse is a circuit made there, so anyone can check exactly what it does." },
  atlas: { term: "Atlas", say: "Fusebox's live demo wallet on X Layer. An AI agent pays a supplier from it, through four fuses. Try to trick it: checks are free and nothing moves." },
  usdt0: { term: "USD₮0", say: "The dollar stablecoin these wallets pay in: Tether's USD₮ on X Layer. 1 USD₮0 is about 1 US dollar." },
  okb: { term: "OKB", say: "X Layer's own token. Each transaction you sign costs a tiny amount of it as gas, a fraction of a cent." },
  fees: { term: "Fees", say: "Every payment check pays each fuse's designer a small fee, from a balance the owner prepays. When it runs out, the agent can't pay." },
  payee: { term: "Saved payee", say: "An address the owner approved. Payee Guard and the Breaker let saved payees through." },
  stranger: { term: "Stranger", say: "An address the owner never saved. A payment to one trips the Breaker." },
  agent: { term: "Agent key", say: "The address your AI agent signs with. It can only ask the wallet to pay, through every fuse. It can't change a fuse, a limit or a payee." },
  approver: { term: "Approver", say: "One of three people who sign off big payments. Above the limit the owner sets, two of the three must approve that exact payment." },
  blown: { term: "Blown", say: "A fuse that tripped and stays tripped, like the Breaker after a stranger. Nothing pays until the owner resets it." },
  x402: { term: "x402", say: "A way for apps to charge per API call: the server answers 402 with a price, the agent pays, then asks again." },
  "daily-cap": { term: "Daily Cap", say: "No more than the owner's limit in a day, however the agent is asked." },
  "payee-guard": { term: "Payee Guard", say: "Pays saved payees only. A newly saved payee gets a small trial amount until its waiting period ends." },
  breaker: { term: "Breaker", say: "Trips on a payment to a stranger and stays tripped until the owner resets it." },
  "approval-2of3": { term: "Two of Three", say: "Above a limit, two of three approvers must sign that exact payment." },
} satisfies Record<string, Gloss>;
export type GlossKey = keyof typeof GLOSSARY;

/** The note an agent wrote, readable: x402 payments carry a nonce and a URL, shown as the API they paid for. */
export function readableMemo(memo: string): string {
  const m = memo.match(/^x402\s+\S+\s+(\S+)/i);
  if (m) {
    try { const u = new URL(/^https?:/.test(m[1]) ? m[1] : `https://${m[1]}`); return `API call · ${u.pathname.replace(/\/$/, "") || u.host}`; } catch { return "API call (x402)"; }
  }
  if (/^x402\b/i.test(memo)) return "API call (x402)";
  return memo;
}

/** "Fees for 16 more payments" from a fee balance and what one payment's checks cost. */
export function feeRunway(feeBalance: number, perPayment: number): string {
  if (!(perPayment > 0)) return "No fees due";
  const n = Math.floor(feeBalance / perPayment);
  return n === 0 ? "Fees used up" : `Fees for ${n.toLocaleString("en-US")} more payment${n === 1 ? "" : "s"}`;
}
