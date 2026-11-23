import Link from "next/link";
import type { Metadata } from "next";
import "./docs.css";
import SiteHeader from "@/components/site/SiteHeader";
import DocsNav from "@/components/docs/DocsNav";
import Code from "@/components/docs/Code";
import dep from "@/lib/deployments/mainnet.json";
import { GLOSSARY } from "@/lib/plain";
import { T } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Docs · Fusebox",
  description: "How Fusebox works: wallets for AI agents whose payments must pass logic circuits taped out on TapeOut. Quickstart, the five fuses, the wallet API, MCP tools, selling a fuse, and every contract on X Layer.",
  openGraph: { title: "Fusebox docs · Build with Fusebox", description: "Quickstart, the five fuses, the wallet API, MCP tools, selling a fuse, and every contract on X Layer.", url: "/docs" },
  twitter: { title: "Fusebox docs · Build with Fusebox", description: "Quickstart, the five fuses, the wallet API, MCP tools, selling a fuse, and every contract on X Layer." },
};

const OKLINK = "https://www.oklink.com/xlayer";
const START = { group: "Start", groupZh: "入门" };
const CONCEPTS = { group: "Concepts", groupZh: "概念" };
const BUILD = { group: "Build", groupZh: "开发" };
const REFERENCE = { group: "Reference", groupZh: "参考" };
const SECTIONS = [
  { id: "start", title: "New here? Start here", titleZh: "第一次来？从这里开始", ...START },
  { id: "overview", title: "What Fusebox is", titleZh: "Fusebox 是什么", ...START },
  { id: "quickstart", title: "Quickstart", titleZh: "快速上手", ...START },
  { id: "connect", title: "Connecting a wallet", titleZh: "连接钱包", ...START },
  { id: "needs", title: "Before you wire up", titleZh: "搭建前的准备", ...START },
  { id: "agent", title: "Connect your agent", titleZh: "接入你的智能体", ...START },
  { id: "first", title: "Your first payment", titleZh: "你的第一笔付款", ...START },
  { id: "assistant", title: "The Fusebox assistant", titleZh: "Fusebox 助手", ...START },
  { id: "payment", title: "How a payment works", titleZh: "一笔付款如何执行", ...CONCEPTS },
  { id: "fuses", title: "The five fuses", titleZh: "五个保险丝", ...CONCEPTS },
  { id: "fees", title: "Fees and budgets", titleZh: "费用与预算", ...CONCEPTS },
  { id: "business", title: "Who it's for and how it earns", titleZh: "面向谁，如何盈利", ...CONCEPTS },
  { id: "wallet", title: "The wallet API", titleZh: "钱包 API", ...BUILD },
  { id: "mcp", title: "MCP tools", titleZh: "MCP 工具", ...BUILD },
  { id: "sdk", title: "TypeScript SDK", titleZh: "TypeScript SDK", ...BUILD },
  { id: "x402", title: "Pay per call (x402)", titleZh: "按次付费（x402）", ...BUILD },
  { id: "frameworks", title: "Agent frameworks", titleZh: "智能体框架", ...BUILD },
  { id: "alerts", title: "Approver alerts", titleZh: "审批人提醒", ...BUILD },
  { id: "telegram", title: "Telegram alerts", titleZh: "Telegram 提醒", ...BUILD },
  { id: "tapesend", title: "On-chain alerts (TapeSend)", titleZh: "链上提醒（TapeSend）", ...BUILD },
  { id: "preflight", title: "Pre-flight for any wallet", titleZh: "任意钱包的预检", ...BUILD },
  { id: "guardrails", title: "Plain-English guardrails", titleZh: "用自然语言设定护栏", ...BUILD },
  { id: "designers", title: "Sell a fuse", titleZh: "出售保险丝", ...BUILD },
  { id: "contracts", title: "Contracts", titleZh: "合约", ...REFERENCE },
  { id: "security", title: "Security", titleZh: "安全", ...REFERENCE },
  { id: "glossary", title: "Glossary", titleZh: "术语表", ...REFERENCE },
  { id: "faq", title: "FAQ", titleZh: "常见问题", ...REFERENCE },
];
const A = ({ a, label }: { a: string; label?: string }) => <a className="addr" href={`${OKLINK}/address/${a}`} target="_blank" rel="noreferrer">{label ?? `${a.slice(0, 6)}…${a.slice(-4)}`} ↗</a>;
/** A section heading in both languages, taken from SECTIONS so the sidebar and the page always agree. */
const H2 = ({ id }: { id: string }) => {
  const s = SECTIONS.find((x) => x.id === id)!;
  return <h2><T en={s.title} zh={s.titleZh} /></h2>;
};

export default function DocsPage() {
  return (
    <>
      <SiteHeader active="docs" />
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <main className="docs wrap" id="main">
        <header className="docs-hero">
          <div className="m"><span className="lime"><T en="[Docs]" zh="[文档]" /></span> <span className="mute"><T en="Fusebox on X Layer · chain 196" zh="X Layer 上的 Fusebox · 链 ID 196" /></span></div>
          <h1 className="disp"><T en={<>Build with <span className="lime">[Fusebox]</span>.</>} zh={<>用 <span className="lime">[Fusebox]</span> 构建。</>} /></h1>
          <p><T en="Wallets for AI agents where every payment has to pass small logic circuits, taped out on TapeOut and checked on X Layer in the same call. Everything here is live on mainnet." zh="为 AI 智能体打造的钱包：每笔付款都必须通过几个小型逻辑电路。这些电路在 TapeOut 上流片，并在同一次调用中于 X Layer 上完成检查。本文介绍的一切都已在主网上线。" /></p>
        </header>
        <div className="docs-grid">
          <DocsNav sections={SECTIONS} />
          <article className="docs-body">

            <section id="start">
              <H2 id="start" />
              <p><T en={<><b>The problem:</b> AI agents now hold wallets and send real money. One convincing message, a fake invoice or new bank details, and an agent can pay a scammer.</>} zh={<><b>问题：</b>如今 AI 智能体已经持有钱包，转出的是真金白银。只要一条足够可信的消息，比如一张假发票或一份“新的银行账户信息”，智能体就可能把钱付给骗子。</>} /></p>
              <p><T en={<><b>What Fusebox does:</b> it gives the agent a wallet where every payment must pass a few small circuits called <b>fuses</b>: a daily limit, known payees only, two signers for big payments. They run on X Layer. If any fuse says no, nothing moves.</>} zh={<><b>Fusebox 做什么：</b>它给智能体一个钱包，每笔付款都必须通过几个叫作<b>保险丝</b>的小电路：每日限额、只付已知收款方、大额付款需两人签名。它们运行在 X Layer 上。只要有一个保险丝说“否”，资金就不会移动。</>} /></p>
              <p><T en={<><b>Who Atlas is:</b> Fusebox&apos;s live demo wallet on X Layer mainnet. An AI agent pays a cotton supplier from it, through four fuses. It holds real USD₮0 and every payment it has tried is on-chain. Anyone can try to trick it.</>} zh={<><b>Atlas 是谁：</b>Fusebox 在 X Layer 主网上的实时演示钱包。一个 AI 智能体用它向一家棉花供应商付款，要经过四个保险丝。它持有真实的 USD₮0，尝试过的每笔付款都记录在链上。任何人都可以试着骗它。</>} /></p>
              <h3><T en="What to do first" zh="先做什么" /></h3>
              <T
                en={
                  <ol className="dsteps">
                    <li><b>Try to scam Atlas.</b> Open <Link href="/app/try">Try to scam it</Link>, pick a trick and run it. Atlas&apos;s fuses answer in a few seconds. Free, no wallet needed, nothing moves.</li>
                    <li><b>See why.</b> Each fuse explains its yes or no. <Link href="/app/rob">Rob the agent</Link> lets an AI agent read your scam first, and the <Link href="/app/simulate">line simulator</Link> tests any set of fuses on a list of payments.</li>
                    <li><b>Wire up your own.</b> <Link href="/app/new">Wire up a wallet</Link> starts with a checklist of what you need, makes your agent&apos;s key for you if you don&apos;t have one, and takes you through it one step at a time.</li>
                    <li><b>Use it.</b> Hand the wallet to your agent (Claude, Cursor or your own code) with the setup Fusebox gives you, or pay by chatting with the <a href="#assistant">Fusebox assistant</a>.</li>
                  </ol>
                }
                zh={
                  <ol className="dsteps">
                    <li><b>试着骗 Atlas。</b>打开<Link href="/app/try">试着骗它</Link>，挑一个骗术并运行。Atlas 的保险丝几秒内就会给出答复。免费、无需钱包，资金不会移动。</li>
                    <li><b>看懂原因。</b>每个保险丝都会解释它为什么说“是”或“否”。<Link href="/app/rob">打劫智能体</Link>会让一个 AI 智能体先读一遍你的骗局；<Link href="/app/simulate">线路模拟器</Link>则可以用一组付款测试任意保险丝组合。</li>
                    <li><b>搭建你自己的钱包。</b><Link href="/app/new">搭建一个钱包</Link>会先给你一份准备清单；如果你还没有智能体密钥，它会帮你生成一个，然后一步一步带你完成。</li>
                    <li><b>用起来。</b>用 Fusebox 给你的配置把钱包交给你的智能体（Claude、Cursor 或你自己的代码），或者直接和 <a href="#assistant">Fusebox 助手</a>聊天付款。</li>
                  </ol>
                }
              />
              <h3><T en="On a phone" zh="在手机上" /></h3>
              <p><T en={<>The app is laid out like a phone app: the dock at the bottom moves between Start, Try, Build and Market, and its last key opens your account and every other page. The <b>i</b> button in the top bar explains the screen you&apos;re on, and any word with a dotted underline explains itself when you tap it. Every term is also in the <a href="#glossary">glossary</a>.</>} zh={<>应用按手机 App 的方式布局：底部的 Dock 栏可在“开始”“试一试”“设计”和“市场”之间切换，最后一个按键打开你的账户和其他所有页面。顶栏的 <b>i</b> 按钮会解释当前所在的页面；任何带虚线下划线的词，点一下就会显示解释。所有术语也都收录在<a href="#glossary">术语表</a>中。</>} /></p>
            </section>

            <section id="overview">
              <H2 id="overview" />
              <p><T en={<>An AI agent that can pay is useful and dangerous: it can be talked into paying a scammer. Fusebox gives the agent a wallet whose key can only do one thing, ask the wallet to pay, and the wallet only pays if every <b>fuse</b> on its line says yes.</>} zh={<>能付款的 AI 智能体很有用，也很危险：它可能被人说动，把钱付给骗子。Fusebox 给智能体一个钱包，智能体的密钥只能做一件事：请求钱包付款；而只有线路上每个<b>保险丝</b>都说“是”，钱包才会付款。</>} /></p>
              <p><T en={<>A fuse is a real NAND circuit taped out on TapeOut. The wallet derives the circuit&apos;s input bits from its own on-chain state (is this payee saved? how much was spent today? did two approvers sign?), calls the TapeOut processor, and reads one output bit. One no stops the payment. Every fuse that decided is paid a small fee, and the fee goes to whoever owns the circuit&apos;s NFT.</>} zh={<>保险丝是在 TapeOut 上流片的真实 NAND 电路。钱包根据自己的链上状态推导出电路的输入位（这个收款方已保存吗？今天已经花了多少？是否有两位审批人签名？），调用 TapeOut 处理器，读取一个输出位。只要有一个“否”，付款就会被拦截。每个参与决策的保险丝都会收到一笔小额费用，归电路 NFT 的持有者所有。</>} /></p>
              <T
                en={
                  <div className="cards3">
                    <div><b>Agent</b><span>Holds a key that can only call <code>pay</code> and <code>freeze</code>. It names the payee, amount and memo, nothing else.</span></div>
                    <div><b>Fuses</b><span>Circuits on TapeOut&apos;s OrderGuard processor. The memo never reaches them; they see bits the wallet builds.</span></div>
                    <div><b>Owner</b><span>Picks the fuses and their limits, saves payees, seats approvers, and is the only one who can reset or move funds.</span></div>
                  </div>
                }
                zh={
                  <div className="cards3">
                    <div><b>智能体</b><span>持有一把只能调用 <code>pay</code> 和 <code>freeze</code> 的密钥。它只能指定收款方、金额和备注，别的都做不了。</span></div>
                    <div><b>保险丝</b><span>运行在 TapeOut 的 OrderGuard 处理器上的电路。备注永远不会传给它们，它们只看到钱包构造的比特位。</span></div>
                    <div><b>所有者</b><span>选择保险丝及其限额、保存收款方、设置审批人，并且是唯一能重置或转移资金的人。</span></div>
                  </div>
                }
              />
            </section>

            <section id="quickstart">
              <H2 id="quickstart" />
              <h3><T en="1 · Try it, no wallet needed" zh="1 · 先试试，无需钱包" /></h3>
              <p><T en={<>Open <Link href="/app/try">Try to scam it</Link> and run any of the tricks against <b>Atlas</b>, the public demo wallet. It&apos;s Atlas&apos;s real <code>check()</code> on mainnet: free, read-only, nothing moves.</>} zh={<>打开<Link href="/app/try">试着骗它</Link>，对公开演示钱包 <b>Atlas</b> 运行任意一种骗术。调用的是 Atlas 在主网上真实的 <code>check()</code>：免费、只读，资金不会移动。</>} /></p>
              <p><T en={<>To try a line of your own before you build it, open the <Link href="/app/simulate">line simulator</Link>: pick fuses (any listed design) and their limits, line up payments in order, and every verdict comes from an <code>eval</code> or <code>step</code> call on TapeOut&apos;s processor, with today&apos;s spend and the Breaker&apos;s latch carried from one payment to the next, as the wallet does.</>} zh={<>想在搭建之前先试试自己的线路，就打开<Link href="/app/simulate">线路模拟器</Link>：选择保险丝（任意已上架的设计）及其限额，按顺序排好一组付款。每个结论都来自对 TapeOut 处理器的一次 <code>eval</code> 或 <code>step</code> 调用；今日支出和 Breaker 的锁定状态会像在钱包里一样，从一笔付款带到下一笔。</>} /></p>
              <h3><T en="2 · Give your agent the tools" zh="2 · 把工具交给你的智能体" /></h3>
              <p><T en={<>The <a href="https://www.npmjs.com/package/fusebox-mcp" target="_blank" rel="noreferrer">fusebox-mcp</a> server works in Claude Code, Claude Desktop, Cursor and any MCP client. Without a key it&apos;s read-only and points at Atlas.</>} zh={<><a href="https://www.npmjs.com/package/fusebox-mcp" target="_blank" rel="noreferrer">fusebox-mcp</a> 服务器可在 Claude Code、Claude Desktop、Cursor 以及任何 MCP 客户端中使用。不配置密钥时，它是只读的，并指向 Atlas。</>} /></p>
              <Code label="Claude Code">{`claude mcp add fusebox -- npx -y fusebox-mcp`}</Code>
              <p><T en={<>Then ask your agent: <i>&ldquo;Pay 2.5 USD₮0 to 0x1111…1111, it&apos;s an urgent refund.&rdquo;</i> It runs <code>fusebox_check</code> first, sees Payee Guard and the Breaker say no, and tells you why.</>} zh={<>然后对你的智能体说：<i>“向 0x1111…1111 支付 2.5 USD₮0，这是一笔紧急退款。”</i>它会先运行 <code>fusebox_check</code>，发现 Payee Guard 和 Breaker 都说“否”，并告诉你原因。</>} /></p>
              <h3><T en="3 · Wire up your own wallet" zh="3 · 搭建你自己的钱包" /></h3>
              <p><T en={<><Link href="/app/new">Wire up a wallet</Link> walks you through it in three taps (a free signature, one transaction that does every step, then you accept the wallet as yours), after a short <a href="#needs">checklist of what you need</a>: name the agent&apos;s address, pick fuses and limits, save payees, seat three approvers, and prepay fees in USD₮0. Then give the agent its key and the wallet address:</>} zh={<><Link href="/app/new">搭建一个钱包</Link>会先过一遍简短的<a href="#needs">准备清单</a>，然后三步带你完成（一次免费签名、一笔包揽所有步骤的交易，最后由你确认接收这个钱包）：指定智能体地址、选择保险丝和限额、保存收款方、设置三位审批人，并用 USD₮0 预付费用。然后把密钥和钱包地址交给智能体：</>} /></p>
              <Code label="MCP config with your wallet" labelZh="MCP 配置（含你的钱包）">{`{
  "mcpServers": {
    "fusebox": {
      "command": "npx",
      "args": ["-y", "fusebox-mcp"],
      "env": {
        "FUSEBOX_WALLET": "0xYourFuseboxWallet",
        "FUSEBOX_AGENT_KEY": "0xYourAgentPrivateKey"
      }
    }
  }
}`}</Code>
            </section>

            <section id="connect">
              <H2 id="connect" />
              <p><T en="Connecting is free and signs nothing; Fusebox only reads your address until you approve a transaction. Pick whichever fits:" zh="连接钱包免费，也不会签署任何内容；在你批准一笔交易之前，Fusebox 只读取你的地址。按你的情况选择：" /></p>
              <T
                en={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="Ways to connect"><table>
                    <thead><tr><th>You&apos;re on</th><th>How</th></tr></thead>
                    <tbody>
                      <tr><td><b>A computer with a wallet extension</b></td><td>Press <b>Connect</b> and pick it. OKX Wallet, MetaMask, Rabby and any wallet that injects into the page all work, including older ones that don&apos;t announce themselves.</td></tr>
                      <tr><td><b>A computer, no extension</b></td><td><b>Scan with OKX Wallet app</b> shows a QR code. Scan it with the OKX Wallet app on your phone and approve. Signing requests then arrive in the app.</td></tr>
                      <tr><td><b>A phone browser</b></td><td><b>Connect OKX Wallet app</b> hands off to the app; approve there and come back to the tab. Or reopen Fusebox <b>inside your wallet&apos;s own browser</b>: OKX Wallet, MetaMask, Trust Wallet or Bitget Wallet, one tap each.</td></tr>
                      <tr><td><b>A wallet&apos;s built-in browser</b></td><td>It connects straight away.</td></tr>
                    </tbody>
                  </table></div>
                }
                zh={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="连接方式"><table>
                    <thead><tr><th>你的设备</th><th>怎么连</th></tr></thead>
                    <tbody>
                      <tr><td><b>装有钱包插件的电脑</b></td><td>点击<b>连接钱包</b>并选择它。OKX Wallet、MetaMask、Rabby 以及任何向页面注入的钱包都能用，包括不会主动声明自身的旧版钱包。</td></tr>
                      <tr><td><b>未装插件的电脑</b></td><td><b>用 OKX Wallet App 扫码</b>会显示一个二维码。用手机上的 OKX Wallet App 扫码并批准，之后的签名请求都会发到 App 里。</td></tr>
                      <tr><td><b>手机浏览器</b></td><td><b>连接 OKX Wallet App</b> 会跳转到 App；在 App 里批准后回到这个标签页即可。也可以<b>在钱包自带的浏览器里</b>重新打开 Fusebox：OKX Wallet、MetaMask、Trust Wallet 或 Bitget Wallet，都是一键直达。</td></tr>
                      <tr><td><b>钱包内置浏览器</b></td><td>直接就能连接。</td></tr>
                    </tbody>
                  </table></div>
                }
              />
              <p><T en="Fusebox switches your wallet to X Layer (chain 196) and adds the network if the wallet doesn't have it yet. If something goes wrong:" zh="Fusebox 会把你的钱包切换到 X Layer（链 ID 196）；如果钱包里还没有这个网络，会自动添加。如果出了问题：" /></p>
              <T
                en={
                  <ul className="dlist">
                    <li><b>&ldquo;You declined the request&rdquo;</b>: you closed the wallet&apos;s prompt. Press Connect again.</li>
                    <li><b>&ldquo;Your wallet already has a request open&rdquo;</b>: open the wallet, finish or cancel the earlier prompt, then try again.</li>
                    <li><b>&ldquo;Still on another network&rdquo;</b>: switch the wallet to X Layer yourself, then retry.</li>
                    <li><b>Trust Wallet on iPhone</b> has no built-in browser any more, so use OKX Wallet or MetaMask there.</li>
                  </ul>
                }
                zh={
                  <ul className="dlist">
                    <li><b>“你在钱包中拒绝了该请求”</b>：你关闭了钱包的弹窗。再点一次“连接钱包”。</li>
                    <li><b>“你的钱包里已有一个待处理的请求”</b>：打开钱包，完成或取消之前的弹窗，然后重试。</li>
                    <li><b>“仍在其他网络上”</b>：手动把钱包切换到 X Layer，然后重试。</li>
                    <li><b>iPhone 上的 Trust Wallet</b> 已不再提供内置浏览器，请在 iPhone 上改用 OKX Wallet 或 MetaMask。</li>
                  </ul>
                }
              />
            </section>

            <section id="needs">
              <H2 id="needs" />
              <p><T en="Wiring up your own wallet takes about ten signatures. Have these ready; the first step of the wizard checks what it can for you, and nothing is signed until the last step." zh="搭建自己的钱包大约需要十次签名。请先准备好以下几样；向导的第一步会尽可能替你检查，在最后一步之前不会签署任何内容。" /></p>
              <T
                en={
                  <ol className="dsteps">
                    <li><b>A wallet on X Layer.</b> It becomes the owner: the only address that can change fuses, limits and payees. OKX Wallet works best.</li>
                    <li><b>An agent key.</b> The address your AI agent signs with. No agent yet? Wire up makes one in your browser: you see it once, copy or download it, and can keep it there for the assistant. It can only ask the wallet to pay, through every fuse.</li>
                    <li><b>USD₮0 on X Layer.</b> It prepays the fuses&apos; fees (0.0045 per payment with all four) and funds the agent&apos;s payments. Withdraw it to the X Layer network from an exchange, or bridge it from another chain.</li>
                    <li><b>A little OKB for gas.</b> Setting up is one transaction, plus one to accept the wallet; gas on X Layer costs a fraction of a cent. Your agent also needs gas to send its payments: Wire up sends it 0.0005 OKB by default, about 25 payments.</li>
                  </ol>
                }
                zh={
                  <ol className="dsteps">
                    <li><b>一个 X Layer 钱包。</b>它将成为所有者：唯一能修改保险丝、限额和收款方的地址。OKX Wallet 体验最佳。</li>
                    <li><b>一个智能体密钥。</b>即你的 AI 智能体用来签名的地址。还没有智能体？“搭建”会在你的浏览器里生成一个：它只显示一次，你可以复制或下载，也可以留在浏览器里供助手使用。它只能请求钱包付款，并且要经过每个保险丝。</li>
                    <li><b>X Layer 上的 USD₮0。</b>用于预付保险丝的费用（四个全开时每笔付款 0.0045），以及智能体的付款资金。可以从交易所提币到 X Layer 网络，或从其他链跨链转入。</li>
                    <li><b>少量 OKB 用作 gas。</b>搭建只需一笔交易，再加一笔确认接收钱包；X Layer 上的 gas 不到一美分。你的智能体发送付款也需要 gas：“搭建”默认给它转 0.0005 OKB，约够 25 笔付款。</li>
                  </ol>
                }
              />
              <p><T en={<>Not ready yet? <Link href="/app/simulate">Test a line first</Link>: the simulator needs no wallet.</>} zh={<>还没准备好？<Link href="/app/simulate">先测试一条线路</Link>：模拟器无需钱包。</>} /></p>
            </section>

            <section id="agent">
              <H2 id="agent" />
              <p><T en="When Wire up finishes, it hands you a ready setup with your wallet (and the agent key, if Fusebox made it) already filled in. Copy it, paste it, and your agent pays through your fuses." zh="“搭建”完成后，会给你一份现成的配置，钱包地址（以及 Fusebox 生成的智能体密钥，如有）都已填好。复制、粘贴，你的智能体就会通过你的保险丝付款。" /></p>
              <Code label="Claude Code">{`claude mcp add fusebox -e FUSEBOX_WALLET=0xYourWallet -e FUSEBOX_AGENT_KEY=0xYourAgentKey -- npx -y fusebox-mcp`}</Code>
              <p><T en={<>For <b>Claude Desktop</b> the same server goes in <code>claude_desktop_config.json</code> (Settings → Developer → Edit Config); for <b>Cursor</b>, in <code>~/.cursor/mcp.json</code>. In your own code, <code>new Fusebox({"{ wallet, account }"})</code> from the <a href="#sdk">SDK</a>. Then ask: <i>&ldquo;Pay my saved payee 0.01 USD₮0.&rdquo;</i> The agent checks the fuses first and tells you what they said.</>} zh={<>在 <b>Claude Desktop</b> 中，把同一个服务器写进 <code>claude_desktop_config.json</code>（Settings → Developer → Edit Config）；在 <b>Cursor</b> 中，写进 <code>~/.cursor/mcp.json</code>。在你自己的代码里，使用 <a href="#sdk">SDK</a> 的 <code>new Fusebox({"{ wallet, account }"})</code>。然后对它说：<i>“向我已保存的收款方支付 0.01 USD₮0。”</i>智能体会先检查保险丝，并告诉你它们的结论。</>} /></p>
            </section>

            <section id="first">
              <H2 id="first" />
              <p><T en={<>The <Link href="/app/first">first-payment guide</Link> opens right after Wire up. It checks three things (money in the wallet, gas for your agent, a saved payee) and fixes what&apos;s missing with one signature each. Then your agent pays the saved payee for real, signed in your browser with its key, and you see every fuse&apos;s answer and the transaction.</>} zh={<>“搭建”完成后会直接打开<Link href="/app/first">首笔付款引导</Link>。它检查三件事（钱包里有资金、智能体有 gas、有一个已保存的收款方），缺什么就补什么，每项只需一次签名。然后你的智能体会向已保存的收款方真实付款（在你的浏览器中用它的密钥签名），你会看到每个保险丝的答复以及这笔交易。</>} /></p>
              <p><T en="Last, it checks the same payment to a stranger, read-only, so you see your fuses stop it without tripping your Breaker. On a real payment to a stranger the Breaker would trip and stay tripped until you reset it." zh="最后，它会以只读方式检查同样一笔付给陌生地址的付款，让你看到保险丝如何拦下它，又不会触发你的 Breaker。如果真的向陌生地址付款，Breaker 会触发并保持触发状态，直到你重置。" /></p>
            </section>

            <section id="assistant">
              <H2 id="assistant" />
              <p><T en={<>Pay by chatting: open the <Link href="/app/assistant">assistant</Link> and say <i>&ldquo;pay Kano Cotton 2&rdquo;</i>. It lines the payment up, your wallet&apos;s fuses check it on X Layer, and you tap <b>Pay as your agent</b>. If a fuse would say no, there&apos;s nothing to sign; it shows you which fuse and why.</>} zh={<>聊天即可付款：打开<Link href="/app/assistant">助手</Link>，输入 <i>“pay Kano Cotton 2”</i>。它会把这笔付款准备好，由你钱包的保险丝在 X Layer 上检查，然后你点<b>以智能体身份付款</b>。如果某个保险丝会说“否”，就没有需要签名的内容；它会告诉你是哪个保险丝、为什么。</>} /></p>
              <T
                en={
                  <ul className="dlist">
                    <li>It only pays your saved payees, or an address you type in full. It never guesses an address, and a message claiming urgency or new bank details changes nothing.</li>
                    <li>Name your payees once (&ldquo;Kano Cotton&rdquo;); the names live in your browser.</li>
                    <li>It signs with your wallet&apos;s agent key, kept in your browser: Fusebox&apos;s servers never see it. Made the key elsewhere? Paste it once.</li>
                    <li>The model is Claude Haiku 5.5 on NEAR AI Cloud; when it&apos;s unavailable a simple reader understands &ldquo;pay &lt;name&gt; &lt;amount&gt;&rdquo;.</li>
                  </ul>
                }
                zh={
                  <ul className="dlist">
                    <li>它只付给你已保存的收款方，或你完整输入的地址。它从不猜测地址；声称“情况紧急”或“银行账户已更换”的消息也改变不了任何事。</li>
                    <li>给收款方起一次名字（如“Kano Cotton”）即可；名字只保存在你的浏览器里。</li>
                    <li>它用你钱包的智能体密钥签名，密钥保存在你的浏览器里：Fusebox 的服务器永远看不到它。密钥是在别处生成的？粘贴一次即可。</li>
                    <li>模型是 NEAR AI Cloud 上的 Claude Haiku 5.5；模型不可用时，一个简单的解析器能理解 “pay &lt;name&gt; &lt;amount&gt;” 这样的指令。</li>
                  </ul>
                }
              />
            </section>

            <section id="payment">
              <H2 id="payment" />
              <T
                en={
                  <ol className="dsteps">
                    <li><b>The agent asks.</b> <code>pay(token, to, amount, memo)</code>. The wallet checks the caller is an agent, the wallet isn&apos;t paused, the token is enabled, and today&apos;s decision budget isn&apos;t spent.</li>
                    <li><b>The wallet builds each fuse&apos;s inputs</b> from its own state: is the payee saved and how long ago, how much went out today, which approvers signed this exact payment.</li>
                    <li><b>Every fuse decides, in order, in the same call.</b> The wallet calls <code>eval</code> (or <code>step</code> for a fuse with memory) on the TapeOut processor, with a fixed 2M gas each.</li>
                    <li><b>One no stops the payment.</b> The decision is recorded either way, with every fuse&apos;s inputs and verdict, the fee and the memo. A blown Breaker stays blown until the owner resets it.</li>
                    <li><b>Designers are paid</b> from the wallet&apos;s prepaid fee balance, and only if every fuse held does the token move.</li>
                  </ol>
                }
                zh={
                  <ol className="dsteps">
                    <li><b>智能体发起请求。</b><code>pay(token, to, amount, memo)</code>。钱包检查调用者是智能体、钱包未暂停、该代币已启用，且今日的决策预算尚未用完。</li>
                    <li><b>钱包根据自身状态构造每个保险丝的输入</b>：收款方是否已保存、保存了多久，今天已经付出多少，哪些审批人为这笔付款本身签了名。</li>
                    <li><b>所有保险丝在同一次调用中依次决策。</b>钱包在 TapeOut 处理器上调用 <code>eval</code>（有记忆的保险丝则调用 <code>step</code>），每次固定 2M gas。</li>
                    <li><b>一个“否”就会拦截付款。</b>无论结果如何，决策都会被记录，包括每个保险丝的输入和结论、费用以及备注。已熔断的 Breaker 会保持熔断，直到所有者重置。</li>
                    <li><b>设计者从钱包预付的费用余额中获得报酬</b>；只有所有保险丝都通过，代币才会转出。</li>
                  </ol>
                }
              />
              <T
                en={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="Fuse statuses table"><table>
                    <thead><tr><th>Status</th><th>Meaning</th><th>Charged?</th></tr></thead>
                    <tbody>
                      <tr><td><span className="pill ok">PASS</span></td><td>The circuit output 1.</td><td>Yes</td></tr>
                      <tr><td><span className="pill no">BLEW</span></td><td>The circuit output 0: this fuse said no.</td><td>Yes: the no is the product</td></tr>
                      <tr><td><span className="pill">FAILED</span></td><td>The call reverted, ran out of gas or returned malformed data. Blocks.</td><td>No</td></tr>
                      <tr><td><span className="pill">UNTRUSTED</span></td><td>TapeOut&apos;s processor code changed and isn&apos;t attested yet. Blocks.</td><td>No</td></tr>
                    </tbody>
                  </table></div>
                }
                zh={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="保险丝状态表"><table>
                    <thead><tr><th>状态</th><th>含义</th><th>是否收费</th></tr></thead>
                    <tbody>
                      <tr><td><span className="pill ok">PASS</span></td><td>电路输出 1。</td><td>是</td></tr>
                      <tr><td><span className="pill no">BLEW</span></td><td>电路输出 0：该保险丝说“否”。</td><td>是：这个“否”正是产品价值所在</td></tr>
                      <tr><td><span className="pill">FAILED</span></td><td>调用回滚、gas 耗尽或返回了格式错误的数据。拦截。</td><td>否</td></tr>
                      <tr><td><span className="pill">UNTRUSTED</span></td><td>TapeOut 处理器的代码已变更，且尚未通过认证。拦截。</td><td>否</td></tr>
                    </tbody>
                  </table></div>
                }
              />
              <p><T en="Anything but PASS blocks: Fusebox fails closed." zh="除 PASS 以外一律拦截：Fusebox 出错即拦截（fail closed）。" /></p>
            </section>

            <section id="fuses">
              <H2 id="fuses" />
              <p><T en={<>A <b>socket</b> is the contract between the wallet and a circuit: the wallet derives the bits, the circuit decides. Bits are packed least-significant first (TAP-02 §5). Amounts are rounded up to the install&apos;s unit and saturate at 255, while owner limits stop at 254, so a saturated amount can never pass.</>} zh={<><b>插槽（socket）</b>是钱包与电路之间的约定：钱包推导出比特位，电路做出决策。比特位按最低有效位在前的顺序打包（TAP-02 §5）。金额按安装时设定的单位向上取整，并在 255 处饱和；而所有者设定的限额最高只到 254，因此饱和的金额永远无法通过。</>} /></p>
              <T
                en={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="The five fuses table"><table>
                    <thead><tr><th>Fuse</th><th>Circuit</th><th>Inputs</th><th>Says no when</th><th>Fee</th></tr></thead>
                    <tbody>
                      <tr><td><b>Daily Cap</b></td><td>#15 · 108 NAND</td><td>24: amount, spent today, cap</td><td>The payment would pass today&apos;s cap (UTC day)</td><td>0.001</td></tr>
                      <tr><td><b>Payee Guard</b></td><td>#16 · 79 NAND</td><td>33: saved?, age (h), cooldown, amount, trial</td><td>The payee isn&apos;t saved, or is new and over the trial amount</td><td>0.001</td></tr>
                      <tr><td><b>Breaker</b></td><td>#17 · 10 NAND + 1 LATCH</td><td>4: set, clear, attempt, suspect</td><td>A payment goes to a stranger: it latches and stays blown</td><td>0.0005</td></tr>
                      <tr><td><b>Two of Three</b></td><td>#18 · 46 NAND</td><td>19: three approver bits, amount, threshold</td><td>Over the threshold without two approvals for that exact payment</td><td>0.002</td></tr>
                      <tr><td><b>Repeat Guard</b> (v2)</td><td>#21 · 2 NAND</td><td>2: repeat, cleared</td><td>The same amount to the same payee already went out inside the owner&apos;s window (24 h by default), and the owner hasn&apos;t cleared one repeat</td><td>0.0005</td></tr>
                    </tbody>
                  </table></div>
                }
                zh={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="五个保险丝一览表"><table>
                    <thead><tr><th>保险丝</th><th>电路</th><th>输入</th><th>何时说“否”</th><th>费用</th></tr></thead>
                    <tbody>
                      <tr><td><b>Daily Cap</b></td><td>#15 · 108 NAND</td><td>24：金额、今日已支出、上限</td><td>这笔付款会超出今日上限（按 UTC 日计）</td><td>0.001</td></tr>
                      <tr><td><b>Payee Guard</b></td><td>#16 · 79 NAND</td><td>33：是否已保存、保存时长（小时）、冷静期、金额、试付额度</td><td>收款方未保存，或是新收款方且金额超过试付额度</td><td>0.001</td></tr>
                      <tr><td><b>Breaker</b></td><td>#17 · 10 NAND + 1 LATCH</td><td>4：置位、清除、尝试、可疑</td><td>有一笔付款流向陌生地址：锁定并保持熔断</td><td>0.0005</td></tr>
                      <tr><td><b>Two of Three</b></td><td>#18 · 46 NAND</td><td>19：三个审批人位、金额、阈值</td><td>超过阈值，且这笔付款本身没有获得两份审批</td><td>0.002</td></tr>
                      <tr><td><b>Repeat Guard</b>（v2）</td><td>#21 · 2 NAND</td><td>2：重复、已放行</td><td>在所有者设定的时间窗口内（默认 24 小时），同一金额已付给同一收款方，且所有者未放行这一次重复</td><td>0.0005</td></tr>
                    </tbody>
                  </table></div>
                }
              />
              <p className="small"><T en={<>Fees are in USD₮0 per check; a payment checked by the first four costs 0.0045, all five 0.005. Every netlist is on TapeOut&apos;s processor, and the <Link href="/app/market">fuse market</Link> checks each one against the hash the registry pinned at listing.</>} zh={<>费用以 USD₮0 计，按每次检查收取；经前四个保险丝检查的一笔付款花费 0.0045，五个全部检查则为 0.005。每份网表都存储在 TapeOut 的处理器上，<Link href="/app/market">保险丝市场</Link>会将每份网表与注册表在上架时锁定的哈希进行比对。</>} /></p>
            </section>

            <section id="fees">
              <H2 id="fees" />
              <T
                en={
                  <ul className="dots">
                    <li><b>Prepaid.</b> Fees come from the wallet&apos;s balance in the registry, not from the agent&apos;s spending money. If it can&apos;t cover the fuses, the payment reverts: no payment without paying the fuses.</li>
                    <li><b>90 / 10.</b> Each fee goes 90% to the fuse&apos;s designer (whoever holds the circuit NFT when they claim) and 10% to Fusebox. The contract caps Fusebox&apos;s share at 20%.</li>
                    <li><b>Blocked attempts pay too</b>, within limits: FAILED and UNTRUSTED fuses are never charged.</li>
                    <li><b>Daily budgets.</b> At most 100 recorded decisions and 20 recorded blocks per UTC day by default (<code>setDailyLimits</code>). Past them an attempt reverts and costs nothing, so a hijacked agent can&apos;t drain fees.</li>
                    <li><b>Price changes.</b> The wallet passes the highest fee the owner accepted; a designer&apos;s raise only applies once the owner accepts it.</li>
                  </ul>
                }
                zh={
                  <ul className="dots">
                    <li><b>预付。</b>费用从钱包在注册表中的余额扣除，而不是来自智能体的付款资金。如果余额不足以支付保险丝费用，付款会回滚：不付保险丝的钱，就付不了款。</li>
                    <li><b>90 / 10。</b>每笔费用 90% 归保险丝设计者（领取时持有电路 NFT 的人），10% 归 Fusebox。合约将 Fusebox 的分成上限设为 20%。</li>
                    <li><b>被拦截的尝试也要付费</b>，但有限度：处于 FAILED 和 UNTRUSTED 状态的保险丝从不收费。</li>
                    <li><b>每日预算。</b>默认每个 UTC 日最多记录 100 次决策和 20 次拦截（<code>setDailyLimits</code>）。超出后，尝试会直接回滚且不产生费用，因此被劫持的智能体无法耗光费用余额。</li>
                    <li><b>价格变动。</b>钱包传入所有者接受过的最高费用；设计者涨价只有在所有者接受后才生效。</li>
                  </ul>
                }
              />
            </section>

            <section id="business">
              <H2 id="business" />
              <T
                en={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="Who uses Fusebox table"><table>
                    <thead><tr><th>Who</th><th>Their problem</th><th>Pays or earns</th></tr></thead>
                    <tbody>
                      <tr><td><b>Builders who give an agent money</b></td><td>An agent with a funded key can be talked into paying a scammer, overspend, or pay an invoice twice. Fuses are limits it can&apos;t argue with.</td><td>Pays check fees and gas</td></tr>
                      <tr><td><b>Teams that let a bot spend</b></td><td>One leaked or confused key can drain the treasury. Approvers sign big payments from an inbox, and every attempt reaches phones and Telegram.</td><td>Pays check fees and gas</td></tr>
                      <tr><td><b>API sellers (x402)</b></td><td>They need proof a payment really happened and was meant for them. The <code>fusebox</code> scheme&apos;s on-chain Decision is that proof.</td><td>Pays nothing</td></tr>
                      <tr><td><b>Circuit designers</b></td><td>A taped-out circuit earns nothing unless an app calls it. Here every check pays, and the income follows the circuit NFT.</td><td>Earns 90% of each fee</td></tr>
                    </tbody>
                  </table></div>
                }
                zh={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="Fusebox 用户表"><table>
                    <thead><tr><th>用户</th><th>他们的问题</th><th>付费还是收益</th></tr></thead>
                    <tbody>
                      <tr><td><b>给智能体配了资金的开发者</b></td><td>持有已充值密钥的智能体，可能被说动付钱给骗子、超支，或把同一张发票付两次。保险丝是它无从争辩的硬性限制。</td><td>支付检查费用和 gas</td></tr>
                      <tr><td><b>让机器人花钱的团队</b></td><td>一把泄露或出错的密钥就可能掏空资金库。审批人在收件箱里签署大额付款，每次尝试都会推送到手机和 Telegram。</td><td>支付检查费用和 gas</td></tr>
                      <tr><td><b>API 卖方（x402）</b></td><td>他们需要证明一笔付款确实发生过，且确实是付给他们的。<code>fusebox</code> 方案的链上 Decision 就是这份证明。</td><td>无需付费</td></tr>
                      <tr><td><b>电路设计者</b></td><td>已流片的电路如果没有应用调用，就一分钱也赚不到。在这里，每次检查都付费，收益跟随电路 NFT 走。</td><td>获得每笔费用的 90%</td></tr>
                    </tbody>
                  </table></div>
                }
              />
              <T
                en={
                  <ul className="dots">
                    <li><b>Where the money comes from.</b> Every check pays its fuse&apos;s fee (0.0005 to 0.002 USD₮0; 0.005 for a payment checked by the five original fuses): 90% to the designer, 10% to Fusebox, capped at 20% by the contract. Today the Fusebox team holds all nine listed circuits, so it also collects the designer share until outside designers list fuses.</li>
                    <li><b>A worked example</b> (an assumption, not a measurement): an agent making 20 payments a day through the five original fuses pays 3.00 USD₮0 a month in checks, 2.70 to designers and 0.30 to Fusebox. A thousand such agents: 3,000 a month, 300 of it to Fusebox. Gas is about 0.00002 OKB a payment.</li>
                    <li><b>How people find it.</b> <code>fusebox-sdk</code>, <code>fusebox-mcp</code> (also in the official MCP Registry) and <code>fusebox-tools</code> on npm, no-wallet demos (<Link href="/app/try">Try to scam it</Link>, <Link href="/app/rob">Rob the agent</Link>), x402 sellers on the <code>fusebox</code> scheme, Fuse Studio and the market for TapeOut designers, OKX Wallet on X Layer, Telegram alerts anyone can follow, and the <a href="https://15-2-272.tapekit.org/" target="_blank" rel="noreferrer">DeWEB edition</a> on TapeKit.</li>
                    <li><b>Why people keep paying.</b> The money, payees, approvers and limits live in the wallet, and every payment goes through the fuses. The Breaker and the Repeat Guard remember past payments, so they get more useful with history. Fees are prepaid and capped per day, and a designer can&apos;t raise them without the owner&apos;s say.</li>
                  </ul>
                }
                zh={
                  <ul className="dots">
                    <li><b>收入从哪里来。</b>每次检查都要支付对应保险丝的费用（0.0005 到 0.002 USD₮0；经五个原始保险丝检查的一笔付款为 0.005）：90% 归设计者，10% 归 Fusebox，合约将后者的上限设为 20%。目前已上架的九个电路全部由 Fusebox 团队持有，因此在外部设计者上架保险丝之前，设计者分成也由团队收取。</li>
                    <li><b>算一笔账</b>（基于假设，并非实测）：一个智能体每天经五个原始保险丝付款 20 笔，每月检查费用为 3.00 USD₮0，其中 2.70 归设计者，0.30 归 Fusebox。一千个这样的智能体：每月 3,000，其中 300 归 Fusebox。每笔付款的 gas 约为 0.00002 OKB。</li>
                    <li><b>用户如何发现它。</b>npm 上的 <code>fusebox-sdk</code>、<code>fusebox-mcp</code>（也已收录于官方 MCP Registry）和 <code>fusebox-tools</code>；无需钱包的演示（<Link href="/app/try">试着骗它</Link>、<Link href="/app/rob">打劫智能体</Link>）；采用 <code>fusebox</code> 方案的 x402 卖方；面向 TapeOut 设计者的 Fuse Studio 和保险丝市场；X Layer 上的 OKX Wallet；任何人都能关注的 Telegram 提醒；以及 TapeKit 上的 <a href="https://15-2-272.tapekit.org/" target="_blank" rel="noreferrer">DeWEB 版</a>。</li>
                    <li><b>用户为何持续付费。</b>资金、收款方、审批人和限额都在钱包里，每笔付款都要经过保险丝。Breaker 和 Repeat Guard 会记住过往付款，历史越长越有用。费用预付且每日封顶，未经所有者同意，设计者无法涨价。</li>
                  </ul>
                }
              />
              <p className="small"><T en={<>The full write-up, with every fee, what runs on TapeOut and what doesn&apos;t, and the milestones for the next three months: <a href="https://github.com/0xdopewilly/fusebox/blob/main/docs/BUSINESS.md" target="_blank" rel="noreferrer">docs/BUSINESS.md</a>.</>} zh={<>完整说明（包括每项费用、哪些在 TapeOut 上运行、哪些不在，以及未来三个月的里程碑）：<a href="https://github.com/0xdopewilly/fusebox/blob/main/docs/BUSINESS.md" target="_blank" rel="noreferrer">docs/BUSINESS.md</a>。</>} /></p>
            </section>

            <section id="wallet">
              <H2 id="wallet" />
              <p><T en={<>Pay from the agent&apos;s key, or dry-run first with <code>check</code>. ABIs are in the repo at <a href="https://github.com/0xdopewilly/fusebox/blob/main/web/lib/abi.ts" target="_blank" rel="noreferrer">web/lib/abi.ts</a>.</>} zh={<>用智能体密钥付款，或先用 <code>check</code> 试运行。ABI 位于仓库的 <a href="https://github.com/0xdopewilly/fusebox/blob/main/web/lib/abi.ts" target="_blank" rel="noreferrer">web/lib/abi.ts</a>。</>} /></p>
              <Code label="Pay through the fuses (viem)" labelZh="通过保险丝付款（viem）">{`import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "viem/chains";
import { fuseboxWalletAbi } from "./abi";

const WALLET = "0xYourFuseboxWallet";
const USDT0 = "${dep.usdt0}";
const pub = createPublicClient({ chain: xLayer, transport: http() });
const agent = createWalletClient({ account: privateKeyToAccount(process.env.AGENT_KEY), chain: xLayer, transport: http() });

const amount = parseUnits("2.5", 6);
// dry run: which fuse would say no? status[i]: 0 PASS · 1 BLEW · 2 FAILED · 3 UNTRUSTED
const [allowed, status] = await pub.readContract({ address: WALLET, abi: fuseboxWalletAbi, functionName: "check", args: [USDT0, payee, amount] });
if (allowed) await agent.writeContract({ address: WALLET, abi: fuseboxWalletAbi, functionName: "pay", args: [USDT0, payee, amount, "Invoice INV-7795"] });`}</Code>
              <T
                en={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="Who can call what table"><table>
                    <thead><tr><th>Who</th><th>Can call</th></tr></thead>
                    <tbody>
                      <tr><td><b>Agent</b></td><td><code>pay</code>, <code>freeze</code></td></tr>
                      <tr><td><b>Approvers</b></td><td><code>approvePayment</code>, <code>revokeApproval</code>, <code>freeze</code></td></tr>
                      <tr><td><b>Owner</b></td><td><code>addPayee</code> · <code>removePayee</code> · <code>setAgent</code> · <code>setApprovers</code> · <code>addFuse</code> · <code>removeFuse</code> · <code>setFuseParams</code> · <code>setFuseMaxFee</code> · <code>setDailyLimits</code> · <code>setApprovalTtl</code> · <code>setToken</code> · <code>setPaused</code> · <code>freeze</code> · <code>unfreeze</code> · <code>withdrawFeeBalance</code> · <code>execute</code> · <code>transferOwnership</code></td></tr>
                      <tr><td><b>Anyone</b></td><td><code>check</code> and every view</td></tr>
                    </tbody>
                  </table></div>
                }
                zh={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="调用权限表"><table>
                    <thead><tr><th>角色</th><th>可调用</th></tr></thead>
                    <tbody>
                      <tr><td><b>智能体</b></td><td><code>pay</code>、<code>freeze</code></td></tr>
                      <tr><td><b>审批人</b></td><td><code>approvePayment</code>、<code>revokeApproval</code>、<code>freeze</code></td></tr>
                      <tr><td><b>所有者</b></td><td><code>addPayee</code> · <code>removePayee</code> · <code>setAgent</code> · <code>setApprovers</code> · <code>addFuse</code> · <code>removeFuse</code> · <code>setFuseParams</code> · <code>setFuseMaxFee</code> · <code>setDailyLimits</code> · <code>setApprovalTtl</code> · <code>setToken</code> · <code>setPaused</code> · <code>freeze</code> · <code>unfreeze</code> · <code>withdrawFeeBalance</code> · <code>execute</code> · <code>transferOwnership</code></td></tr>
                      <tr><td><b>任何人</b></td><td><code>check</code> 及所有 view 函数</td></tr>
                    </tbody>
                  </table></div>
                }
              />
              <p><T en={<>Every owner call is in the app. Open the wallet&apos;s page and connect the owner&apos;s address: the owner console has <b>Safety</b> (freeze, reset, pause, daily budgets), <b>Fuses</b> (edit, remove, install from the market, accept a new fee), <b>Payees</b>, <b>People</b> (agents, approvers, the approval window), <b>Money</b> (fund or withdraw the wallet, top up or withdraw fees) and <b>Ownership</b> (a two-step handover the new owner accepts). Each write is simulated before you sign.</>} zh={<>所有者的每个调用都能在应用里完成。打开钱包页面并连接所有者地址，所有者控制台包括：<b>安全</b>（冻结、重置、暂停、每日预算）、<b>保险丝</b>（编辑、移除、从市场安装、接受新费用）、<b>收款方</b>、<b>人员</b>（智能体、审批人、审批有效期）、<b>资金</b>（为钱包充值或提取、充值或提取费用余额）和<b>所有权</b>（两步移交，由新所有者确认接收）。每次写操作在你签名前都会先模拟执行。</>} /></p>
              <p><T en={<><b>Alerts and exports.</b> Every wallet publishes its decisions as an Atom feed at <code>/api/wallet/&lt;address&gt;/feed</code> (subscribe in Slack with <code>/feed subscribe</code>, an email digest or any reader) and its whole history as CSV at <code>/api/wallet/&lt;address&gt;/csv</code>. With the wallet&apos;s page open, the app can also raise a browser notification whenever a payment is stopped.</>} zh={<><b>提醒与导出。</b>每个钱包都会把决策发布为 Atom 订阅源，地址为 <code>/api/wallet/&lt;address&gt;/feed</code>（可在 Slack 中用 <code>/feed subscribe</code> 订阅，也可以用邮件摘要或任意阅读器），完整历史则以 CSV 形式提供，地址为 <code>/api/wallet/&lt;address&gt;/csv</code>。打开钱包页面时，只要有付款被拦截，应用还能弹出浏览器通知。</>} /></p>
              <p><T en={<><b>Approvers.</b> <Link href="/app/approve">Approvals</Link> is an inbox: connect an approver&apos;s address and it lists every payment an approval fuse stopped in any wallet where that address holds a seat, until a later decision pays it, with who has signed and a one-tap approve. Approvers can subscribe to <code>/api/approvals/feed?approver=&lt;address&gt;</code>. The SDK&apos;s <code>pay()</code> returns <code>needsApproval.url</code> when signatures alone would clear a payment, and the MCP tools say the same.</>} zh={<><b>审批人。</b><Link href="/app/approve">审批</Link>是一个收件箱：连接审批人地址后，它会列出该地址担任审批人的所有钱包中、被审批保险丝拦下的每笔付款（直到后续某次决策将其付出为止），显示谁已签名，并支持一键批准。审批人可以订阅 <code>/api/approvals/feed?approver=&lt;address&gt;</code>。当只差签名就能放行一笔付款时，SDK 的 <code>pay()</code> 会返回 <code>needsApproval.url</code>，MCP 工具也会给出同样的提示。</>} /></p>
              <p><T en={<><b>Fleets.</b> <Link href="/app/mine">My wallets</Link> shows every wallet you own at once: balances, fees left and how many decisions they cover, blown fuses, today&apos;s decisions and stops, and a status that flags low fees, a blown fuse or a missing agent. One button freezes every live agent.</>} zh={<><b>批量管理。</b><Link href="/app/mine">我的钱包</Link>一次展示你拥有的所有钱包：余额、剩余费用及可覆盖的决策次数、已熔断的保险丝、今日的决策和拦截，以及一个状态标记，提示费用不足、保险丝熔断或缺少智能体。一个按钮即可冻结所有在线的智能体。</>} /></p>
              <p><T en={<><b>Badges.</b> <code>/api/badge/&lt;wallet&gt;</code> is an SVG for a README or a status page: the wallet&apos;s fuses and whether any is blown or the wallet is paused, read from X Layer and cached for five minutes. A wallet page&apos;s tools copy the Markdown for you.</>} zh={<><b>徽章。</b><code>/api/badge/&lt;wallet&gt;</code> 是一个可放在 README 或状态页上的 SVG：显示钱包的保险丝、是否有保险丝熔断或钱包是否暂停，数据读取自 X Layer，缓存五分钟。钱包页面的工具可以帮你复制对应的 Markdown。</>} /></p>
              <p><T en={<img src="/api/badge/atlas" alt="Fusebox badge for Atlas" height={20} />} zh={<img src="/api/badge/atlas" alt="Atlas 的 Fusebox 徽章" height={20} />} /></p>
            </section>

            <section id="mcp">
              <H2 id="mcp" />
              <T
                en={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="MCP tools table"><table>
                    <thead><tr><th>Tool</th><th>What it does</th></tr></thead>
                    <tbody>
                      <tr><td><code>fusebox_check</code></td><td>Dry-runs a payment against every fuse and returns each verdict with its reason. Free and read-only.</td></tr>
                      <tr><td><code>fusebox_pay</code></td><td>Pays in USD₮0 through the fuses with the agent&apos;s key; reports paid or stopped, which fuse said no, the fee and the transaction.</td></tr>
                      <tr><td><code>fusebox_status</code></td><td>The wallet&apos;s balance, fee balance, fuses (and whether any is blown), today&apos;s spend and decision counts.</td></tr>
                      <tr><td><code>fusebox_preflight</code></td><td>Checks a payment against any line of TapeOut circuits for <i>any</i> wallet, with the context you supply; returns each verdict and the next latch state. Free and read-only.</td></tr>
                      <tr><td><code>fusebox_rules</code></td><td>Lists Fuse Studio&apos;s 13 ready-made rules: who each is for, whether it&apos;s already a live fuse, and a Studio link to build it.</td></tr>
                      <tr><td><code>fusebox_setup_link</code></td><td>Turns rule names and limits into a link that opens wallet setup with those fuses on and filled in; the owner connects and signs.</td></tr>
                      <tr><td><code>fusebox_fetch</code></td><td>Fetches a URL; if it asks for payment over x402, pays the price through the fuses (only if they all allow it) and returns the response. <code>max_price</code> caps it, <code>dry_run</code> only reports.</td></tr>
                    </tbody>
                  </table></div>
                }
                zh={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="MCP 工具表"><table>
                    <thead><tr><th>工具</th><th>功能</th></tr></thead>
                    <tbody>
                      <tr><td><code>fusebox_check</code></td><td>让一笔付款试运行过所有保险丝，返回每个结论及原因。免费、只读。</td></tr>
                      <tr><td><code>fusebox_pay</code></td><td>用智能体密钥经保险丝以 USD₮0 付款；报告已付款或已拦截、哪个保险丝说“否”、费用以及交易。</td></tr>
                      <tr><td><code>fusebox_status</code></td><td>钱包余额、费用余额、保险丝（以及是否有熔断）、今日支出和决策次数。</td></tr>
                      <tr><td><code>fusebox_preflight</code></td><td>为<i>任意</i>钱包检查一笔付款：用你提供的上下文，让它过一遍任意一条 TapeOut 电路线路；返回每个结论以及下一个锁存状态。免费、只读。</td></tr>
                      <tr><td><code>fusebox_rules</code></td><td>列出 Fuse Studio 的 13 条现成规则：每条适合谁、是否已有对应的在线保险丝，以及用来搭建它的 Studio 链接。</td></tr>
                      <tr><td><code>fusebox_setup_link</code></td><td>把规则名称和限额转换成一个链接，打开后进入钱包设置，相应保险丝已启用并填好参数；所有者连接钱包并签名即可。</td></tr>
                      <tr><td><code>fusebox_fetch</code></td><td>请求一个 URL；如果对方通过 x402 要求付款，就经保险丝支付该价格（仅当所有保险丝都放行时），并返回响应。<code>max_price</code> 设定价格上限，<code>dry_run</code> 只报告、不付款。</td></tr>
                    </tbody>
                  </table></div>
                }
              />
              <T
                en={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="MCP settings table"><table>
                    <thead><tr><th>Variable</th><th>Default</th><th>Meaning</th></tr></thead>
                    <tbody>
                      <tr><td><code>FUSEBOX_WALLET</code></td><td>Atlas</td><td>The wallet the agent pays from</td></tr>
                      <tr><td><code>FUSEBOX_AGENT_KEY</code></td><td>none (read-only)</td><td>The agent key you named in the wizard. It can only ask the wallet to pay.</td></tr>
                      <tr><td><code>FUSEBOX_RPC</code></td><td>rpc.xlayer.tech</td><td>An X Layer RPC</td></tr>
                      <tr><td><code>FUSEBOX_APP</code></td><td>fusebox-xlayer.vercel.app</td><td>Where approval links point and approver alerts are sent from</td></tr>
                    </tbody>
                  </table></div>
                }
                zh={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="MCP 配置表"><table>
                    <thead><tr><th>变量</th><th>默认值</th><th>含义</th></tr></thead>
                    <tbody>
                      <tr><td><code>FUSEBOX_WALLET</code></td><td>Atlas</td><td>智能体付款所用的钱包</td></tr>
                      <tr><td><code>FUSEBOX_AGENT_KEY</code></td><td>无（只读）</td><td>你在向导中指定的智能体密钥。它只能请求钱包付款。</td></tr>
                      <tr><td><code>FUSEBOX_RPC</code></td><td>rpc.xlayer.tech</td><td>X Layer 的 RPC 节点</td></tr>
                      <tr><td><code>FUSEBOX_APP</code></td><td>fusebox-xlayer.vercel.app</td><td>审批链接指向的地址，也是审批人提醒的发送方</td></tr>
                    </tbody>
                  </table></div>
                }
              />
            </section>

            <section id="sdk">
              <H2 id="sdk" />
              <p><T en={<>For agents and services that don&apos;t speak MCP, <code>fusebox-sdk</code> is a typed client built on viem. <code>pay</code> checks first and doesn&apos;t send a payment the fuses would refuse, since a refused payment is still recorded and its checks are still paid for.</>} zh={<>对于不支持 MCP 的智能体和服务，<code>fusebox-sdk</code> 是一个基于 viem 构建、带完整类型的客户端。<code>pay</code> 会先检查，不会发送保险丝会拒绝的付款，因为被拒绝的付款仍会被记录，其检查费用也照付不误。</>} /></p>
              <Code label="Install" labelZh="安装">{`npm install fusebox-sdk viem`}</Code>
              <Code label="Check, pay, follow" labelZh="检查、付款、监听">{`import { Fusebox } from "fusebox-sdk";

const fb = new Fusebox({ wallet: "0xYourFuseboxWallet", account: process.env.FUSEBOX_AGENT_KEY });

const c = await fb.check("0x69dB…A6C4", "12.5");      // every fuse's verdict and why, free
const r = await fb.pay("0x69dB…A6C4", "12.5", "Invoice INV-7790");
if (!r.paid) console.log(r.summary);                  // "Not sent. Stopped: Daily Cap (…)"

const stop = fb.watch((d) => { if (!d.paid) notify(d); });  // decisions as they land`}</Code>
              <p className="small"><T en={<>Also <code>status()</code>, <code>history()</code>, <code>fetch(url)</code> for paid APIs (below), <code>preflight(...)</code> for any wallet (below), <code>requestApproval(to, amount, memo)</code>, <code>pending(approver)</code> and <code>approve(to, amount)</code> for approvers, and <code>freeze()</code>. Source and tests in <a href="https://github.com/0xdopewilly/fusebox/tree/main/sdk" target="_blank" rel="noreferrer">sdk/</a>.</>} zh={<>另外还有 <code>status()</code>、<code>history()</code>、用于付费 API 的 <code>fetch(url)</code>（见下文）、适用于任意钱包的 <code>preflight(...)</code>（见下文）、供审批人使用的 <code>requestApproval(to, amount, memo)</code>、<code>pending(approver)</code> 和 <code>approve(to, amount)</code>，以及 <code>freeze()</code>。源码和测试见 <a href="https://github.com/0xdopewilly/fusebox/tree/main/sdk" target="_blank" rel="noreferrer">sdk/</a>。</>} /></p>
            </section>

            <section id="x402">
              <H2 id="x402" />
              <p><T en={<>Agents pay for APIs with <a href="https://x402.org" target="_blank" rel="noreferrer">x402</a>: the server answers <code>402</code> with an offer, the agent pays and asks again with proof. With Fusebox the price is a payment like any other, so it goes through the wallet&apos;s fuses first: a scam price list is stopped like a scam invoice, and nothing moves. <Link href="/app/x402">Two live demo sellers</Link> show both sides.</>} zh={<>智能体通过 <a href="https://x402.org" target="_blank" rel="noreferrer">x402</a> 为 API 付费：服务器返回 <code>402</code> 和报价，智能体付款后携带证明再次请求。在 Fusebox 中，这个价格和其他任何付款一样，要先经过钱包的保险丝：诈骗价目表会像诈骗发票一样被拦截，资金不会移动。<Link href="/app/x402">两个在线演示卖方</Link>展示了买卖双方的完整流程。</>} /></p>
              <T
                en={
                  <ol>
                    <li>The seller answers <code>402</code> with <code>PAYMENT-REQUIRED</code> (x402 v2): a <code>fusebox</code> option on <code>eip155:196</code> in USD₮0, the payee, the price, and a nonce it signed.</li>
                    <li>The agent&apos;s wallet runs the free <code>check()</code>, then <code>pay()</code> through the fuses with <code>x402 &lt;nonce&gt;</code> in the memo.</li>
                    <li>It retries with <code>PAYMENT-SIGNATURE</code>: the wallet, the transaction, and the paying agent&apos;s signature over the nonce and transaction. The seller checks that the factory made the wallet, that its Decision allowed this payee and price with that nonce, that USD₮0 moved, that the signature comes from the agent that paid (so nobody watching the chain can redeem it first), and that the transaction hasn&apos;t bought anything before. Then it serves the response with a <code>PAYMENT-RESPONSE</code> receipt.</li>
                  </ol>
                }
                zh={
                  <ol>
                    <li>卖方返回 <code>402</code> 和 <code>PAYMENT-REQUIRED</code>（x402 v2）：包括 <code>eip155:196</code> 上以 USD₮0 计价的 <code>fusebox</code> 选项、收款方、价格，以及卖方签名的 nonce。</li>
                    <li>智能体的钱包先运行免费的 <code>check()</code>，再经保险丝执行 <code>pay()</code>，并在备注中写入 <code>x402 &lt;nonce&gt;</code>。</li>
                    <li>然后携带 <code>PAYMENT-SIGNATURE</code> 重试：包含钱包、交易，以及付款智能体对 nonce 和交易的签名。卖方会核验：该钱包由工厂合约创建；其 Decision 以该 nonce 放行了这个收款方和价格；USD₮0 确已转出；签名来自付款的那个智能体（因此链上旁观者无法抢先兑换）；且这笔交易此前没有购买过任何东西。然后返回响应，并附上 <code>PAYMENT-RESPONSE</code> 收据。</li>
                  </ol>
                }
              />
              <Code label="Agent · fusebox-sdk" labelZh="智能体 · fusebox-sdk">{`const { response, payment } = await fb.fetch("https://fusebox-xlayer.vercel.app/api/x402/prices", {}, { maxPrice: "0.05" });
console.log(payment?.summary);   // "Paid 0.01 USD₮0 to 0x69dB… for …/prices (decision #7)."`}</Code>
              <Code label="Seller · any fetch-style route" labelZh="卖方 · 任意 fetch 风格的路由">{`import { createPublicClient, http } from "viem";
import { xLayer, x402 } from "fusebox-sdk";
const client = createPublicClient({ chain: xLayer, transport: http() });

export async function GET(req: Request) {
  const g = await x402.requirePayment(req, { payTo: "0xYou", price: "0.01", secret: process.env.X402_SECRET!, client,
    markUsed: (tx) => db.insertIfAbsent("x402:" + tx) });   // one payment buys one response
  if (!g.paid) return g.response;                          // 402: a fresh offer, or why it didn't count
  return Response.json(await getData(), { headers: g.headers });
}`}</Code>
              <p><T en={<>Sellers on their own x402 stack can use the hosted facilitator for the scheme, in x402&apos;s shape: <code>GET /api/x402/facilitator/supported</code>, and <code>POST /api/x402/facilitator/verify</code> or <code>/settle</code> with <code>{"{ paymentPayload, paymentRequirements }"}</code>. Settle marks the transaction used, so a payment settles once.</>} zh={<>使用自有 x402 技术栈的卖方，可以调用该方案的托管 facilitator，接口形式与 x402 一致：<code>GET /api/x402/facilitator/supported</code>，以及携带 <code>{"{ paymentPayload, paymentRequirements }"}</code> 的 <code>POST /api/x402/facilitator/verify</code> 或 <code>/settle</code>。settle 会把交易标记为已使用，因此一笔付款只能结算一次。</>} /></p>
              <p className="small"><T en={<>Why a scheme of its own: x402&apos;s <code>exact</code> scheme has the payer sign a token transfer off-chain. A Fusebox wallet is a contract that only pays through its fuses, so it can&apos;t sign one, and shouldn&apos;t: that signature would skip the fuses. Here the on-chain Decision is the proof.</>} zh={<>为什么要单独设计一个方案：x402 的 <code>exact</code> 方案要求付款方在链下签署一笔代币转账。Fusebox 钱包是一个只能经保险丝付款的合约，所以它签不了这样的签名，也不应该签：那样的签名会绕过保险丝。在这里，链上 Decision 就是证明。</>} /></p>
            </section>

            <section id="frameworks">
              <H2 id="frameworks" />
              <p><T en={<><code>fusebox-tools</code> gives an agent the same four tools as the MCP server (<code>fusebox_check</code>, <code>fusebox_pay</code>, <code>fusebox_status</code>, <code>fusebox_fetch</code>) as native tools for the Vercel AI SDK, LangChain and ElizaOS, or as plain objects for anything else. Options fall back to <code>FUSEBOX_WALLET</code>, <code>FUSEBOX_AGENT_KEY</code> and <code>FUSEBOX_RPC</code>.</>} zh={<><code>fusebox-tools</code> 为智能体提供与 MCP 服务器相同的四个工具（<code>fusebox_check</code>、<code>fusebox_pay</code>、<code>fusebox_status</code>、<code>fusebox_fetch</code>），可作为 Vercel AI SDK、LangChain 和 ElizaOS 的原生工具使用，也可作为普通对象接入其他任何框架。未传入的选项会回退到 <code>FUSEBOX_WALLET</code>、<code>FUSEBOX_AGENT_KEY</code> 和 <code>FUSEBOX_RPC</code>。</>} /></p>
              <Code label="Vercel AI SDK">{`import { fuseboxTools } from "fusebox-tools/ai";
const { text } = await generateText({ model, tools: fuseboxTools(), stopWhen: stepCountIs(5),
  prompt: "Pay Kano Cotton's invoice INV-7801: 0.05 USD₮0 to 0x69dB89385E8a69278a49335C432d0c70ec86A6C4" });`}</Code>
              <Code label="LangChain">{`import { fuseboxLangchainTools } from "fusebox-tools/langchain";
const agent = createReactAgent({ llm, tools: fuseboxLangchainTools() });`}</Code>
              <Code label="ElizaOS">{`import { fuseboxPlugin } from "fusebox-tools/eliza";
export const character = { name: "Ledger", plugins: [fuseboxPlugin],
  settings: { secrets: { FUSEBOX_WALLET: "0xYourFuseboxWallet", FUSEBOX_AGENT_KEY: process.env.FUSEBOX_AGENT_KEY } } };`}</Code>
              <p className="small"><T en={<>A refused payment comes back as a result the model can read (which fuse said no and why), not an exception, and approval links are meant for a person. Source and tests in <a href="https://github.com/0xdopewilly/fusebox/tree/main/tools" target="_blank" rel="noreferrer">tools/</a>.</>} zh={<>被拒绝的付款会作为模型可读的结果返回（哪个保险丝说“否”、为什么），而不是抛出异常；审批链接则是给人看的。源码和测试见 <a href="https://github.com/0xdopewilly/fusebox/tree/main/tools" target="_blank" rel="noreferrer">tools/</a>。</>} /></p>
            </section>

            <section id="alerts">
              <H2 id="alerts" />
              <p><T en={<>Two of Three only works if approvers hear about requests quickly. On <Link href="/app/approve">Approvals</Link>, an approver turns on alerts for their phone or laptop with one signature (free: it proves the address is theirs). From then on a payment waiting on their seat arrives as a notification that opens that exact approval. Fusebox installs as an app (on iPhone, add it to the Home Screen first: iOS only delivers web push to installed apps).</>} zh={<>Two of Three 只有在审批人能及时收到请求时才管用。在<Link href="/app/approve">审批</Link>页面，审批人只需一次签名（免费，用于证明地址归其所有），即可为手机或笔记本电脑开启提醒。此后，每笔等待其审批的付款都会以通知形式送达，点开即进入对应的审批。Fusebox 可以作为应用安装（在 iPhone 上，请先添加到主屏幕：iOS 只向已安装的应用发送网页推送）。</>} /></p>
              <T
                en={
                  <ul>
                    <li><b>When an agent asks.</b> The SDK&apos;s <code>pay()</code> and the MCP&apos;s <code>fusebox_pay</code> alert the approvers themselves when signatures are all that stand in the way. The request is signed with the agent&apos;s key; Fusebox checks on X Layer that the signer is the wallet&apos;s agent and that the approval fuse really holds that payment before anything is sent.</li>
                    <li><b>Every hour.</b> A sweep announces any open request in an approver&apos;s inbox that hasn&apos;t been announced yet, so a refused decision recorded on-chain is never missed. Each request is announced once.</li>
                  </ul>
                }
                zh={
                  <ul>
                    <li><b>智能体发起请求时。</b>当只差审批签名时，SDK 的 <code>pay()</code> 和 MCP 的 <code>fusebox_pay</code> 会主动提醒审批人。请求由智能体密钥签名；在发出任何提醒之前，Fusebox 会在 X Layer 上核验签名者确为该钱包的智能体，且审批保险丝确实拦下了这笔付款。</li>
                    <li><b>每小时。</b>定时扫描会推送审批人收件箱中尚未提醒过的待处理请求，确保链上记录的被拒决策不会被遗漏。每个请求只提醒一次。</li>
                  </ul>
                }
              />
              <p className="small"><T en="Alerts are end-to-end encrypted web push (VAPID). The server stores each device's push subscription under the approver's address and nothing else; a device the push service reports gone is dropped." zh="提醒采用端到端加密的网页推送（VAPID）。服务器只按审批人地址存储每台设备的推送订阅，除此之外不存储任何信息；推送服务报告已失效的设备会被移除。" /></p>
            </section>

            <section id="telegram">
              <H2 id="telegram" />
              <p><T en={<>Anyone can follow a Fusebox wallet on Telegram through <a href="https://t.me/FuseboxAlertsBot" target="_blank" rel="noreferrer">@FuseboxAlertsBot</a>: tap <b>Alerts on Telegram</b> on the wallet&apos;s page (or <b>Alerts</b> on a phone), or send the bot the wallet&apos;s address. From then on, every payment the wallet&apos;s agent tries arrives as a message: <b>paid</b>, or <b>stopped</b> with the fuse that said no, why, and what the owner can do. A payment held by Two of Three comes with an <b>Approve it</b> button.</>} zh={<>任何人都可以通过 <a href="https://t.me/FuseboxAlertsBot" target="_blank" rel="noreferrer">@FuseboxAlertsBot</a> 在 Telegram 上关注一个 Fusebox 钱包：在钱包页面点<b>Telegram 提醒</b>（手机上是<b>提醒</b>），或者把钱包地址发给机器人。此后，该钱包的智能体每尝试一笔付款，都会收到一条消息：<b>已付款</b>，或<b>已拦截</b>，并附上说“否”的保险丝、原因以及所有者可以怎么做。被 Two of Three 拦下的付款会附带一个 <b>Approve it</b>（批准）按钮。</>} /></p>
              <T
                en={
                  <ul>
                    <li><b>At once.</b> The app, the SDK&apos;s <code>pay()</code> and the MCP&apos;s <code>fusebox_pay</code> tell Fusebox the payment&apos;s transaction as soon as it lands. Fusebox reads the decision back from X Layer itself, so nobody can fake one.</li>
                    <li><b>Every 10 minutes.</b> A sweep reads the followed wallets&apos; decisions from X Layer, so an agent paying with its own code is covered too. Each decision is announced once.</li>
                    <li><b>Commands.</b> <code>/list</code> shows what a chat follows; <code>/stop</code> ends every alert (or <code>/stop 0x…</code> one wallet). Works in groups too, for a team that shares a wallet.</li>
                  </ul>
                }
                zh={
                  <ul>
                    <li><b>即时。</b>应用、SDK 的 <code>pay()</code> 和 MCP 的 <code>fusebox_pay</code> 会在付款交易上链后，立即把交易告诉 Fusebox。Fusebox 自己从 X Layer 读回决策，因此没人能伪造。</li>
                    <li><b>每 10 分钟。</b>定时扫描会从 X Layer 读取被关注钱包的决策，因此用自有代码付款的智能体也能覆盖到。每个决策只推送一次。</li>
                    <li><b>命令。</b><code>/list</code> 显示当前聊天关注了哪些钱包；<code>/stop</code> 停止所有提醒（或用 <code>/stop 0x…</code> 停止单个钱包）。在群组中同样可用，适合共用一个钱包的团队。</li>
                  </ul>
                }
              />
              <p className="small"><T en="What's in an alert is already public on X Layer. Fusebox stores only which chat follows which wallet; a chat that blocks the bot is forgotten." zh="提醒里的内容本来就公开在 X Layer 上。Fusebox 只存储哪个聊天关注了哪个钱包；屏蔽了机器人的聊天，其记录会被删除。" /></p>
            </section>

            <section id="tapesend">
              <H2 id="tapesend" />
              <p><T en={<>Every payment a Fusebox wallet&apos;s fuses stop is also posted, once, to that wallet&apos;s <b>TapeSend inbox on X Layer</b>: TapeOut&apos;s DeWEB messaging layer. The message comes from the container of Fusebox&apos;s TapeOut circuit #15 and says what was tried, which fuse said no and why, and what the owner can do. Nobody has to follow anything: every wallet gets them.</>} zh={<>Fusebox 钱包的保险丝每拦下一笔付款，还会向该钱包<b>在 X Layer 上的 TapeSend 收件箱</b>发送一条消息（仅一次）。TapeSend 是 TapeOut 的 DeWEB 消息层。消息来自 Fusebox 的 TapeOut 电路 #15 的容器，说明尝试了什么、哪个保险丝说“否”及原因，以及所有者可以怎么做。无需关注任何东西：每个钱包都会收到。</>} /></p>
              <T
                en={
                  <ul>
                    <li><b>Where to read them.</b> The wallet&apos;s page shows its <b>On-chain alerts</b>, read straight from the DeWEB hub (<code>0xe61A…25ee</code>) and checked against each message&apos;s on-chain digest. Anyone can read the same inbox: the endpoint is <code>uint32(0) ‖ uint64(196) ‖ wallet</code>, and <code>GET /api/tapesend/inbox?wallet=0x…</code> returns it as JSON.</li>
                    <li><b>Who sends them.</b> TapeSend lets only a circuit&apos;s holder speak for it, so circuit #15 sits in <a href="https://repo.sourcify.dev/196/0xBf385a2A9368cC08EA234FF1965B6a486a6b0b81" target="_blank" rel="noreferrer">FuseboxHerald</a>. Fusebox&apos;s server holds only its crier key, which can post and do nothing else; a cold admin key claims the fuse&apos;s fees, runs the DeWEB site and can take the circuit back.</li>
                    <li><b>When.</b> Right after a payment made through the app, the SDK or the MCP server, and by a sweep every 10 minutes for everything else. At most 6 a wallet an hour.</li>
                  </ul>
                }
                zh={
                  <ul>
                    <li><b>在哪里查看。</b>钱包页面会显示它的<b>链上提醒</b>，直接从 DeWEB hub（<code>0xe61A…25ee</code>）读取，并与每条消息的链上摘要进行比对。任何人都能读取同一个收件箱：端点为 <code>uint32(0) ‖ uint64(196) ‖ wallet</code>，<code>GET /api/tapesend/inbox?wallet=0x…</code> 会以 JSON 形式返回。</li>
                    <li><b>由谁发送。</b>TapeSend 只允许电路的持有者以电路的名义发言，因此电路 #15 存放在 <a href="https://repo.sourcify.dev/196/0xBf385a2A9368cC08EA234FF1965B6a486a6b0b81" target="_blank" rel="noreferrer">FuseboxHerald</a> 合约中。Fusebox 的服务器只持有它的播报密钥（crier key），只能发消息，别的都做不了；一把冷存储的管理员密钥负责领取该保险丝的费用、运营 DeWEB 站点，并且可以收回电路。</li>
                    <li><b>何时发送。</b>通过应用、SDK 或 MCP 服务器发起的付款，会在付款后立即发送；其他情况由每 10 分钟一次的定时扫描发送。每个钱包每小时最多 6 条。</li>
                  </ul>
                }
              />
              <p className="small"><T en="Messages from any other TapeOut container that lands in a wallet's inbox are counted but never shown as Fusebox's. Each post costs Fusebox about 0.000004 OKB of gas; the wallet pays nothing extra." zh="来自其他 TapeOut 容器、落入钱包收件箱的消息只计数，绝不会作为 Fusebox 的消息显示。每次发送花费 Fusebox 约 0.000004 OKB 的 gas；钱包无需额外付费。" /></p>
            </section>

            <section id="preflight">
              <H2 id="preflight" />
              <p><T en={<>Not every agent will move its money into a Fusebox wallet on day one. Pre-flight lets any agent, on any wallet, run a payment through a line of TapeOut circuits before it signs. Each verdict is the circuit&apos;s own <code>eval</code> (or <code>step</code>, for circuits with latches) on X Layer, read-only and free. A Fusebox wallet keeps the context on-chain; with pre-flight you send it: what was spent today, whether the payee is saved and since when, which approvers signed, and the latch state from your last call, which comes back updated so the Breaker remembers.</>} zh={<>并不是每个智能体第一天就会把资金转进 Fusebox 钱包。预检（pre-flight）让任何智能体在任何钱包上，签名之前先让一笔付款过一遍一条 TapeOut 电路线路。每个结论都来自该电路自身在 X Layer 上的 <code>eval</code>（带锁存器的电路则用 <code>step</code>），只读且免费。Fusebox 钱包把上下文保存在链上；使用预检时则由你传入：今天已支出多少、收款方是否已保存及保存时间、哪些审批人已签名，以及上一次调用返回的锁存状态。返回结果会带回更新后的锁存状态，让 Breaker 记住之前发生的事。</>} /></p>
              <Code label="Any wallet · fusebox-sdk" labelZh="任意钱包 · fusebox-sdk">{`import { preflight } from "fusebox-sdk";

const r = await preflight({
  line: [{ fuseId: 1, a: 50 }, { fuseId: 2, a: 24, b: 2 }, { fuseId: 3 }, { fuseId: 4, a: 20 }],
  payment: { amount: "2.5" },
  context: { spentToday: "10", payee: { saved: true, hoursSinceSaved: 72 }, approvals: 0, state: lastState },
});
if (!r.allowed) return;        // "Stopped by Payee Guard (the payee isn't in the payee book)…"
lastState = r.state;           // the Breaker remembers next time
await wallet.sendTransaction(…);`}</Code>
              <p><T en={<>Over HTTP it&apos;s <code>POST /api/preflight</code> with the same body (<code>GET</code> returns an example), and MCP agents get <code>fusebox_preflight</code>. Any listed fuse works, rivals and Studio designs included. Pre-flight is advisory: the agent can still sign without asking. When you want the circuits to be the only way money moves, that&apos;s what a Fusebox wallet is for.</>} zh={<>通过 HTTP 调用则是 <code>POST /api/preflight</code>，请求体相同（<code>GET</code> 返回一个示例）；MCP 智能体可使用 <code>fusebox_preflight</code>。任何已上架的保险丝都可以用，包括竞争设计和 Studio 设计。预检只是建议性的：智能体仍然可以不经询问直接签名。如果你希望电路成为资金流动的唯一通道，那正是 Fusebox 钱包的用途。</>} /></p>
            </section>

            <section id="guardrails">
              <H2 id="guardrails" />
              <p><T en={<>The wizard&apos;s first decision, which fuses and what settings, is the hardest for someone new to it. On <Link href="/app/new">Wire up a wallet</Link> you can describe the agent instead (&ldquo;it pays our three suppliers, never more than 80 a day, anything over 30 needs me and my partner&rdquo;) and get a proposed line: each fuse on or off with its settings, a plain reason for each, and test payments that show the line working, including what it stops.</>} zh={<>向导的第一个决定（用哪些保险丝、怎么设置）对新手来说最难。在<Link href="/app/new">搭建一个钱包</Link>中，你可以改为直接描述你的智能体（“它给我们的三家供应商付款，每天不超过 80，超过 30 的需要我和合伙人批准”），然后得到一条建议线路：每个保险丝是开是关及其设置、每项的通俗理由，以及演示这条线路如何运作的测试付款，包括它会拦下什么。</>} /></p>
              <T
                en={
                  <ul>
                    <li><b>Who proposes it.</b> Claude Haiku 5.5 on NEAR AI Cloud, through a strict tool call; the answer is validated and clamped to what the circuits accept (8-bit settings). If the model is unavailable, Fusebox&apos;s rule reader proposes from the same description, and says so.</li>
                    <li><b>Nothing is trusted blindly.</b> &ldquo;Test it on TapeOut&apos;s circuits&rdquo; opens the line simulator with the proposal&apos;s own test payments, and TapeOut&apos;s processor decides each one. &ldquo;Use this line&rdquo; fills the wizard, including any payee or approver addresses you mentioned, and you still review every number before you sign.</li>
                  </ul>
                }
                zh={
                  <ul>
                    <li><b>由谁提议。</b>NEAR AI Cloud 上的 Claude Haiku 5.5，通过严格的工具调用生成；结果会经过校验，并钳制到电路可接受的范围内（8 位设置）。如果模型不可用，Fusebox 的规则解析器会根据同一段描述给出提议，并注明这一点。</li>
                    <li><b>不盲目信任任何结果。</b>“在 TapeOut 电路上测试”会用提议自带的测试付款打开线路模拟器，每一笔都由 TapeOut 的处理器决定。“使用这条线路”会填好向导，包括你提到的任何收款方或审批人地址；签名之前，你仍然要逐一核对每个数字。</li>
                  </ul>
                }
              />
            </section>

            <section id="designers">
              <H2 id="designers" />
              <T
                en={
                  <ol className="dsteps">
                    <li><b>Design the circuit</b> as NAND gates (plus LATCH bits if it needs memory) against one socket&apos;s pinout. The repo&apos;s <a href="https://github.com/0xdopewilly/fusebox/tree/main/circuits" target="_blank" rel="noreferrer">circuits toolchain</a> builds, simulates and exhaustively tests TAP-02 netlists, and passes TapeOut&apos;s official test vectors.</li>
                    <li><b>Tape it out</b> on an X Layer TapeOut processor: mint one transistor per gate and call <code>tapeout(netlist, nIn, nOut)</code>. You get the circuit NFT.</li>
                    <li><b>List it</b> on the <Link href="/app/designers">designers page</Link>, or call <code>registry.list(processor, circuitId, socket, netlistHash, fee, uri)</code>. The registry checks the pinout, the gate budget (512), the state rules and the netlist hash against the chain.</li>
                    <li><b>Earn on every decision</b>, the no&apos;s included. Claim with <code>claim(fuseId, to)</code>. Sell the NFT and the income moves with it. Wallet owners install your fuse from the <Link href="/app/market">fuse market</Link> in one signature.</li>
                    <li><b>Or skip the toolchain.</b> <Link href="/app/studio">Fuse Studio</Link> builds the circuit from rules with no code: each group of conditions is <b>all of</b>, <b>any of</b>, <b>at least k of</b> or <b>none of</b>, and the groups combine with any or every (or N strikes for the Breaker socket). It compiles the rule to NAND gates with the same toolchain and proves the bytes against the rule: every input up to 24 (all 2^24 for the Daily Cap socket), every state and input for the Breaker, and all 2^33 (8.6 billion) for Payee Guard, proved with BDDs: the circuit, read gate by gate from its bytes, and the rule must be the same function. Then it mints the transistors, tapes it out and lists it from your wallet. It opens with 13 ready-made rules, and five of them come out byte-identical to the live fuses (circuits #15, #16, #17, #18 and #21), so Studio can rebuild every Fusebox fuse with no code.</li>
                    <li><b>Describe it.</b> A listing&apos;s <code>metadataURI</code> holds a small <code>fusebox-fuse/1</code> JSON (name, summary, description, rule). The designers page writes it on X Layer itself as a <code>data:application/json;base64</code> URI, so the description needs no host; an https link to the same JSON works too. Every fuse gets its own page, e.g. <Link href="/app/fuse/1">/app/fuse/1</Link>.</li>
                    <li><b>Play gate golf.</b> The Studio&apos;s optimizer shrinks a rule&apos;s circuit (merging identical logic, folding constants, removing conditions another one already implies) and proves the smaller netlist gives the same answer on every input before it lets you tape it out. Fewer gates means fewer transistors to mint and less gas on every check, about 2,400 gas a gate. Fusebox&apos;s own eight circuits are already minimal; rules people write typically shrink by 5 to 75%.</li>
                    <li><b>Try before you tape out.</b> From the Studio, send a draft to the <Link href="/app/simulate">line simulator</Link>: it is compiled and evaluated in the browser from the same bytes TapeOut would store, next to listed fuses, on any sequence of payments. A draft is also a link you can share; it reopens in the Studio as designed.</li>
                    <li><b>Run it like a product.</b> From the designers page, change the fee (<code>setFee</code>), delist it from new installs (<code>setListed</code>) or link a page that explains it (<code>setMetadataURI</code>). A lower fee applies to everyone at once; a higher one only to wallets whose owner accepts it.</li>
                  </ol>
                }
                zh={
                  <ol className="dsteps">
                    <li><b>设计电路</b>：按某个插槽的引脚定义，用 NAND 门搭建（需要记忆时再加 LATCH 位）。仓库中的<a href="https://github.com/0xdopewilly/fusebox/tree/main/circuits" target="_blank" rel="noreferrer">电路工具链</a>可以构建、模拟并穷举测试 TAP-02 网表，并且通过了 TapeOut 的官方测试向量。</li>
                    <li><b>流片</b>：在 X Layer 的 TapeOut 处理器上，每个门铸造一个晶体管，然后调用 <code>tapeout(netlist, nIn, nOut)</code>。你会获得电路 NFT。</li>
                    <li><b>上架</b>：在<Link href="/app/designers">设计者页面</Link>上架，或调用 <code>registry.list(processor, circuitId, socket, netlistHash, fee, uri)</code>。注册表会对照链上数据检查引脚定义、门数上限（512）、状态规则和网表哈希。</li>
                    <li><b>每次决策都有收益</b>，说“否”的也算。用 <code>claim(fuseId, to)</code> 领取。卖掉 NFT，收益也随之转移。钱包所有者只需一次签名，就能从<Link href="/app/market">保险丝市场</Link>安装你的保险丝。</li>
                    <li><b>或者跳过工具链。</b><Link href="/app/studio">Fuse Studio</Link> 可以零代码地从规则生成电路：每组条件可以是<b>全部满足</b>、<b>任一满足</b>、<b>至少满足 k 个</b>或<b>全不满足</b>，各组之间再以“任一”或“全部”组合（Breaker 插槽则用 N 次触发）。它用同一套工具链把规则编译成 NAND 门，并对照规则证明生成的字节：输入不超过 24 个时穷举全部输入（Daily Cap 插槽为全部 2^24 种），Breaker 覆盖每种状态和输入，Payee Guard 则用 BDD 证明全部 2^33 种（86 亿）：从字节逐门读出的电路与规则必须是同一个函数。之后它会从你的钱包铸造晶体管、流片并上架。Studio 自带 13 条现成规则，其中五条生成的电路与在线保险丝（电路 #15、#16、#17、#18 和 #21）逐字节一致，因此 Studio 可以零代码重建 Fusebox 的每一个保险丝。</li>
                    <li><b>描述它。</b>上架信息的 <code>metadataURI</code> 存放一份小型 <code>fusebox-fuse/1</code> JSON（name、summary、description、rule）。设计者页面会把它作为 <code>data:application/json;base64</code> URI 直接写到 X Layer 上，因此描述无需任何托管；指向同一份 JSON 的 https 链接也可以。每个保险丝都有自己的页面，例如 <Link href="/app/fuse/1">/app/fuse/1</Link>。</li>
                    <li><b>玩“门高尔夫”。</b>Studio 的优化器会精简规则对应的电路（合并相同逻辑、折叠常量、删除已被其他条件蕴含的条件），并在允许你流片之前，证明精简后的网表在每种输入下都给出相同结果。门越少，要铸造的晶体管就越少，每次检查的 gas 也越低，每个门约 2,400 gas。Fusebox 自己的八个电路已经是最简；用户编写的规则通常能精简 5% 到 75%。</li>
                    <li><b>流片前先试。</b>在 Studio 中把草稿发送到<Link href="/app/simulate">线路模拟器</Link>：它会在浏览器中，用与 TapeOut 将要存储的完全相同的字节编译并求值，与已上架的保险丝放在一起，跑任意一组付款序列。草稿本身也是一个可分享的链接，打开后会在 Studio 中按原设计还原。</li>
                    <li><b>像产品一样运营。</b>在设计者页面上，可以修改费用（<code>setFee</code>）、停止接受新安装（<code>setListed</code>），或关联一个说明页面（<code>setMetadataURI</code>）。降价立即对所有人生效；涨价只对所有者接受了新价格的钱包生效。</li>
                  </ol>
                }
              />
              <p><T en={<>Several designs can compete on one socket. Four rivals for the same sockets are live in the market (fuses 6–9, TapeOut circuits #22–25), exhaustively tested before they were taped out: <b>Per-Payment Cap</b> (no single payment over the cap), <b>Strict Payee Book</b> (no trial amount), <b>Two-Strike Breaker</b> (two latches: the first stranger is refused, the second blows it) and <b>Lead Approver</b> (seat 1 must be one of the two signers). A rival names its settings in its metadata, and the app labels them that way.</>} zh={<>同一个插槽上可以有多个设计相互竞争。市场上已有四个针对相同插槽的竞争设计上线（保险丝 6–9，TapeOut 电路 #22–25），流片前都经过了穷举测试：<b>Per-Payment Cap</b>（单笔付款不得超过上限）、<b>Strict Payee Book</b>（没有试付额度）、<b>Two-Strike Breaker</b>（两个锁存器：第一次遇到陌生地址时拒绝，第二次则熔断）和 <b>Lead Approver</b>（1 号席位必须是两位签名者之一）。竞争设计会在元数据中为自己的参数命名，应用也会按这些名称显示。</>} /></p>
              <p className="small"><T en="Business hours only, per-payee caps, velocity limits: there's room for many more fuses. The duplicate-invoice check is now the fifth: the Repeat Guard." zh="仅限工作时间、按收款方设上限、频率限制：还有很多保险丝可以做。重复发票检查如今已成为第五个保险丝：Repeat Guard。" /></p>
            </section>

            <section id="contracts">
              <H2 id="contracts" />
              <p><T en={<>X Layer mainnet, chain 196. Two sets of contracts run side by side. <b>v2</b> (Nov 20) makes new wallets and holds the fuse market: its registry stores socket pinouts as data, so new kinds of fuse never need another registry, and its wallets can run the Repeat Guard. <b>v1</b> (Nov 15) holds Atlas and the first wallets, which keep working unchanged. Fuses 1–4 are the same circuits with the same ids on both. Every contract has verified source on <a href={`https://repo.sourcify.dev/196/${dep.v2.registry}`} target="_blank" rel="noreferrer">Sourcify</a> (exact match).</>} zh={<>X Layer 主网，链 ID 196。两套合约并行运行。<b>v2</b>（11 月 20 日）负责创建新钱包并承载保险丝市场：它的注册表把插槽引脚定义作为数据存储，因此新类型的保险丝无需再部署新的注册表，它创建的钱包也能运行 Repeat Guard。<b>v1</b>（11 月 15 日）承载 Atlas 和最早的一批钱包，它们照常运行，无需任何改动。保险丝 1–4 在两套合约上是相同的电路、相同的 id。每个合约都已在 <a href={`https://repo.sourcify.dev/196/${dep.v2.registry}`} target="_blank" rel="noreferrer">Sourcify</a> 上验证源码（完全匹配）。</>} /></p>
              <T
                en={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="Contract addresses table"><table className="addrs">
                    <tbody>
                      <tr><td><b>FuseRegistry v2</b></td><td><A a={dep.v2.registry} label={dep.v2.registry} /></td></tr>
                      <tr><td><b>FuseboxFactory v2</b></td><td><A a={dep.v2.factory} label={dep.v2.factory} /></td></tr>
                      <tr><td><b>FuseRegistry v1</b></td><td><A a={dep.registry} label={dep.registry} /></td></tr>
                      <tr><td><b>FuseboxFactory v1</b></td><td><A a={dep.factory} label={dep.factory} /></td></tr>
                      <tr><td><b>Atlas</b> (demo wallet)</td><td><A a={dep.atlas} label={dep.atlas} /></td></tr>
                      <tr><td><b>OrderGuard</b> (TapeOut processor)</td><td><A a={dep.processor} label={dep.processor} /></td></tr>
                      <tr><td><b>USD₮0</b></td><td><A a={dep.usdt0} label={dep.usdt0} /></td></tr>
                      <tr><td><b>Circuits</b></td><td>#15 Daily Cap · #16 Payee Guard · #17 Breaker · #18 Two of Three (fuse ids 1–4) · #21 Repeat Guard (fuse 5, v2)</td></tr>
                    </tbody>
                  </table></div>
                }
                zh={
                  <div className="tbl-w" tabIndex={0} role="region" aria-label="合约地址表"><table className="addrs">
                    <tbody>
                      <tr><td><b>FuseRegistry v2</b></td><td><A a={dep.v2.registry} label={dep.v2.registry} /></td></tr>
                      <tr><td><b>FuseboxFactory v2</b></td><td><A a={dep.v2.factory} label={dep.v2.factory} /></td></tr>
                      <tr><td><b>FuseRegistry v1</b></td><td><A a={dep.registry} label={dep.registry} /></td></tr>
                      <tr><td><b>FuseboxFactory v1</b></td><td><A a={dep.factory} label={dep.factory} /></td></tr>
                      <tr><td><b>Atlas</b>（演示钱包）</td><td><A a={dep.atlas} label={dep.atlas} /></td></tr>
                      <tr><td><b>OrderGuard</b>（TapeOut 处理器）</td><td><A a={dep.processor} label={dep.processor} /></td></tr>
                      <tr><td><b>USD₮0</b></td><td><A a={dep.usdt0} label={dep.usdt0} /></td></tr>
                      <tr><td><b>电路</b></td><td>#15 Daily Cap · #16 Payee Guard · #17 Breaker · #18 Two of Three（保险丝 id 1–4）· #21 Repeat Guard（保险丝 5，v2）</td></tr>
                    </tbody>
                  </table></div>
                }
              />
            </section>

            <section id="security">
              <H2 id="security" />
              <p><T en={<><b>Unaudited.</b> The contracts are live on mainnet and Atlas holds small balances on purpose. Highlights of the threat model (full table in <a href="https://github.com/0xdopewilly/fusebox/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">ARCHITECTURE.md</a>):</>} zh={<><b>未经审计。</b>合约已在主网上线，Atlas 有意只持有少量余额。威胁模型要点如下（完整表格见 <a href="https://github.com/0xdopewilly/fusebox/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">ARCHITECTURE.md</a>）：</>} /></p>
              <T
                en={
                  <ul className="dots">
                    <li><b>Fake processors can&apos;t pass.</b> The registry trusts a processor only by its runtime code hash, rechecked at every decision. If TapeOut upgrades its code, fuses read UNTRUSTED and payments stop, free, until the new code is attested.</li>
                    <li><b>Prompt injection can&apos;t pick the inputs.</b> The agent supplies payee, amount and memo; every bit a fuse sees is built on-chain.</li>
                    <li><b>A stolen agent key</b> still faces the caps, the payee book and approvals. The agent can freeze but never unfreeze.</li>
                    <li><b>Approvals can&apos;t be replayed.</b> Each is bound to the chain, wallet, approver set, token, payee and amount, and expires.</li>
                    <li><b>Bad listings are refused:</b> wrong pinout, a different netlist, over 512 gates, memory where it isn&apos;t allowed, or references to other circuits.</li>
                  </ul>
                }
                zh={
                  <ul className="dots">
                    <li><b>伪造的处理器无法通过。</b>注册表只依据运行时代码哈希信任处理器，并在每次决策时重新核验。如果 TapeOut 升级了代码，保险丝会显示 UNTRUSTED，付款随之停止（不收费），直到新代码通过认证。</li>
                    <li><b>提示词注入无法操纵输入。</b>智能体只提供收款方、金额和备注；保险丝看到的每个比特位都在链上构造。</li>
                    <li><b>智能体密钥被盗</b>，也仍要面对限额、收款方名册和审批。智能体可以冻结钱包，但永远无法解冻。</li>
                    <li><b>审批无法重放。</b>每份审批都绑定链、钱包、审批人集合、代币、收款方和金额，并且会过期。</li>
                    <li><b>不合规的上架会被拒绝：</b>引脚定义错误、网表不一致、超过 512 个门、在不允许的地方使用记忆，或引用其他电路。</li>
                  </ul>
                }
              />
              <p className="small"><T en="Remaining trust: TapeOut's factory owner can upgrade code (fails closed), USD₮0's issuer can freeze addresses, and the wallet owner is fully trusted." zh="仍需信任的部分：TapeOut 工厂合约的所有者可以升级代码（出错即拦截），USD₮0 的发行方可以冻结地址，钱包所有者则被完全信任。" /></p>
              <p className="small"><T en={<>Live health of everything Fusebox depends on (X Layer&apos;s RPCs, TapeOut&apos;s processor trust, Atlas&apos;s fees, the AI agent, the x402 sellers, alerts) is on the <Link href="/app/status">status page</Link>, and as JSON at <code>/api/status</code>.</>} zh={<>Fusebox 所依赖的一切（X Layer 的 RPC、TapeOut 处理器的信任状态、Atlas 的费用、AI 智能体、x402 卖方、提醒）的实时健康状况，都在<Link href="/app/status">状态页</Link>上，也可以通过 <code>/api/status</code> 获取 JSON。</>} /></p>
            </section>

            <section id="glossary">
              <H2 id="glossary" />
              <p><T en="The same words the app explains when you tap them." zh="应用里点一下就会解释的那些词，都收录在这里。" /></p>
              <dl className="gloss">
                {Object.values(GLOSSARY).map((g) => <div key={g.term}><dt><T en={g.term} zh={g.termZh} /></dt><dd><T en={g.say} zh={g.sayZh} /></dd></div>)}
              </dl>
            </section>

            <section id="faq">
              <H2 id="faq" />
              <T en={<details><summary>Does the agent ever see or control the fuses?</summary><p>No. The agent&apos;s key can call <code>pay</code> and <code>freeze</code>. Fuses, limits, payees and approvers belong to the owner.</p></details>} zh={<details><summary>智能体能看到或控制保险丝吗？</summary><p>不能。智能体的密钥可以调用 <code>pay</code> 和 <code>freeze</code>。保险丝、限额、收款方和审批人都归所有者掌管。</p></details>} />
              <T en={<details><summary>What does a payment cost?</summary><p>Gas on X Layer (fractions of a cent) plus the fees of the fuses on the line. On Atlas, all four fuses together cost 0.0045 USD₮0.</p></details>} zh={<details><summary>一笔付款要花多少钱？</summary><p>X Layer 上的 gas（不到一美分），加上线路上各保险丝的费用。在 Atlas 上，四个保险丝合计 0.0045 USD₮0。</p></details>} />
              <T en={<details><summary>Why do blocked payments pay fees?</summary><p>Stopping the scam is the fuse&apos;s job. Daily budgets cap how much blocked attempts can cost.</p></details>} zh={<details><summary>被拦截的付款为什么也要付费？</summary><p>拦下诈骗正是保险丝的本职工作。每日预算限制了被拦截的尝试最多能花多少钱。</p></details>} />
              <T en={<details><summary>Can I use my own circuit?</summary><p>Yes: tape it out for one of the five sockets and list it. Wallets can install it straight away (a Repeat Guard design needs a wallet made since Nov 20).</p></details>} zh={<details><summary>我可以用自己的电路吗？</summary><p>可以：针对五个插槽之一流片并上架即可。钱包可以立即安装（Repeat Guard 类设计需要 11 月 20 日以来创建的钱包）。</p></details>} />
              <T en={<details><summary>Is there a version with no server at all?</summary><p>The DeWEB edition is one self-contained page that reads X Layer from your browser, stored on-chain in circuit #15&apos;s container at 15.2.272.tape and served by TapeKit: <a href="https://15-2-272.tapekit.org/" target="_blank" rel="noreferrer">15-2-272.tapekit.org</a> (also previewed at <Link href="/onchain">/onchain</Link>).</p></details>} zh={<details><summary>有完全不需要服务器的版本吗？</summary><p>DeWEB 版是一个独立完整的页面，直接在你的浏览器中读取 X Layer；它存储在链上电路 #15 的容器中（15.2.272.tape），由 TapeKit 提供访问：<a href="https://15-2-272.tapekit.org/" target="_blank" rel="noreferrer">15-2-272.tapekit.org</a>（也可在 <Link href="/onchain">/onchain</Link> 预览）。</p></details>} />
            </section>

            <footer className="docs-foot m">
              <span className="mute">Fusebox · MIT · <a href="https://github.com/0xdopewilly/fusebox" target="_blank" rel="noreferrer">GitHub ↗</a> · <a href="https://youtu.be/vcopkuNdhkc" target="_blank" rel="noreferrer"><T en="Demo video" zh="演示视频" /> ↗</a> · <a href="https://x.com/fuseboxhq" target="_blank" rel="noreferrer">@fuseboxhq ↗</a></span>
              <Link className="btn lime" href="/app"><span><T en="Open the app" zh="打开应用" /></span> <span className="k">↗</span></Link>
            </footer>
          </article>
        </div>
      </main>
    </>
  );
}
