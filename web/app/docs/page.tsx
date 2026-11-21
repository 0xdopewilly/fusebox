import Link from "next/link";
import type { Metadata } from "next";
import "./docs.css";
import SiteHeader from "@/components/site/SiteHeader";
import DocsNav from "@/components/docs/DocsNav";
import Code from "@/components/docs/Code";
import dep from "@/lib/deployments/mainnet.json";
import { GLOSSARY } from "@/lib/plain";

export const metadata: Metadata = {
  title: "Docs · Fusebox",
  description: "How Fusebox works: wallets for AI agents whose payments must pass logic circuits taped out on TapeOut. Quickstart, the five fuses, the wallet API, MCP tools, selling a fuse, and every contract on X Layer.",
  openGraph: { title: "Fusebox docs · Build with Fusebox", description: "Quickstart, the five fuses, the wallet API, MCP tools, selling a fuse, and every contract on X Layer.", url: "/docs" },
  twitter: { title: "Fusebox docs · Build with Fusebox", description: "Quickstart, the five fuses, the wallet API, MCP tools, selling a fuse, and every contract on X Layer." },
};

const OKLINK = "https://www.oklink.com/xlayer";
const SECTIONS = [
  { id: "start", title: "New here? Start here", group: "Start" },
  { id: "overview", title: "What Fusebox is", group: "Start" },
  { id: "quickstart", title: "Quickstart", group: "Start" },
  { id: "connect", title: "Connecting a wallet", group: "Start" },
  { id: "needs", title: "Before you wire up", group: "Start" },
  { id: "agent", title: "Connect your agent", group: "Start" },
  { id: "first", title: "Your first payment", group: "Start" },
  { id: "assistant", title: "The Fusebox assistant", group: "Start" },
  { id: "payment", title: "How a payment works", group: "Concepts" },
  { id: "fuses", title: "The five fuses", group: "Concepts" },
  { id: "fees", title: "Fees and budgets", group: "Concepts" },
  { id: "wallet", title: "The wallet API", group: "Build" },
  { id: "mcp", title: "MCP tools", group: "Build" },
  { id: "sdk", title: "TypeScript SDK", group: "Build" },
  { id: "x402", title: "Pay per call (x402)", group: "Build" },
  { id: "frameworks", title: "Agent frameworks", group: "Build" },
  { id: "alerts", title: "Approver alerts", group: "Build" },
  { id: "telegram", title: "Telegram alerts", group: "Build" },
  { id: "preflight", title: "Pre-flight for any wallet", group: "Build" },
  { id: "guardrails", title: "Plain-English guardrails", group: "Build" },
  { id: "designers", title: "Sell a fuse", group: "Build" },
  { id: "contracts", title: "Contracts", group: "Reference" },
  { id: "security", title: "Security", group: "Reference" },
  { id: "glossary", title: "Glossary", group: "Reference" },
  { id: "faq", title: "FAQ", group: "Reference" },
];
const A = ({ a, label }: { a: string; label?: string }) => <a className="addr" href={`${OKLINK}/address/${a}`} target="_blank" rel="noreferrer">{label ?? `${a.slice(0, 6)}…${a.slice(-4)}`} ↗</a>;

export default function DocsPage() {
  return (
    <>
      <SiteHeader active="docs" />
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <main className="docs wrap" id="main">
        <header className="docs-hero">
          <div className="m"><span className="lime">[Docs]</span> <span className="mute">Fusebox on X Layer · chain 196</span></div>
          <h1 className="disp">Build with <span className="lime">[Fusebox]</span>.</h1>
          <p>Wallets for AI agents where every payment has to pass small logic circuits, taped out on TapeOut and checked on X Layer in the same call. Everything here is live on mainnet.</p>
        </header>
        <div className="docs-grid">
          <DocsNav sections={SECTIONS} />
          <article className="docs-body">

            <section id="start">
              <h2>New here? Start here</h2>
              <p><b>The problem:</b> AI agents now hold wallets and send real money. One convincing message, a fake invoice or new bank details, and an agent can pay a scammer.</p>
              <p><b>What Fusebox does:</b> it gives the agent a wallet where every payment must pass a few small circuits called <b>fuses</b>: a daily limit, known payees only, two signers for big payments. They run on X Layer. If any fuse says no, nothing moves.</p>
              <p><b>Who Atlas is:</b> Fusebox&apos;s live demo wallet on X Layer mainnet. An AI agent pays a cotton supplier from it, through four fuses. It holds real USD₮0 and every payment it has tried is on-chain. Anyone can try to trick it.</p>
              <h3>What to do first</h3>
              <ol className="dsteps">
                <li><b>Try to scam Atlas.</b> Open <Link href="/app/try">Try to scam it</Link>, pick a trick and run it. Atlas&apos;s fuses answer in a few seconds. Free, no wallet needed, nothing moves.</li>
                <li><b>See why.</b> Each fuse explains its yes or no. <Link href="/app/rob">Rob the agent</Link> lets an AI agent read your scam first, and the <Link href="/app/simulate">line simulator</Link> tests any set of fuses on a list of payments.</li>
                <li><b>Wire up your own.</b> <Link href="/app/new">Wire up a wallet</Link> starts with a checklist of what you need, makes your agent&apos;s key for you if you don&apos;t have one, and takes you through it one step at a time.</li>
                <li><b>Use it.</b> Hand the wallet to your agent (Claude, Cursor or your own code) with the setup Fusebox gives you, or pay by chatting with the <a href="#assistant">Fusebox assistant</a>.</li>
              </ol>
              <h3>On a phone</h3>
              <p>The app is laid out like a phone app: the dock at the bottom moves between Wallet, Try, Market and Sell, and its last key opens your account and every other page. The <b>i</b> button in the top bar explains the screen you&apos;re on, and any word with a dotted underline explains itself when you tap it. Every term is also in the <a href="#glossary">glossary</a>.</p>
            </section>

            <section id="overview">
              <h2>What Fusebox is</h2>
              <p>An AI agent that can pay is useful and dangerous: it can be talked into paying a scammer. Fusebox gives the agent a wallet whose key can only do one thing, ask the wallet to pay, and the wallet only pays if every <b>fuse</b> on its line says yes.</p>
              <p>A fuse is a real NAND circuit taped out on TapeOut. The wallet derives the circuit&apos;s input bits from its own on-chain state (is this payee saved? how much was spent today? did two approvers sign?), calls the TapeOut processor, and reads one output bit. One no stops the payment. Every fuse that decided is paid a small fee, and the fee goes to whoever owns the circuit&apos;s NFT.</p>
              <div className="cards3">
                <div><b>Agent</b><span>Holds a key that can only call <code>pay</code> and <code>freeze</code>. It names the payee, amount and memo, nothing else.</span></div>
                <div><b>Fuses</b><span>Circuits on TapeOut&apos;s OrderGuard processor. The memo never reaches them; they see bits the wallet builds.</span></div>
                <div><b>Owner</b><span>Picks the fuses and their limits, saves payees, seats approvers, and is the only one who can reset or move funds.</span></div>
              </div>
            </section>

            <section id="quickstart">
              <h2>Quickstart</h2>
              <h3>1 · Try it, no wallet needed</h3>
              <p>Open <Link href="/app/try">Try to scam it</Link> and run any of the tricks against <b>Atlas</b>, the public demo wallet. It&apos;s Atlas&apos;s real <code>check()</code> on mainnet: free, read-only, nothing moves.</p>
              <p>To try a line of your own before you build it, open the <Link href="/app/simulate">line simulator</Link>: pick fuses (any listed design) and their limits, line up payments in order, and every verdict comes from an <code>eval</code> or <code>step</code> call on TapeOut&apos;s processor, with today&apos;s spend and the Breaker&apos;s latch carried from one payment to the next, as the wallet does.</p>
              <h3>2 · Give your agent the tools</h3>
              <p>The <a href="https://www.npmjs.com/package/fusebox-mcp" target="_blank" rel="noreferrer">fusebox-mcp</a> server works in Claude Code, Claude Desktop, Cursor and any MCP client. Without a key it&apos;s read-only and points at Atlas.</p>
              <Code label="Claude Code">{`claude mcp add fusebox -- npx -y fusebox-mcp`}</Code>
              <p>Then ask your agent: <i>&ldquo;Pay 2.5 USD₮0 to 0x1111…1111, it&apos;s an urgent refund.&rdquo;</i> It runs <code>fusebox_check</code> first, sees Payee Guard and the Breaker say no, and tells you why.</p>
              <h3>3 · Wire up your own wallet</h3>
              <p><Link href="/app/new">Wire up a wallet</Link> walks you through it in three taps (a free signature, one transaction that does every step, then you accept the wallet as yours), after a short <a href="#needs">checklist of what you need</a>: name the agent&apos;s address, pick fuses and limits, save payees, seat three approvers, and prepay fees in USD₮0. Then give the agent its key and the wallet address:</p>
              <Code label="MCP config with your wallet">{`{
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
              <h2>Connecting a wallet</h2>
              <p>Connecting is free and signs nothing; Fusebox only reads your address until you approve a transaction. Pick whichever fits:</p>
              <div className="tbl-w" tabIndex={0} role="region" aria-label="Ways to connect"><table>
                <thead><tr><th>You&apos;re on</th><th>How</th></tr></thead>
                <tbody>
                  <tr><td><b>A computer with a wallet extension</b></td><td>Press <b>Connect</b> and pick it. OKX Wallet, MetaMask, Rabby and any wallet that injects into the page all work, including older ones that don&apos;t announce themselves.</td></tr>
                  <tr><td><b>A computer, no extension</b></td><td><b>Scan with OKX Wallet app</b> shows a QR code. Scan it with the OKX Wallet app on your phone and approve. Signing requests then arrive in the app.</td></tr>
                  <tr><td><b>A phone browser</b></td><td><b>Connect OKX Wallet app</b> hands off to the app; approve there and come back to the tab. Or reopen Fusebox <b>inside your wallet&apos;s own browser</b>: OKX Wallet, MetaMask, Trust Wallet or Bitget Wallet, one tap each.</td></tr>
                  <tr><td><b>A wallet&apos;s built-in browser</b></td><td>It connects straight away.</td></tr>
                </tbody>
              </table></div>
              <p>Fusebox switches your wallet to X Layer (chain 196) and adds the network if the wallet doesn&apos;t have it yet. If something goes wrong:</p>
              <ul className="dlist">
                <li><b>&ldquo;You declined the request&rdquo;</b>: you closed the wallet&apos;s prompt. Press Connect again.</li>
                <li><b>&ldquo;Your wallet already has a request open&rdquo;</b>: open the wallet, finish or cancel the earlier prompt, then try again.</li>
                <li><b>&ldquo;Still on another network&rdquo;</b>: switch the wallet to X Layer yourself, then retry.</li>
                <li><b>Trust Wallet on iPhone</b> has no built-in browser any more, so use OKX Wallet or MetaMask there.</li>
              </ul>
            </section>

            <section id="needs">
              <h2>Before you wire up</h2>
              <p>Wiring up your own wallet takes about ten signatures. Have these ready; the first step of the wizard checks what it can for you, and nothing is signed until the last step.</p>
              <ol className="dsteps">
                <li><b>A wallet on X Layer.</b> It becomes the owner: the only address that can change fuses, limits and payees. OKX Wallet works best.</li>
                <li><b>An agent key.</b> The address your AI agent signs with. No agent yet? Wire up makes one in your browser: you see it once, copy or download it, and can keep it there for the assistant. It can only ask the wallet to pay, through every fuse.</li>
                <li><b>USD₮0 on X Layer.</b> It prepays the fuses&apos; fees (0.0045 per payment with all four) and funds the agent&apos;s payments. Withdraw it to the X Layer network from an exchange, or bridge it from another chain.</li>
                <li><b>A little OKB for gas.</b> Setting up is one transaction, plus one to accept the wallet; gas on X Layer costs a fraction of a cent. Your agent also needs gas to send its payments: Wire up sends it 0.0005 OKB by default, about 25 payments.</li>
              </ol>
              <p>Not ready yet? <Link href="/app/simulate">Test a line first</Link>: the simulator needs no wallet.</p>
            </section>

            <section id="agent">
              <h2>Connect your agent</h2>
              <p>When Wire up finishes, it hands you a ready setup with your wallet (and the agent key, if Fusebox made it) already filled in. Copy it, paste it, and your agent pays through your fuses.</p>
              <Code label="Claude Code">{`claude mcp add fusebox -e FUSEBOX_WALLET=0xYourWallet -e FUSEBOX_AGENT_KEY=0xYourAgentKey -- npx -y fusebox-mcp`}</Code>
              <p>For <b>Claude Desktop</b> the same server goes in <code>claude_desktop_config.json</code> (Settings → Developer → Edit Config); for <b>Cursor</b>, in <code>~/.cursor/mcp.json</code>. In your own code, <code>new Fusebox({"{ wallet, account }"})</code> from the <a href="#sdk">SDK</a>. Then ask: <i>&ldquo;Pay my saved payee 0.01 USD₮0.&rdquo;</i> The agent checks the fuses first and tells you what they said.</p>
            </section>

            <section id="first">
              <h2>Your first payment</h2>
              <p>The <Link href="/app/first">first-payment guide</Link> opens right after Wire up. It checks three things (money in the wallet, gas for your agent, a saved payee) and fixes what&apos;s missing with one signature each. Then your agent pays the saved payee for real, signed in your browser with its key, and you see every fuse&apos;s answer and the transaction.</p>
              <p>Last, it checks the same payment to a stranger, read-only, so you see your fuses stop it without tripping your Breaker. On a real payment to a stranger the Breaker would trip and stay tripped until you reset it.</p>
            </section>

            <section id="assistant">
              <h2>The Fusebox assistant</h2>
              <p>Pay by chatting: open the <Link href="/app/assistant">assistant</Link> and say <i>&ldquo;pay Kano Cotton 2&rdquo;</i>. It lines the payment up, your wallet&apos;s fuses check it on X Layer, and you tap <b>Pay as your agent</b>. If a fuse would say no, there&apos;s nothing to sign; it shows you which fuse and why.</p>
              <ul className="dlist">
                <li>It only pays your saved payees, or an address you type in full. It never guesses an address, and a message claiming urgency or new bank details changes nothing.</li>
                <li>Name your payees once (&ldquo;Kano Cotton&rdquo;); the names live in your browser.</li>
                <li>It signs with your wallet&apos;s agent key, kept in your browser: Fusebox&apos;s servers never see it. Made the key elsewhere? Paste it once.</li>
                <li>The model is Claude Haiku 5.5 on NEAR AI Cloud; when it&apos;s unavailable a simple reader understands &ldquo;pay &lt;name&gt; &lt;amount&gt;&rdquo;.</li>
              </ul>
            </section>

            <section id="payment">
              <h2>How a payment works</h2>
              <ol className="dsteps">
                <li><b>The agent asks.</b> <code>pay(token, to, amount, memo)</code>. The wallet checks the caller is an agent, the wallet isn&apos;t paused, the token is enabled, and today&apos;s decision budget isn&apos;t spent.</li>
                <li><b>The wallet builds each fuse&apos;s inputs</b> from its own state: is the payee saved and how long ago, how much went out today, which approvers signed this exact payment.</li>
                <li><b>Every fuse decides, in order, in the same call.</b> The wallet calls <code>eval</code> (or <code>step</code> for a fuse with memory) on the TapeOut processor, with a fixed 2M gas each.</li>
                <li><b>One no stops the payment.</b> The decision is recorded either way, with every fuse&apos;s inputs and verdict, the fee and the memo. A blown Breaker stays blown until the owner resets it.</li>
                <li><b>Designers are paid</b> from the wallet&apos;s prepaid fee balance, and only if every fuse held does the token move.</li>
              </ol>
              <div className="tbl-w" tabIndex={0} role="region" aria-label="Fuse statuses table"><table>
                <thead><tr><th>Status</th><th>Meaning</th><th>Charged?</th></tr></thead>
                <tbody>
                  <tr><td><span className="pill ok">PASS</span></td><td>The circuit output 1.</td><td>Yes</td></tr>
                  <tr><td><span className="pill no">BLEW</span></td><td>The circuit output 0: this fuse said no.</td><td>Yes: the no is the product</td></tr>
                  <tr><td><span className="pill">FAILED</span></td><td>The call reverted, ran out of gas or returned malformed data. Blocks.</td><td>No</td></tr>
                  <tr><td><span className="pill">UNTRUSTED</span></td><td>TapeOut&apos;s processor code changed and isn&apos;t attested yet. Blocks.</td><td>No</td></tr>
                </tbody>
              </table></div>
              <p>Anything but PASS blocks: Fusebox fails closed.</p>
            </section>

            <section id="fuses">
              <h2>The five fuses</h2>
              <p>A <b>socket</b> is the contract between the wallet and a circuit: the wallet derives the bits, the circuit decides. Bits are packed least-significant first (TAP-02 §5). Amounts are rounded up to the install&apos;s unit and saturate at 255, while owner limits stop at 254, so a saturated amount can never pass.</p>
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
              <p className="small">Fees are in USD₮0 per check; a payment checked by the first four costs 0.0045, all five 0.005. Every netlist is on TapeOut&apos;s processor, and the <Link href="/app/market">fuse market</Link> checks each one against the hash the registry pinned at listing.</p>
            </section>

            <section id="fees">
              <h2>Fees and budgets</h2>
              <ul className="dots">
                <li><b>Prepaid.</b> Fees come from the wallet&apos;s balance in the registry, not from the agent&apos;s spending money. If it can&apos;t cover the fuses, the payment reverts: no payment without paying the fuses.</li>
                <li><b>90 / 10.</b> Each fee goes 90% to the fuse&apos;s designer (whoever holds the circuit NFT when they claim) and 10% to Fusebox. The contract caps Fusebox&apos;s share at 20%.</li>
                <li><b>Blocked attempts pay too</b>, within limits: FAILED and UNTRUSTED fuses are never charged.</li>
                <li><b>Daily budgets.</b> At most 100 recorded decisions and 20 recorded blocks per UTC day by default (<code>setDailyLimits</code>). Past them an attempt reverts and costs nothing, so a hijacked agent can&apos;t drain fees.</li>
                <li><b>Price changes.</b> The wallet passes the highest fee the owner accepted; a designer&apos;s raise only applies once the owner accepts it.</li>
              </ul>
            </section>

            <section id="wallet">
              <h2>The wallet API</h2>
              <p>Pay from the agent&apos;s key, or dry-run first with <code>check</code>. ABIs are in the repo at <a href="https://github.com/0xdopewilly/fusebox/blob/main/web/lib/abi.ts" target="_blank" rel="noreferrer">web/lib/abi.ts</a>.</p>
              <Code label="Pay through the fuses (viem)">{`import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
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
              <div className="tbl-w" tabIndex={0} role="region" aria-label="Who can call what table"><table>
                <thead><tr><th>Who</th><th>Can call</th></tr></thead>
                <tbody>
                  <tr><td><b>Agent</b></td><td><code>pay</code>, <code>freeze</code></td></tr>
                  <tr><td><b>Approvers</b></td><td><code>approvePayment</code>, <code>revokeApproval</code>, <code>freeze</code></td></tr>
                  <tr><td><b>Owner</b></td><td><code>addPayee</code> · <code>removePayee</code> · <code>setAgent</code> · <code>setApprovers</code> · <code>addFuse</code> · <code>removeFuse</code> · <code>setFuseParams</code> · <code>setFuseMaxFee</code> · <code>setDailyLimits</code> · <code>setApprovalTtl</code> · <code>setToken</code> · <code>setPaused</code> · <code>freeze</code> · <code>unfreeze</code> · <code>withdrawFeeBalance</code> · <code>execute</code> · <code>transferOwnership</code></td></tr>
                  <tr><td><b>Anyone</b></td><td><code>check</code> and every view</td></tr>
                </tbody>
              </table></div>
              <p>Every owner call is in the app. Open the wallet&apos;s page and connect the owner&apos;s address: the owner console has <b>Safety</b> (freeze, reset, pause, daily budgets), <b>Fuses</b> (edit, remove, install from the market, accept a new fee), <b>Payees</b>, <b>People</b> (agents, approvers, the approval window), <b>Money</b> (fund or withdraw the wallet, top up or withdraw fees) and <b>Ownership</b> (a two-step handover the new owner accepts). Each write is simulated before you sign.</p>
              <p><b>Alerts and exports.</b> Every wallet publishes its decisions as an Atom feed at <code>/api/wallet/&lt;address&gt;/feed</code> (subscribe in Slack with <code>/feed subscribe</code>, an email digest or any reader) and its whole history as CSV at <code>/api/wallet/&lt;address&gt;/csv</code>. With the wallet&apos;s page open, the app can also raise a browser notification whenever a payment is stopped.</p>
              <p><b>Approvers.</b> <Link href="/app/approve">Approvals</Link> is an inbox: connect an approver&apos;s address and it lists every payment an approval fuse stopped in any wallet where that address holds a seat, until a later decision pays it, with who has signed and a one-tap approve. Approvers can subscribe to <code>/api/approvals/feed?approver=&lt;address&gt;</code>. The SDK&apos;s <code>pay()</code> returns <code>needsApproval.url</code> when signatures alone would clear a payment, and the MCP tools say the same.</p>
              <p><b>Fleets.</b> <Link href="/app/mine">My wallets</Link> shows every wallet you own at once: balances, fees left and how many decisions they cover, blown fuses, today&apos;s decisions and stops, and a status that flags low fees, a blown fuse or a missing agent. One button freezes every live agent.</p>
              <p><b>Badges.</b> <code>/api/badge/&lt;wallet&gt;</code> is an SVG for a README or a status page: the wallet&apos;s fuses and whether any is blown or the wallet is paused, read from X Layer and cached for five minutes. A wallet page&apos;s tools copy the Markdown for you.</p>
              <p><img src="/api/badge/atlas" alt="Fusebox badge for Atlas" height={20} /></p>
            </section>

            <section id="mcp">
              <h2>MCP tools</h2>
              <div className="tbl-w" tabIndex={0} role="region" aria-label="MCP tools table"><table>
                <thead><tr><th>Tool</th><th>What it does</th></tr></thead>
                <tbody>
                  <tr><td><code>fusebox_check</code></td><td>Dry-runs a payment against every fuse and returns each verdict with its reason. Free and read-only.</td></tr>
                  <tr><td><code>fusebox_pay</code></td><td>Pays in USD₮0 through the fuses with the agent&apos;s key; reports paid or stopped, which fuse said no, the fee and the transaction.</td></tr>
                  <tr><td><code>fusebox_status</code></td><td>The wallet&apos;s balance, fee balance, fuses (and whether any is blown), today&apos;s spend and decision counts.</td></tr>
                  <tr><td><code>fusebox_preflight</code></td><td>Checks a payment against any line of TapeOut circuits for <i>any</i> wallet, with the context you supply; returns each verdict and the next latch state. Free and read-only.</td></tr>
                  <tr><td><code>fusebox_fetch</code></td><td>Fetches a URL; if it asks for payment over x402, pays the price through the fuses (only if they all allow it) and returns the response. <code>max_price</code> caps it, <code>dry_run</code> only reports.</td></tr>
                </tbody>
              </table></div>
              <div className="tbl-w" tabIndex={0} role="region" aria-label="MCP settings table"><table>
                <thead><tr><th>Variable</th><th>Default</th><th>Meaning</th></tr></thead>
                <tbody>
                  <tr><td><code>FUSEBOX_WALLET</code></td><td>Atlas</td><td>The wallet the agent pays from</td></tr>
                  <tr><td><code>FUSEBOX_AGENT_KEY</code></td><td>none (read-only)</td><td>The agent key you named in the wizard. It can only ask the wallet to pay.</td></tr>
                  <tr><td><code>FUSEBOX_RPC</code></td><td>rpc.xlayer.tech</td><td>An X Layer RPC</td></tr>
                  <tr><td><code>FUSEBOX_APP</code></td><td>fusebox-xlayer.vercel.app</td><td>Where approval links point and approver alerts are sent from</td></tr>
                </tbody>
              </table></div>
            </section>

            <section id="sdk">
              <h2>TypeScript SDK</h2>
              <p>For agents and services that don&apos;t speak MCP, <code>fusebox-sdk</code> is a typed client built on viem. <code>pay</code> checks first and doesn&apos;t send a payment the fuses would refuse, since a refused payment is still recorded and its checks are still paid for.</p>
              <Code label="Install">{`npm install fusebox-sdk viem`}</Code>
              <Code label="Check, pay, follow">{`import { Fusebox } from "fusebox-sdk";

const fb = new Fusebox({ wallet: "0xYourFuseboxWallet", account: process.env.FUSEBOX_AGENT_KEY });

const c = await fb.check("0x69dB…A6C4", "12.5");      // every fuse's verdict and why, free
const r = await fb.pay("0x69dB…A6C4", "12.5", "Invoice INV-7790");
if (!r.paid) console.log(r.summary);                  // "Not sent. Stopped: Daily Cap (…)"

const stop = fb.watch((d) => { if (!d.paid) notify(d); });  // decisions as they land`}</Code>
              <p className="small">Also <code>status()</code>, <code>history()</code>, <code>fetch(url)</code> for paid APIs (below), <code>preflight(...)</code> for any wallet (below), <code>requestApproval(to, amount, memo)</code>, <code>pending(approver)</code> and <code>approve(to, amount)</code> for approvers, and <code>freeze()</code>. Source and tests in <a href="https://github.com/0xdopewilly/fusebox/tree/main/sdk" target="_blank" rel="noreferrer">sdk/</a>.</p>
            </section>

            <section id="x402">
              <h2>Pay per call (x402)</h2>
              <p>Agents pay for APIs with <a href="https://x402.org" target="_blank" rel="noreferrer">x402</a>: the server answers <code>402</code> with an offer, the agent pays and asks again with proof. With Fusebox the price is a payment like any other, so it goes through the wallet&apos;s fuses first: a scam price list is stopped like a scam invoice, and nothing moves. <Link href="/app/x402">Two live demo sellers</Link> show both sides.</p>
              <ol>
                <li>The seller answers <code>402</code> with <code>PAYMENT-REQUIRED</code> (x402 v2): a <code>fusebox</code> option on <code>eip155:196</code> in USD₮0, the payee, the price, and a nonce it signed.</li>
                <li>The agent&apos;s wallet runs the free <code>check()</code>, then <code>pay()</code> through the fuses with <code>x402 &lt;nonce&gt;</code> in the memo.</li>
                <li>It retries with <code>PAYMENT-SIGNATURE</code>: the wallet and the transaction. The seller checks that the factory made the wallet, that its Decision allowed this payee and price with that nonce, that USD₮0 moved, and that the transaction hasn&apos;t bought anything before. Then it serves the response with a <code>PAYMENT-RESPONSE</code> receipt.</li>
              </ol>
              <Code label="Agent · fusebox-sdk">{`const { response, payment } = await fb.fetch("https://fusebox-xlayer.vercel.app/api/x402/prices", {}, { maxPrice: "0.05" });
console.log(payment?.summary);   // "Paid 0.01 USD₮0 to 0x69dB… for …/prices (decision #7)."`}</Code>
              <Code label="Seller · any fetch-style route">{`import { createPublicClient, http } from "viem";
import { xLayer, x402 } from "fusebox-sdk";
const client = createPublicClient({ chain: xLayer, transport: http() });

export async function GET(req: Request) {
  const g = await x402.requirePayment(req, { payTo: "0xYou", price: "0.01", secret: process.env.X402_SECRET!, client,
    markUsed: (tx) => db.insertIfAbsent("x402:" + tx) });   // one payment buys one response
  if (!g.paid) return g.response;                          // 402: a fresh offer, or why it didn't count
  return Response.json(await getData(), { headers: g.headers });
}`}</Code>
              <p>Sellers on their own x402 stack can use the hosted facilitator for the scheme, in x402&apos;s shape: <code>GET /api/x402/facilitator/supported</code>, and <code>POST /api/x402/facilitator/verify</code> or <code>/settle</code> with <code>{"{ paymentPayload, paymentRequirements }"}</code>. Settle marks the transaction used, so a payment settles once.</p>
              <p className="small">Why a scheme of its own: x402&apos;s <code>exact</code> scheme has the payer sign a token transfer off-chain. A Fusebox wallet is a contract that only pays through its fuses, so it can&apos;t sign one, and shouldn&apos;t: that signature would skip the fuses. Here the on-chain Decision is the proof.</p>
            </section>

            <section id="frameworks">
              <h2>Agent frameworks</h2>
              <p><code>fusebox-tools</code> gives an agent the same four tools as the MCP server (<code>fusebox_check</code>, <code>fusebox_pay</code>, <code>fusebox_status</code>, <code>fusebox_fetch</code>) as native tools for the Vercel AI SDK, LangChain and ElizaOS, or as plain objects for anything else. Options fall back to <code>FUSEBOX_WALLET</code>, <code>FUSEBOX_AGENT_KEY</code> and <code>FUSEBOX_RPC</code>.</p>
              <Code label="Vercel AI SDK">{`import { fuseboxTools } from "fusebox-tools/ai";
const { text } = await generateText({ model, tools: fuseboxTools(), stopWhen: stepCountIs(5),
  prompt: "Pay Kano Cotton's invoice INV-7801: 0.05 USD₮0 to 0x69dB89385E8a69278a49335C432d0c70ec86A6C4" });`}</Code>
              <Code label="LangChain">{`import { fuseboxLangchainTools } from "fusebox-tools/langchain";
const agent = createReactAgent({ llm, tools: fuseboxLangchainTools() });`}</Code>
              <Code label="ElizaOS">{`import { fuseboxPlugin } from "fusebox-tools/eliza";
export const character = { name: "Ledger", plugins: [fuseboxPlugin],
  settings: { secrets: { FUSEBOX_WALLET: "0xYourFuseboxWallet", FUSEBOX_AGENT_KEY: process.env.FUSEBOX_AGENT_KEY } } };`}</Code>
              <p className="small">A refused payment comes back as a result the model can read (which fuse said no and why), not an exception, and approval links are meant for a person. Source and tests in <a href="https://github.com/0xdopewilly/fusebox/tree/main/tools" target="_blank" rel="noreferrer">tools/</a>.</p>
            </section>

            <section id="alerts">
              <h2>Approver alerts</h2>
              <p>Two of Three only works if approvers hear about requests quickly. On <Link href="/app/approve">Approvals</Link>, an approver turns on alerts for their phone or laptop with one signature (free: it proves the address is theirs). From then on a payment waiting on their seat arrives as a notification that opens that exact approval. Fusebox installs as an app (on iPhone, add it to the Home Screen first: iOS only delivers web push to installed apps).</p>
              <ul>
                <li><b>When an agent asks.</b> The SDK&apos;s <code>pay()</code> and the MCP&apos;s <code>fusebox_pay</code> alert the approvers themselves when signatures are all that stand in the way. The request is signed with the agent&apos;s key; Fusebox checks on X Layer that the signer is the wallet&apos;s agent and that the approval fuse really holds that payment before anything is sent.</li>
                <li><b>Every hour.</b> A sweep announces any open request in an approver&apos;s inbox that hasn&apos;t been announced yet, so a refused decision recorded on-chain is never missed. Each request is announced once.</li>
              </ul>
              <p className="small">Alerts are end-to-end encrypted web push (VAPID). The server stores each device&apos;s push subscription under the approver&apos;s address and nothing else; a device the push service reports gone is dropped.</p>
            </section>

            <section id="telegram">
              <h2>Telegram alerts</h2>
              <p>Anyone can follow a Fusebox wallet on Telegram through <a href="https://t.me/FuseboxAlertsBot" target="_blank" rel="noreferrer">@FuseboxAlertsBot</a>: tap <b>Alerts on Telegram</b> on the wallet&apos;s page (or <b>Alerts</b> on a phone), or send the bot the wallet&apos;s address. From then on, every payment the wallet&apos;s agent tries arrives as a message: <b>paid</b>, or <b>stopped</b> with the fuse that said no, why, and what the owner can do. A payment held by Two of Three comes with an <b>Approve it</b> button.</p>
              <ul>
                <li><b>At once.</b> The app, the SDK&apos;s <code>pay()</code> and the MCP&apos;s <code>fusebox_pay</code> tell Fusebox the payment&apos;s transaction as soon as it lands. Fusebox reads the decision back from X Layer itself, so nobody can fake one.</li>
                <li><b>Every 10 minutes.</b> A sweep reads the followed wallets&apos; decisions from X Layer, so an agent paying with its own code is covered too. Each decision is announced once.</li>
                <li><b>Commands.</b> <code>/list</code> shows what a chat follows; <code>/stop</code> ends every alert (or <code>/stop 0x…</code> one wallet). Works in groups too, for a team that shares a wallet.</li>
              </ul>
              <p className="small">What&apos;s in an alert is already public on X Layer. Fusebox stores only which chat follows which wallet; a chat that blocks the bot is forgotten.</p>
            </section>

            <section id="preflight">
              <h2>Pre-flight for any wallet</h2>
              <p>Not every agent will move its money into a Fusebox wallet on day one. Pre-flight lets any agent, on any wallet, run a payment through a line of TapeOut circuits before it signs. Each verdict is the circuit&apos;s own <code>eval</code> (or <code>step</code>, for circuits with latches) on X Layer, read-only and free. A Fusebox wallet keeps the context on-chain; with pre-flight you send it: what was spent today, whether the payee is saved and since when, which approvers signed, and the latch state from your last call, which comes back updated so the Breaker remembers.</p>
              <Code label="Any wallet · fusebox-sdk">{`import { preflight } from "fusebox-sdk";

const r = await preflight({
  line: [{ fuseId: 1, a: 50 }, { fuseId: 2, a: 24, b: 2 }, { fuseId: 3 }, { fuseId: 4, a: 20 }],
  payment: { amount: "2.5" },
  context: { spentToday: "10", payee: { saved: true, hoursSinceSaved: 72 }, approvals: 0, state: lastState },
});
if (!r.allowed) return;        // "Stopped by Payee Guard (the payee isn't in the payee book)…"
lastState = r.state;           // the Breaker remembers next time
await wallet.sendTransaction(…);`}</Code>
              <p>Over HTTP it&apos;s <code>POST /api/preflight</code> with the same body (<code>GET</code> returns an example), and MCP agents get <code>fusebox_preflight</code>. Any listed fuse works, rivals and Studio designs included. Pre-flight is advisory: the agent can still sign without asking. When you want the circuits to be the only way money moves, that&apos;s what a Fusebox wallet is for.</p>
            </section>

            <section id="guardrails">
              <h2>Plain-English guardrails</h2>
              <p>The wizard&apos;s first decision, which fuses and what settings, is the hardest for someone new to it. On <Link href="/app/new">Wire up a wallet</Link> you can describe the agent instead (&ldquo;it pays our three suppliers, never more than 80 a day, anything over 30 needs me and my partner&rdquo;) and get a proposed line: each fuse on or off with its settings, a plain reason for each, and test payments that show the line working, including what it stops.</p>
              <ul>
                <li><b>Who proposes it.</b> Claude Haiku 5.5 on NEAR AI Cloud, through a strict tool call; the answer is validated and clamped to what the circuits accept (8-bit settings). If the model is unavailable, Fusebox&apos;s rule reader proposes from the same description, and says so.</li>
                <li><b>Nothing is trusted blindly.</b> &ldquo;Test it on TapeOut&apos;s circuits&rdquo; opens the line simulator with the proposal&apos;s own test payments, and TapeOut&apos;s processor decides each one. &ldquo;Use this line&rdquo; fills the wizard, including any payee or approver addresses you mentioned, and you still review every number before you sign.</li>
              </ul>
            </section>

            <section id="designers">
              <h2>Sell a fuse</h2>
              <ol className="dsteps">
                <li><b>Design the circuit</b> as NAND gates (plus LATCH bits if it needs memory) against one socket&apos;s pinout. The repo&apos;s <a href="https://github.com/0xdopewilly/fusebox/tree/main/circuits" target="_blank" rel="noreferrer">circuits toolchain</a> builds, simulates and exhaustively tests TAP-02 netlists, and passes TapeOut&apos;s official test vectors.</li>
                <li><b>Tape it out</b> on an X Layer TapeOut processor: mint one transistor per gate and call <code>tapeout(netlist, nIn, nOut)</code>. You get the circuit NFT.</li>
                <li><b>List it</b> on the <Link href="/app/designers">designers page</Link>, or call <code>registry.list(processor, circuitId, socket, netlistHash, fee, uri)</code>. The registry checks the pinout, the gate budget (512), the state rules and the netlist hash against the chain.</li>
                <li><b>Earn on every decision</b>, the no&apos;s included. Claim with <code>claim(fuseId, to)</code>. Sell the NFT and the income moves with it. Wallet owners install your fuse from the <Link href="/app/market">fuse market</Link> in one signature.</li>
                <li><b>Or skip the toolchain.</b> <Link href="/app/studio">Fuse Studio</Link> builds the circuit from rules with no code: each group of conditions is <b>all of</b>, <b>any of</b>, <b>at least k of</b> or <b>none of</b>, and the groups combine with any or every (or N strikes for the Breaker socket). It compiles the rule to NAND gates with the same toolchain and proves the bytes against the rule: every input up to 24 (all 2^24 for the Daily Cap socket), every state and input for the Breaker, and for Payee Guard's 33 inputs every comparator exhaustively plus a million random payments, then mints the transistors, tapes it out and lists it from your wallet. Built there, Daily Cap and Two of Three come out byte-identical to circuits #15 and #18.</li>
                <li><b>Describe it.</b> A listing&apos;s <code>metadataURI</code> holds a small <code>fusebox-fuse/1</code> JSON (name, summary, description, rule). The designers page writes it on X Layer itself as a <code>data:application/json;base64</code> URI, so the description needs no host; an https link to the same JSON works too. Every fuse gets its own page, e.g. <Link href="/app/fuse/1">/app/fuse/1</Link>.</li>
                <li><b>Play gate golf.</b> The Studio&apos;s optimizer shrinks a rule&apos;s circuit (merging identical logic, folding constants, removing conditions another one already implies) and proves the smaller netlist gives the same answer on every input before it lets you tape it out. Fewer gates means fewer transistors to mint and less gas on every check, about 2,400 gas a gate. Fusebox&apos;s own eight circuits are already minimal; rules people write typically shrink by 5 to 75%.</li>
                <li><b>Try before you tape out.</b> From the Studio, send a draft to the <Link href="/app/simulate">line simulator</Link>: it is compiled and evaluated in the browser from the same bytes TapeOut would store, next to listed fuses, on any sequence of payments. A draft is also a link you can share; it reopens in the Studio as designed.</li>
                <li><b>Run it like a product.</b> From the designers page, change the fee (<code>setFee</code>), delist it from new installs (<code>setListed</code>) or link a page that explains it (<code>setMetadataURI</code>). A lower fee applies to everyone at once; a higher one only to wallets whose owner accepts it.</li>
              </ol>
              <p>Several designs can compete on one socket. The repo ships four rivals for the same sockets, exhaustively tested and rehearsed on a mainnet fork but not yet taped out on mainnet: <b>Per-Payment Cap</b> (no single payment over the cap), <b>Strict Payee Book</b> (no trial amount), <b>Two-Strike Breaker</b> (two latches: the first stranger is refused, the second blows it) and <b>Lead Approver</b> (seat 1 must be one of the two signers). A rival names its settings in its metadata, and the app labels them that way.</p>
              <p className="small">Business hours only, per-payee caps, velocity limits: there&apos;s room for many more fuses. The duplicate-invoice check is now the fifth: the Repeat Guard.</p>
            </section>

            <section id="contracts">
              <h2>Contracts</h2>
              <p>X Layer mainnet, chain 196. Two sets of contracts run side by side. <b>v2</b> (Nov 20) makes new wallets and holds the fuse market: its registry stores socket pinouts as data, so new kinds of fuse never need another registry, and its wallets can run the Repeat Guard. <b>v1</b> (Nov 15) holds Atlas and the first wallets, which keep working unchanged. Fuses 1–4 are the same circuits with the same ids on both. Every contract has verified source on <a href={`https://repo.sourcify.dev/196/${dep.v2.registry}`} target="_blank" rel="noreferrer">Sourcify</a> (exact match).</p>
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
            </section>

            <section id="security">
              <h2>Security</h2>
              <p><b>Unaudited.</b> The contracts are live on mainnet and Atlas holds small balances on purpose. Highlights of the threat model (full table in <a href="https://github.com/0xdopewilly/fusebox/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">ARCHITECTURE.md</a>):</p>
              <ul className="dots">
                <li><b>Fake processors can&apos;t pass.</b> The registry trusts a processor only by its runtime code hash, rechecked at every decision. If TapeOut upgrades its code, fuses read UNTRUSTED and payments stop, free, until the new code is attested.</li>
                <li><b>Prompt injection can&apos;t pick the inputs.</b> The agent supplies payee, amount and memo; every bit a fuse sees is built on-chain.</li>
                <li><b>A stolen agent key</b> still faces the caps, the payee book and approvals. The agent can freeze but never unfreeze.</li>
                <li><b>Approvals can&apos;t be replayed.</b> Each is bound to the chain, wallet, approver set, token, payee and amount, and expires.</li>
                <li><b>Bad listings are refused:</b> wrong pinout, a different netlist, over 512 gates, memory where it isn&apos;t allowed, or references to other circuits.</li>
              </ul>
              <p className="small">Remaining trust: TapeOut&apos;s factory owner can upgrade code (fails closed), USD₮0&apos;s issuer can freeze addresses, and the wallet owner is fully trusted.</p>
                          <p className="small">Live health of everything Fusebox depends on (X Layer&apos;s RPCs, TapeOut&apos;s processor trust, Atlas&apos;s fees, the AI agent, the x402 sellers, alerts) is on the <Link href="/app/status">status page</Link>, and as JSON at <code>/api/status</code>.</p>
            </section>

            <section id="glossary">
              <h2>Glossary</h2>
              <p>The same words the app explains when you tap them.</p>
              <dl className="gloss">
                {Object.values(GLOSSARY).map((g) => <div key={g.term}><dt>{g.term}</dt><dd>{g.say}</dd></div>)}
              </dl>
            </section>

            <section id="faq">
              <h2>FAQ</h2>
              <details><summary>Does the agent ever see or control the fuses?</summary><p>No. The agent&apos;s key can call <code>pay</code> and <code>freeze</code>. Fuses, limits, payees and approvers belong to the owner.</p></details>
              <details><summary>What does a payment cost?</summary><p>Gas on X Layer (fractions of a cent) plus the fees of the fuses on the line. On Atlas, all four fuses together cost 0.0045 USD₮0.</p></details>
              <details><summary>Why do blocked payments pay fees?</summary><p>Stopping the scam is the fuse&apos;s job. Daily budgets cap how much blocked attempts can cost.</p></details>
              <details><summary>Can I use my own circuit?</summary><p>Yes: tape it out for one of the five sockets and list it. Wallets can install it straight away (a Repeat Guard design needs a wallet made since Nov 20).</p></details>
              <details><summary>Is there a version with no server at all?</summary><p>The <Link href="/onchain">DeWEB edition</Link> is one self-contained page that reads X Layer from your browser, built to be stored on-chain at 15.2.272.tape and served by TapeKit.</p></details>
            </section>

            <footer className="docs-foot m">
              <span className="mute">Fusebox · MIT · <a href="https://github.com/0xdopewilly/fusebox" target="_blank" rel="noreferrer">GitHub ↗</a></span>
              <Link className="btn lime" href="/app"><span>Open the app</span> <span className="k">↗</span></Link>
            </footer>
          </article>
        </div>
      </main>
    </>
  );
}
