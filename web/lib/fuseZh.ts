/** 简体中文 for the fuse copy that lives in lib/fuses (FUSE_META.say and the spec chips). Fuse names stay in English. */
export const SAY_ZH: Record<string, string> = {
  "daily-cap": "无论智能体被怎么要求，一个 UTC 日内的付款都不会超过所有者设定的上限。",
  "payee-guard": "只付给已保存的收款方。新收款方在 24 小时冷静期结束前，只能收到一小笔试付金额。",
  breaker: "一遇到付给陌生地址的付款就跳闸，并保持熔断，直到所有者重置。",
  "approval-2of3": "超过阈值时，三位审批人中必须有两位为这笔付款本身签名。",
  "repeat-guard": "同一张发票发两次，只付一次。确属重复的付款，所有者可以放行。",
};
export const chipZh = (c: string) => c.replace(/^(\d+) inputs$/, "$1 个输入").replace(" / check", " / 次检查").replace("LATCH", "锁存器").replace("Stateless", "无状态").replace("Remembers", "有记忆");
