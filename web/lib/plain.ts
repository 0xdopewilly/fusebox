/** Plain words for newcomers: the glossary behind every tappable term, and helpers that turn on-chain shorthand into
 *  something a person reads at a glance. */

export interface Gloss { term: string; say: string; termZh: string; sayZh: string }

export const GLOSSARY = {
  fuse: { term: "Fuse", say: "A tiny logic circuit that checks one rule about a payment, like a daily limit or a known payee, and answers yes or no.", termZh: "保险丝", sayZh: "一个很小的逻辑电路，检查付款的一条规则（比如每日限额或已知收款方），回答“是”或“否”。" },
  line: { term: "Line", say: "The fuses a wallet runs, one after another. A payment goes through only if every fuse on the line says yes.", termZh: "线路", sayZh: "钱包依次运行的保险丝。只有线路上每个保险丝都说“是”，付款才会执行。" },
  tapeout: { term: "TapeOut", say: "An on-chain chip foundry on X Layer. Every fuse is a circuit made there, so anyone can check exactly what it does.", termZh: "TapeOut", sayZh: "X Layer 上的链上芯片代工厂。每个保险丝都是在那里制造的电路，任何人都能核实它到底做什么。" },
  atlas: { term: "Atlas", say: "Fusebox's live demo wallet on X Layer. An AI agent pays a supplier from it, through four fuses. Try to trick it: checks are free and nothing moves.", termZh: "Atlas", sayZh: "Fusebox 在 X Layer 上的实时演示钱包。一个 AI 智能体用它给供应商付款，要经过四个保险丝。试着骗它：检查免费，资金不会移动。" },
  usdt0: { term: "USD₮0", say: "The dollar stablecoin these wallets pay in: Tether's USD₮ on X Layer. 1 USD₮0 is about 1 US dollar.", termZh: "USD₮0", sayZh: "这些钱包用来付款的美元稳定币：X Layer 上的 Tether USD₮。1 USD₮0 约等于 1 美元。" },
  okb: { term: "OKB", say: "X Layer's own token. Each transaction you sign costs a tiny amount of it as gas, a fraction of a cent.", termZh: "OKB", sayZh: "X Layer 的原生代币。你签的每笔交易都要花一点点 OKB 作为 gas，不到一美分。" },
  fees: { term: "Fees", say: "Every payment check pays each fuse's designer a small fee, from a balance the owner prepays. When it runs out, the agent can't pay.", termZh: "费用", sayZh: "每次付款检查都会从所有者预付的余额中，向每个保险丝的设计者支付一笔小额费用。余额用完，智能体就无法付款。" },
  payee: { term: "Saved payee", say: "An address the owner approved. Payee Guard and the Breaker let saved payees through.", termZh: "已保存的收款方", sayZh: "所有者批准过的地址。Payee Guard 和 Breaker 会放行已保存的收款方。" },
  stranger: { term: "Stranger", say: "An address the owner never saved. A payment to one trips the Breaker.", termZh: "陌生地址", sayZh: "所有者从未保存过的地址。向它付款会触发 Breaker。" },
  agent: { term: "Agent key", say: "The address your AI agent signs with. It can only ask the wallet to pay, through every fuse. It can't change a fuse, a limit or a payee.", termZh: "智能体密钥", sayZh: "你的 AI 智能体用来签名的地址。它只能请求钱包付款，并且要经过每个保险丝。它不能修改保险丝、限额或收款方。" },
  approver: { term: "Approver", say: "One of three people who sign off big payments. Above the limit the owner sets, two of the three must approve that exact payment.", termZh: "审批人", sayZh: "三位审批大额付款的人之一。超过所有者设定的金额时，三人中必须有两人批准这笔具体付款。" },
  blown: { term: "Blown", say: "A fuse that tripped and stays tripped, like the Breaker after a stranger. Nothing pays until the owner resets it.", termZh: "已熔断", sayZh: "已触发并保持触发状态的保险丝，比如向陌生地址付款后的 Breaker。所有者重置之前，任何付款都不会执行。" },
  x402: { term: "x402", say: "A way for apps to charge per API call: the server answers 402 with a price, the agent pays, then asks again.", termZh: "x402", sayZh: "一种按 API 调用收费的方式：服务器返回 402 和价格，智能体付款后再次请求。" },
  "daily-cap": { term: "Daily Cap", say: "No more than the owner's limit in a day, however the agent is asked.", termZh: "Daily Cap", sayZh: "一天内的付款不超过所有者设定的限额，无论智能体被怎么要求。" },
  "payee-guard": { term: "Payee Guard", say: "Pays saved payees only. A newly saved payee gets a small trial amount until its waiting period ends.", termZh: "Payee Guard", sayZh: "只付给已保存的收款方。新保存的收款方在等待期结束前，只能收到一小笔试付金额。" },
  breaker: { term: "Breaker", say: "Trips on a payment to a stranger and stays tripped until the owner resets it.", termZh: "Breaker", sayZh: "向陌生地址付款时触发，并保持触发，直到所有者重置。" },
  "approval-2of3": { term: "Two of Three", say: "Above a limit, two of three approvers must sign that exact payment.", termZh: "Two of Three", sayZh: "超过限额时，三位审批人中必须有两位签署这笔具体付款。" },
} satisfies Record<string, Gloss>;
export type GlossKey = keyof typeof GLOSSARY;

/** The note an agent wrote, readable: x402 payments carry a nonce and a URL, shown as the API they paid for. */
export function readableMemo(memo: string, zh = false): string {
  const m = memo.match(/^x402\s+\S+\s+(\S+)/i);
  if (m) {
    try { const u = new URL(/^https?:/.test(m[1]) ? m[1] : `https://${m[1]}`); return `${zh ? "API 调用" : "API call"} · ${u.pathname.replace(/\/$/, "") || u.host}`; } catch { return zh ? "API 调用（x402）" : "API call (x402)"; }
  }
  if (/^x402\b/i.test(memo)) return zh ? "API 调用（x402）" : "API call (x402)";
  return memo;
}

/** "Fees for 16 more payments" from a fee balance and what one payment's checks cost. */
export function feeRunway(feeBalance: number, perPayment: number, zh = false): string {
  if (!(perPayment > 0)) return zh ? "无需费用" : "No fees due";
  const n = Math.floor(feeBalance / perPayment);
  if (zh) return n === 0 ? "费用已用完" : `费用还够 ${n.toLocaleString("en-US")} 笔付款`;
  return n === 0 ? "Fees used up" : `Fees for ${n.toLocaleString("en-US")} more payment${n === 1 ? "" : "s"}`;
}
