/** The check API's fuse reasons (lib/atlas.ts checkPayment), in Chinese. Unknown text comes back as it was. */
const unit = (s: string) => s.replace(/(\d)\s*h\b/g, "$1 小时").replace(/(\d)\s*min\b/g, "$1 分钟").replace(/(\d)\s*d\b/g, "$1 天").replace(/(\d)\s*s\b/g, "$1 秒");
const RULES: [RegExp, string][] = [
  [/^The circuit call failed, so the fuse fails closed\.$/, "电路调用失败，保险丝按安全原则拒绝。"],
  [/^TapeOut's processor code changed and isn't attested, so the fuse fails closed\.$/, "TapeOut 处理器代码已变更且未经确认，保险丝按安全原则拒绝。"],
  [/^Within today's cap: (.+) of (.+) USD₮0 left\.$/, "在今日限额内：剩余 $1 / $2 USD₮0。"],
  [/^(.+) USD₮0 would pass today's (.+) USD₮0 cap \((.+) spent\)\.$/, "$1 USD₮0 会超过今日 $2 USD₮0 的限额（已花费 $3）。"],
  [/^A saved payee, past its cooling-off\.$/, "已保存的收款方，冷静期已过。"],
  [/^Saved (.+) h ago and still cooling off, but (.+) USD₮0 is within the (.+) USD₮0 trial\.$/, "$1 小时前保存，仍在冷静期，但 $2 USD₮0 在 $3 USD₮0 的试付额度内。"],
  [/^Not a saved payee\.$/, "不是已保存的收款方。"],
  [/^Saved (.+) h ago: still cooling off \((.+) h\), and (.+) USD₮0 is over the (.+) USD₮0 trial\.$/, "$1 小时前保存：仍在冷静期（$2 小时），且 $3 USD₮0 超过 $4 USD₮0 的试付额度。"],
  [/^Already blown\. Nothing pays until the owner resets it\.$/, "已经熔断。所有者复位之前，任何付款都不会执行。"],
  [/^Not tripped\.$/, "未触发。"],
  [/^A payment to a stranger trips it, and it stays blown until the owner resets it\.$/, "向陌生地址付款会让它熔断，并一直保持熔断，直到所有者复位。"],
  [/^Over (.+) USD₮0 and approved by (.+) of 3\.$/, "超过 $1 USD₮0，已获 3 位审批人中 $2 位批准。"],
  [/^Under the (.+) USD₮0 approval threshold\.$/, "低于 $1 USD₮0 的审批阈值。"],
  [/^Over (.+) USD₮0: needs two of three approvers, has (.+)\.$/, "超过 $1 USD₮0：需要三位审批人中的两位批准，目前只有 $2 位。"],
  [/^Not a repeat: no payment of (.+) USD₮0 to this payee in the last (.+) h \(or the owner cleared it\)\.$/, "不是重复付款：过去 $2 小时内没有向该收款方付过 $1 USD₮0（或所有者已放行）。"],
  [/^(.+) USD₮0 to this payee already went out (.+) ago, inside the (.+) h window: the same payment twice is paid once\. The owner can clear one real repeat\.$/, "$2前已向该收款方付过 $1 USD₮0，仍在 $3 小时的窗口内：同一笔付款只付一次。所有者可以放行一次真实的重复付款。"],
];
export function whyZh(why: string): string {
  for (const [re, zh] of RULES) if (re.test(why)) return unit(why.replace(re, zh));
  return why;
}
