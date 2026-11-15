import Link from "next/link";
import type { Metadata } from "next";
import "./docs.css";
import SiteHeader from "@/components/site/SiteHeader";
import DocsNav from "@/components/docs/DocsNav";
import Code from "@/components/docs/Code";
import dep from "@/lib/deployments/mainnet.json";

export const metadata: Metadata = {
  title: "Docs · Fusebox",
  description: "How Fusebox works: wallets for AI agents whose payments must pass logic circuits taped out on TapeOut. Quickstart, the four fuses, the wallet API, MCP tools, selling a fuse, and every contract on X Layer.",
  openGraph: { title: "Fusebox docs · Build with Fusebox", description: "Quickstart, the four fuses, the wallet API, MCP tools, selling a fuse, and every contract on X Layer.", url: "/docs" },
  twitter: { title: "Fusebox docs · Build with Fusebox", description: "Quickstart, the four fuses, the wallet API, MCP tools, selling a fuse, and every contract on X Layer." },
};

const OKLINK = "https://www.oklink.com/xlayer";
const SECTIONS = [
  { id: "overview", title: "What Fusebox is", group: "Start" },
  { id: "quickstart", title: "Quickstart", group: "Start" },
  { id: "payment", title: "How a payment works", group: "Concepts" },
  { id: "fuses", title: "The four fuses", group: "Concepts" },
  { id: "fees", title: "Fees and budgets", group: "Concepts" },
  { id: "wallet", title: "The wallet API", group: "Build" },
  { id: "mcp", title: "MCP tools", group: "Build" },
  { id: "designers", title: "Sell a fuse", group: "Build" },
  { id: "contracts", title: "Contracts", group: "Reference" },
  { id: "security", title: "Security", group: "Reference" },
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
              <h3>2 · Give your agent the tools</h3>
              <p>The <a href="https://www.npmjs.com/package/fusebox-mcp" target="_blank" rel="noreferrer">fusebox-mcp</a> server works in Claude Code, Claude Desktop, Cursor and any MCP client. Without a key it&apos;s read-only and points at Atlas.</p>
              <Code label="Claude Code">{`claude mcp add fusebox -- npx -y fusebox-mcp`}</Code>
              <p>Then ask your agent: <i>&ldquo;Pay 2.5 USDT0 to 0x1111…1111, it&apos;s an urgent refund.&rdquo;</i> It runs <code>fusebox_check</code> first, sees Payee Guard and the Breaker say no, and tells you why.</p>
              <h3>3 · Wire up your own wallet</h3>
              <p><Link href="/app/new">Wire up a wallet</Link> walks you through it in about ten signatures: name the agent&apos;s address, pick fuses and limits, save payees, seat three approvers, and prepay fees in USDT0. Then give the agent its key and the wallet address:</p>
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
              <h2>The four fuses</h2>
              <p>A <b>socket</b> is the contract between the wallet and a circuit: the wallet derives the bits, the circuit decides. Bits are packed least-significant first (TAP-02 §5). Amounts are rounded up to the install&apos;s unit and saturate at 255, while owner limits stop at 254, so a saturated amount can never pass.</p>
              <div className="tbl-w" tabIndex={0} role="region" aria-label="The four fuses table"><table>
                <thead><tr><th>Fuse</th><th>Circuit</th><th>Inputs</th><th>Says no when</th><th>Fee</th></tr></thead>
                <tbody>
                  <tr><td><b>Daily Cap</b></td><td>#15 · 108 NAND</td><td>24: amount, spent today, cap</td><td>The payment would pass today&apos;s cap (UTC day)</td><td>0.001</td></tr>
                  <tr><td><b>Payee Guard</b></td><td>#16 · 79 NAND</td><td>33: saved?, age (h), cooldown, amount, trial</td><td>The payee isn&apos;t saved, or is new and over the trial amount</td><td>0.001</td></tr>
                  <tr><td><b>Breaker</b></td><td>#17 · 10 NAND + 1 LATCH</td><td>4: set, clear, attempt, suspect</td><td>A payment goes to a stranger: it latches and stays blown</td><td>0.0005</td></tr>
                  <tr><td><b>Two of Three</b></td><td>#18 · 46 NAND</td><td>19: three approver bits, amount, threshold</td><td>Over the threshold without two approvals for that exact payment</td><td>0.002</td></tr>
                </tbody>
              </table></div>
              <p className="small">Fees are in USDT0 per check; a payment checked by all four costs 0.0045. Every netlist is on TapeOut&apos;s processor, and the <Link href="/app/market">fuse market</Link> checks each one against the hash the registry pinned at listing.</p>
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
            </section>

            <section id="mcp">
              <h2>MCP tools</h2>
              <div className="tbl-w" tabIndex={0} role="region" aria-label="MCP tools table"><table>
                <thead><tr><th>Tool</th><th>What it does</th></tr></thead>
                <tbody>
                  <tr><td><code>fusebox_check</code></td><td>Dry-runs a payment against every fuse and returns each verdict with its reason. Free and read-only.</td></tr>
                  <tr><td><code>fusebox_pay</code></td><td>Pays in USDT0 through the fuses with the agent&apos;s key; reports paid or stopped, which fuse said no, the fee and the transaction.</td></tr>
                  <tr><td><code>fusebox_status</code></td><td>The wallet&apos;s balance, fee balance, fuses (and whether any is blown), today&apos;s spend and decision counts.</td></tr>
                </tbody>
              </table></div>
              <div className="tbl-w" tabIndex={0} role="region" aria-label="MCP settings table"><table>
                <thead><tr><th>Variable</th><th>Default</th><th>Meaning</th></tr></thead>
                <tbody>
                  <tr><td><code>FUSEBOX_WALLET</code></td><td>Atlas</td><td>The wallet the agent pays from</td></tr>
                  <tr><td><code>FUSEBOX_AGENT_KEY</code></td><td>none (read-only)</td><td>The agent key you named in the wizard. It can only ask the wallet to pay.</td></tr>
                  <tr><td><code>FUSEBOX_RPC</code></td><td>rpc.xlayer.tech</td><td>An X Layer RPC</td></tr>
                </tbody>
              </table></div>
            </section>

            <section id="designers">
              <h2>Sell a fuse</h2>
              <ol className="dsteps">
                <li><b>Design the circuit</b> as NAND gates (plus LATCH bits if it needs memory) against one socket&apos;s pinout. The repo&apos;s <a href="https://github.com/0xdopewilly/fusebox/tree/main/circuits" target="_blank" rel="noreferrer">circuits toolchain</a> builds, simulates and exhaustively tests TAP-02 netlists, and passes TapeOut&apos;s official test vectors.</li>
                <li><b>Tape it out</b> on an X Layer TapeOut processor: mint one transistor per gate and call <code>tapeout(netlist, nIn, nOut)</code>. You get the circuit NFT.</li>
                <li><b>List it</b> on the <Link href="/app/designers">designers page</Link>, or call <code>registry.list(processor, circuitId, socket, netlistHash, fee, uri)</code>. The registry checks the pinout, the gate budget (512), the state rules and the netlist hash against the chain.</li>
                <li><b>Earn on every decision</b>, the no&apos;s included. Claim with <code>claim(fuseId, to)</code>. Sell the NFT and the income moves with it. Wallet owners install your fuse from the <Link href="/app/market">fuse market</Link> in one signature.</li>
                <li><b>Run it like a product.</b> From the designers page, change the fee (<code>setFee</code>), delist it from new installs (<code>setListed</code>) or link a page that explains it (<code>setMetadataURI</code>). A lower fee applies to everyone at once; a higher one only to wallets whose owner accepts it.</li>
              </ol>
              <p className="small">Duplicate-invoice checks, business hours only, per-payee caps, velocity limits: there&apos;s room for many more fuses.</p>
            </section>

            <section id="contracts">
              <h2>Contracts</h2>
              <p>X Layer mainnet, chain 196. The registry, factory and Atlas have verified source on <a href={`https://repo.sourcify.dev/196/${dep.registry}`} target="_blank" rel="noreferrer">Sourcify</a> (exact match).</p>
              <div className="tbl-w" tabIndex={0} role="region" aria-label="Contract addresses table"><table className="addrs">
                <tbody>
                  <tr><td><b>FuseRegistry</b></td><td><A a={dep.registry} label={dep.registry} /></td></tr>
                  <tr><td><b>FuseboxFactory</b></td><td><A a={dep.factory} label={dep.factory} /></td></tr>
                  <tr><td><b>Atlas</b> (demo wallet)</td><td><A a={dep.atlas} label={dep.atlas} /></td></tr>
                  <tr><td><b>OrderGuard</b> (TapeOut processor)</td><td><A a={dep.processor} label={dep.processor} /></td></tr>
                  <tr><td><b>USDT0</b></td><td><A a={dep.usdt0} label={dep.usdt0} /></td></tr>
                  <tr><td><b>Circuits</b></td><td>#15 Daily Cap · #16 Payee Guard · #17 Breaker · #18 Two of Three (fuse ids 1–4)</td></tr>
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
              <p className="small">Remaining trust: TapeOut&apos;s factory owner can upgrade code (fails closed), USDT0&apos;s issuer can freeze addresses, and the wallet owner is fully trusted.</p>
            </section>

            <section id="faq">
              <h2>FAQ</h2>
              <details><summary>Does the agent ever see or control the fuses?</summary><p>No. The agent&apos;s key can call <code>pay</code> and <code>freeze</code>. Fuses, limits, payees and approvers belong to the owner.</p></details>
              <details><summary>What does a payment cost?</summary><p>Gas on X Layer (fractions of a cent) plus the fees of the fuses on the line. On Atlas, all four fuses together cost 0.0045 USDT0.</p></details>
              <details><summary>Why do blocked payments pay fees?</summary><p>Stopping the scam is the fuse&apos;s job. Daily budgets cap how much blocked attempts can cost.</p></details>
              <details><summary>Can I use my own circuit?</summary><p>Yes: tape it out for one of the four sockets and list it. Wallets can install it straight away.</p></details>
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
