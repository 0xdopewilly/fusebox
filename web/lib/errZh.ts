/** Wallet, transaction and contract error lines (lib/txError, lib/walletLinks, lib/useTxQueue) in Chinese.
 *  Display-time only: `zh ? errZh(msg) : msg`. Unknown text comes back as it was. */
const EXACT: Record<string, string> = {
  "Your connected wallet isn't one of this wallet's approvers.": "你连接的钱包不是这个钱包的审批人。",
  "An agent can't approve payments, including its own.": "智能体不能审批付款，包括它自己的付款。",
  "Only the wallet's owner can do this.": "只有钱包所有者可以执行此操作。",
  "Only one of the wallet's agents can do this.": "只有这个钱包的智能体可以执行此操作。",
  "Only the owner, an agent or an approver can freeze this wallet.": "只有所有者、智能体或审批人可以冻结这个钱包。",
  "Your connected wallet doesn't own that circuit NFT.": "你连接的钱包并不持有那个电路 NFT。",
  "That circuit is already listed as a fuse.": "那个电路已经作为保险丝上架了。",
  "Fusebox doesn't accept circuits from that processor yet.": "Fusebox 暂不接受来自该处理器的电路。",
  "The circuit's inputs and outputs don't match a Fusebox socket.": "该电路的输入和输出与 Fusebox 插槽不匹配。",
  "The circuit's state bits don't match what the socket expects.": "该电路的状态位与插槽要求不符。",
  "The circuit has more gates than a fuse allows.": "该电路的门数超过了保险丝的上限。",
  "The circuit keeps more state than a fuse allows.": "该电路保存的状态超过了保险丝的上限。",
  "The wallet is paused. Its owner can resume it.": "钱包已暂停，所有者可以恢复它。",
  "Enter an amount above zero.": "请输入大于零的金额。",
  "One of the addresses is empty.": "有一个地址为空。",
  "The wallet's fee balance can't cover its fuses. Top it up first.": "钱包的费用余额不足以支付保险丝费用，请先充值。",
  "Each approver seat needs a different address.": "每个审批人席位需要不同的地址。",
  "This fuse's fee is above the most the wallet agreed to pay.": "这个保险丝的费用高于钱包同意支付的上限。",
  "That token isn't enabled on this wallet.": "这个钱包未启用该代币。",
  "That fuse has been delisted.": "那个保险丝已下架。",
  "The wallet already has the most fuses it can hold.": "钱包的保险丝数量已达上限。",
  "You declined it in your wallet.": "你在钱包中拒绝了此操作。",
  "Your wallet needs a little OKB on X Layer to pay for gas.": "你的钱包需要一点 X Layer 上的 OKB 来支付 gas。",
  "The transaction reverted on X Layer.": "交易在 X Layer 上被回滚。",
  "You declined the request in your wallet.": "你在钱包中拒绝了该请求。",
  "Your wallet already has a request open. Open the wallet, finish or cancel it, then try again.": "你的钱包里已有一个待处理的请求。请打开钱包完成或取消后再试。",
  "Your wallet is locked or hasn't approved this site yet. Unlock it and try again.": "你的钱包已锁定，或尚未授权本网站。请解锁后再试。",
  "Couldn't connect. Try again.": "连接失败，请重试。",
  "Failed": "失败",
  "Connect a wallet first.": "请先连接钱包。",
  "Your wallet is still on another network. Switch it to X Layer (chain 196) and try again.": "你的钱包仍在其他网络上。请切换到 X Layer（链 196）后再试。",
};
export function errZh(msg: string): string {
  if (EXACT[msg]) return EXACT[msg];
  const m = /^The contract refused it: (.*)$/.exec(msg);
  if (m) return `合约拒绝了此操作：${m[1]}`;
  return msg;
}
