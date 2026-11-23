"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, parseEther, parseUnits, type Address } from "viem";
import { fuseboxWalletAbi } from "@/lib/abi";
import { DEP, pub } from "@/lib/client-chain";
import { OKLINK, short, useAtlas } from "@/lib/hooks";
import { agentPay, checkFor, gasNeeded, type CheckView, type PayResult } from "@/lib/agentPay";
import { keyFrom, loadAgentKey, saveAgentKey, walletsWithKeys, type AgentKey } from "@/lib/agentKey";
import { useTxQueue } from "@/lib/useTxQueue";
import { useWallet } from "./WalletProvider";
import ConnectChoices from "./ConnectChoices";
import AgentConnect from "./AgentConnect";
import Loading from "./Loading";
import { Glyph } from "./Pixel";
import { PageChrome } from "./m/chrome";
import { MLabel, MRow } from "./m/ui";
import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";

/** lib/agentPay's error lines in Chinese (anything else goes through errZh, which returns unknown text as it was). */
const payErrZh = (m: string) => {
  const EX: Record<string, string> = {
    "This key isn't an agent of that wallet.": "这个密钥不是该钱包的智能体。",
    "The wallet is frozen. The owner can unfreeze it.": "钱包已冻结，所有者可以解冻。",
    "The wallet's daily decision limit is reached.": "钱包已达到每日决策上限。",
    "Too many stopped payments today: the wallet stopped taking more.": "今天被拦截的付款太多：钱包已停止接受新的付款。",
    "The agent has no OKB for gas. Send it a little first.": "智能体没有 OKB 支付 gas，请先给它发一点。",
    "The transaction landed but recorded no decision.": "交易已上链，但没有记录到决策。",
  };
  if (EX[m]) return EX[m];
  const r = /^The wallet refused: (.*)\.$/.exec(m);
  if (r) return `钱包拒绝了：${r[1]}。`;
  const g = /^Your agent needs a little more OKB for gas: it holds (\S+), a payment needs about (\S+) up front\.$/.exec(m);
  if (g) return `你的智能体需要多一点 OKB 支付 gas：它持有 ${g[1]}，一笔付款约需预留 ${g[2]}。`;
  return errZh(m);
};

const erc20 =[{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "t", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
const rand = () => getAddress("0x" + Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, "0")).join(""));
const Tag = ({ ok, children }: { ok: boolean | null; children: React.ReactNode }) => <span className={`mtag ${ok === null ? "dim" : ok ? "ok" : "no"}`}>{children}</span>;

/** Your first real payment: the wallet is funded, the agent has gas and a payee is saved; then the agent pays for real,
 *  and a payment to a stranger is checked (read-only, so the Breaker doesn't trip) to show the fuses stopping it. */
export default function FirstPaymentView() {
  const { account, write, send } = useWallet();
  const { t: tr, zh } = useLang();
  const q = useTxQueue<object>();
  const [wallet, setWallet] = useState<Address | null>(null);
  useEffect(() => {
    const w = new URLSearchParams(window.location.search).get("wallet");
    if (w && isAddress(w, { strict: false })) { setWallet(getAddress(w.toLowerCase())); return; }
    const mine = walletsWithKeys();
    if (mine[0]) { setWallet(mine[0]); return; }
    try { const l = JSON.parse(localStorage.getItem("fusebox:mine") || "[]"); if (l[0]?.address) setWallet(getAddress(l[0].address)); } catch {}
  }, []);
  const { data: a, error, reload } = useAtlas(6000, wallet ? `/api/wallet/${wallet}` : "/api/atlas");
  const [key, setKey] = useState<AgentKey | null>(null);
  useEffect(() => { if (wallet) setKey(loadAgentKey(wallet)); }, [wallet]);
  const agentAddr = key?.address ?? (a && !a.isAtlas ? a.agents?.[0] ?? a.agent : undefined);
  const [agentOkb, setAgentOkb] = useState<bigint | null>(null);
  const [need, setNeed] = useState<bigint | null>(null);
  useEffect(() => { gasNeeded(a?.fuses.length).then(setNeed).catch(() => {}); }, [a?.fuses.length]);
  useEffect(() => {
    if (!agentAddr) return;
    let live = true;
    const pull = () => pub.getBalance({ address: agentAddr }).then((b) => { if (live) setAgentOkb(b); }).catch(() => {});
    pull(); const id = setInterval(pull, 8000);
    return () => { live = false; clearInterval(id); };
  }, [agentAddr]);

  const [fund, setFund] = useState("0.1"); const [gas, setGas] = useState("0.0005"); const [newPayee, setNewPayee] = useState("");
  const [payee, setPayee] = useState<string>(""); const [amount, setAmount] = useState("0.01");
  const [paid, setPaid] = useState<PayResult | null>(null); const [payErr, setPayErr] = useState<string | null>(null); const [paying, setPaying] = useState(false);
  const [stranger, setStranger] = useState<{ to: Address; check: CheckView } | null>(null);
  const [imp, setImp] = useState(""); const startCount = useMemo(() => a?.counts.decisions ?? null, [a?.wallet]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (a?.payees[0] && !payee) setPayee(a.payees[0].address); }, [a, payee]);

  if (!wallet) return (
    <div className="mpage first">
      <PageChrome title={tr("First payment", "第一笔付款")} sub={tr("Your wallet, for real", "你的钱包，真实付款")} />
      <div className="mtitle">{tr("No wallet here yet", "这里还没有钱包")}</div>
      <p className="mcap">{tr(<>Wire up a wallet first. It takes about ten signatures, and Fusebox can make your agent&apos;s key for you.</>, <>请先搭建一个钱包。大约需要十次签名，Fusebox 可以帮你生成智能体密钥。</>)}</p>
      <Link className="btn lime" style={{ justifyContent: "center", height: 52 }} href="/app/new">{tr("Wire up a wallet", "搭建一个钱包")} <span className="k">→</span></Link>
    </div>
  );
  if (!a || a.isAtlas) return <div className="mpage first"><PageChrome title={tr("First payment", "第一笔付款")} sub={short(wallet)} /><Loading label={tr("Reading your wallet from X Layer", "正在从 X Layer 读取你的钱包")} error={error} /></div>;

  const owner = !!account && account.toLowerCase() === a.owner.toLowerCase();
  const W = { address: wallet, abi: fuseboxWalletAbi } as const;
  const funded = Number(a.balance) >= Number(amount || 0.01);
  const hasGas = agentOkb !== null && agentOkb > 0n && (need === null || agentOkb >= need);
  const hasPayee = a.payees.length > 0;
  const ready = funded && hasGas && hasPayee && Number(a.feeBalance) > 0;
  const last = q.steps[q.steps.length - 1];
  const status = last && <p className="m mute" role="status">{last.label}{tr(": ", "：")}{last.state === "done" ? tr("done", "完成") : last.state === "error" ? (zh && last.error ? errZh(last.error) : last.error) : last.state === "mine" ? tr("confirming…", "确认中…") : tr("sign in your wallet…", "请在钱包中签名…")}</p>;
  const newOnes = startCount !== null ? a.counts.decisions - startCount : 0;
  const pay = async () => {
    if (!key || !payee) return;
    setPaying(true); setPayErr(null); setPaid(null);
    try {
      setPaid(await agentPay(key.key, wallet, getAddress(payee), amount, "My first Fusebox payment"));
      reload(); if (agentAddr) pub.getBalance({ address: agentAddr }).then(setAgentOkb).catch(() => {});
    }
    catch (e) { setPayErr((e as Error).message); } finally { setPaying(false); }
  };
  const tryStranger = async () => { const to = rand(); setStranger({ to, check: await checkFor(wallet, to, "1") }); };

  return (
    <div className="mpage first">
      <PageChrome title={tr("First payment", "第一笔付款")} sub={tr(`Wallet ${short(wallet)}`, `钱包 ${short(wallet)}`)}
        info={tr(<><p>This is your own wallet on X Layer mainnet. The agent pays for real here, signed in this browser with its key; every fuse decides in the same transaction.</p><p>The stranger test is a read-only check, so your Breaker doesn&apos;t trip. On a real payment to a stranger it would trip and stay tripped until you reset it.</p></>,
          <><p>这是你自己在 X Layer 主网上的钱包。智能体在这里真实付款，用它的密钥在本浏览器中签名；每个保险丝都在同一笔交易中做出决策。</p><p>陌生地址测试是只读检查，所以你的 Breaker 不会触发。如果真的向陌生地址付款，它会触发并保持触发，直到你重置。</p></>)} />
      <div><div className="mtitle">{tr("Your first real payment", "你的第一笔真实付款")}</div><p className="mcap" style={{ marginTop: 8 }}>{tr("Three things to have, then your agent pays someone you saved, for real.", "准备好三样东西，然后你的智能体就会向你保存的收款方真实付款。")}</p></div>

      <MLabel>{tr("Get ready", "准备")}</MLabel>
      <div className="mrows">
        <MRow icon={<Glyph name="coin" size={16} />} title={tr("Money in the wallet", "钱包里的资金")} sub={tr(`${Number(a.balance).toFixed(4)} USD₮0 · fees for ${Math.floor(Number(a.feeBalance) / Math.max(1e-9, a.fuses.reduce((t, f) => t + Number(f.fee), 0)))} payments`, `${Number(a.balance).toFixed(4)} USD₮0 · 费用够 ${Math.floor(Number(a.feeBalance) / Math.max(1e-9, a.fuses.reduce((t, f) => t + Number(f.fee), 0)))} 笔付款`)} value={<Tag ok={funded}>{funded ? tr("Ready", "就绪") : tr("Add some", "需充值")}</Tag>} chev={false} />
        <MRow icon={<Glyph name="status" size={16} />} title={tr("Gas for your agent", "智能体的 gas")} sub={agentAddr ? `${short(agentAddr)} · ${agentOkb === null ? "…" : (Number(agentOkb) / 1e18).toFixed(5)} OKB${need !== null && !hasGas ? tr(` · needs ${(Number(need) / 1e18).toFixed(5)}`, ` · 需要 ${(Number(need) / 1e18).toFixed(5)}`) : ""}` : tr("no agent found", "未找到智能体")} value={<Tag ok={agentOkb === null ? null : hasGas}>{hasGas ? tr("Ready", "就绪") : tr("Needs OKB", "需要 OKB")}</Tag>} chev={false} />
        <MRow icon={<Glyph name="approve" size={16} />} title={tr("A saved payee", "一个已保存的收款方")} sub={hasPayee ? tr(`${a.payees.length} saved · ${short(a.payees[0].address)}`, `已保存 ${a.payees.length} 个 · ${short(a.payees[0].address)}`) : tr("none yet", "暂无")} value={<Tag ok={hasPayee}>{hasPayee ? tr("Ready", "就绪") : tr("Save one", "需保存")}</Tag>} chev={false} />
      </div>
      {(!funded || !hasGas || !hasPayee) && (!account ? <><p className="mnote">{tr(<>Connect the owner wallet to fix what&apos;s missing.</>, <>连接所有者钱包，补齐缺少的部分。</>)}</p><ConnectChoices /></>
        : !owner ? <p className="mnote">{tr(<>Connected as {short(account)}, but the owner is {short(a.owner)}. Connect the owner to fix what&apos;s missing.</>, <>当前连接的是 {short(account)}，但所有者是 {short(a.owner)}。请连接所有者钱包来补齐缺少的部分。</>)}</p>
        : <div className="mcard mpay">
          {!funded && <div className="mfield-row"><label className="mfield"><span className="m">{tr("Add USD₮0 to the wallet", "向钱包添加 USD₮0")}</span><input aria-label={tr("USD₮0 to add", "要添加的 USD₮0")} value={fund} onChange={(e) => setFund(e.target.value)} inputMode="decimal" /></label><button className="btn lime fieldbtn" disabled={q.running} onClick={() => q.start([{ id: "fund", label: tr("Add USD₮0", "添加 USD₮0"), run: () => write({ address: DEP.usdt0 as Address, abi: erc20, functionName: "transfer", args: [wallet, parseUnits(fund || "0", 6)] }) }], {})}>{tr("Add", "添加")}</button></div>}
          {!hasGas && agentAddr && <div className="mfield-row"><label className="mfield"><span className="m">{tr("Send your agent gas · OKB", "给智能体发送 gas · OKB")}</span><input aria-label={tr("Agent gas, OKB", "智能体 gas，OKB")} value={gas} onChange={(e) => setGas(e.target.value)} inputMode="decimal" /></label><button className="btn lime fieldbtn" disabled={q.running} onClick={() => q.start([{ id: "gas", label: tr("Send your agent gas", "给智能体发送 gas"), run: () => send(agentAddr, parseEther(gas || "0")) }], {})}>{tr("Send", "发送")}</button></div>}
          {!hasPayee && <div className="mfield-row"><label className="mfield"><span className="m">{tr("Save a payee (an address you control works)", "保存一个收款方（你自己控制的地址也可以）")}</span><input aria-label={tr("Payee to save", "要保存的收款方")} value={newPayee} onChange={(e) => setNewPayee(e.target.value)} placeholder="0x…" spellCheck={false} /></label><button className="btn lime fieldbtn" disabled={q.running || !isAddress(newPayee.trim(), { strict: false })} onClick={() => q.start([{ id: "payee", label: tr("Save the payee", "保存收款方"), run: () => write({ ...W, functionName: "addPayee", args: [getAddress(newPayee.trim().toLowerCase())] }) }], {})}>{tr("Save", "保存")}</button></div>}
          {status}
        </div>)}

      <MLabel>{tr("Pay as your agent", "以智能体身份付款")}</MLabel>
      {!key ? (
        <div className="mcard mpay">
          <p className="mcap">{tr(<>Your agent&apos;s key isn&apos;t in this browser. Either let your agent do it, or paste the key to pay from here.</>, <>你的智能体密钥不在本浏览器中。可以让你的智能体自己付款，或者粘贴密钥在这里付款。</>)}</p>
          <p className="mnote">{tr(<>Ask your agent: <i>&ldquo;Pay {hasPayee ? short(a.payees[0].address) : "my saved payee"} {amount} USD₮0.&rdquo;</i></>, <>对你的智能体说：<i>“向{hasPayee ? ` ${short(a.payees[0].address)} ` : "我保存的收款方"}支付 {amount} USD₮0。”</i></>)} {newOnes > 0 ? <b className="lime">{tr(`It landed: ${newOnes} new payment${newOnes > 1 ? "s" : ""}. Open your wallet to see it.`, `已上链：${newOnes} 笔新付款。打开你的钱包查看。`)}</b> : <>{tr("Watching for it…", "正在等待…")} <span className="live" /></>}</p>
          <div className="mfield-row"><label className="mfield"><span className="m">{tr("Or paste the agent key", "或粘贴智能体密钥")}</span><input aria-label={tr("Agent private key", "智能体私钥")} value={imp} onChange={(e) => setImp(e.target.value)} placeholder={tr("0x… (64 hex characters)", "0x…（64 位十六进制字符）")} spellCheck={false} type="password" /></label>
            <button className="btn fieldbtn" disabled={!keyFrom(imp)} onClick={() => { const k = keyFrom(imp)!; saveAgentKey(wallet, k); setKey(k); setImp(""); }}>{tr("Use it", "使用")}</button></div>
          {imp && !keyFrom(imp) && <p className="mnote" style={{ color: "var(--red)" }}>{tr(<>That isn&apos;t a private key.</>, <>这不是有效的私钥。</>)}</p>}
        </div>
      ) : (
        <div className="mcard mpay">
          <label className="mfield"><span className="m">{tr("Pay", "付给")}</span>
            <select aria-label={tr("Saved payee", "已保存的收款方")} value={payee} onChange={(e) => setPayee(e.target.value)}>{a.payees.map((p) => <option key={p.address} value={p.address}>{short(p.address)}</option>)}</select></label>
          <label className="mfield"><span className="m">{tr("Amount · USD₮0", "金额 · USD₮0")}</span><input aria-label={tr("Amount, USD₮0", "金额，USD₮0")} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
          <button className="btn lime" style={{ justifyContent: "center", height: 52 }} disabled={!ready || paying || !payee} onClick={pay}>{paying ? tr("Your fuses are deciding…", "你的保险丝正在决策…") : tr(`Pay ${amount} USD₮0 as the agent`, `以智能体身份支付 ${amount} USD₮0`)} <span className="k">→</span></button>
          {!ready && <p className="mnote">{tr("Finish getting ready first.", "请先完成准备。")}</p>}
          {payErr && <p className="mnote" style={{ color: "var(--red)" }} role="alert">{zh ? payErrZh(payErr) : payErr}</p>}
        </div>
      )}
      {paid && (
        <div className={`mverdict ${paid.allowed ? "ok" : "no"}`} aria-live="polite">
          <span className="m">{tr(`Payment #${paid.decisionId} · on X Layer`, `付款 #${paid.decisionId} · X Layer 链上`)}</span>
          <b>{paid.allowed ? tr("Paid. Every fuse said yes.", "已付款。每个保险丝都说了“是”。") : tr("Stopped by your fuses", "被你的保险丝拦截")}</b>
          <div className="mrows">{a.fuses.map((f, i) => <MRow key={f.slot} title={f.name} value={<Tag ok={paid.status[i] === "pass"}>{paid.status[i] === "pass" ? tr("Passed", "通过") : tr("Stopped", "已拦截")}</Tag>} chev={false} />)}</div>
          <a className="m lime" href={`${OKLINK}/tx/${paid.hash}`} target="_blank" rel="noreferrer">{tr("See the transaction ↗", "查看交易 ↗")}</a>
        </div>
      )}

      <MLabel>{tr("Now a stranger", "再试陌生地址")}</MLabel>
      <p className="mcap">{tr("The same payment to an address you never saved. Read-only, so nothing trips.", "同样的付款，发给一个你从未保存过的地址。只读检查，不会触发任何保险丝。")}</p>
      <button className="btn" style={{ justifyContent: "center", height: 48 }} onClick={tryStranger}>{tr("Check a payment to a stranger", "检查一笔付给陌生地址的付款")}</button>
      {stranger && (
        <div className={`mverdict ${stranger.check.allowed ? "ok" : "no"}`}>
          <span className="m">1 USD₮0 → {short(stranger.to)} · {tr("read-only check", "只读检查")}</span>
          <b>{stranger.check.allowed ? tr("It would pass", "它会通过") : tr("Your fuses would stop it", "你的保险丝会拦截它")}</b>
          <div className="mrows">{a.fuses.map((f, i) => <MRow key={f.slot} title={f.name} value={<Tag ok={stranger.check.status[i] === "pass"}>{stranger.check.status[i] === "pass" ? tr("Passed", "通过") : tr("Stopped", "已拦截")}</Tag>} chev={false} />)}</div>
        </div>
      )}

      {(paid?.allowed || newOnes > 0) && <>
        <MLabel>{tr(<>You&apos;re set</>, <>一切就绪</>)}</MLabel>
        <div className="mrows">
          <MRow href={`/app/assistant?wallet=${wallet}`} icon={<Glyph name="rob" size={16} />} title={tr("Pay by chatting", "聊天付款")} sub={tr("The Fusebox assistant", "Fusebox 助手")} />
          <MRow href={`/app/w/${wallet}`} icon={<Glyph name="mine" size={16} />} title={tr("Your wallet", "你的钱包")} sub={tr("Every payment, paid or stopped", "每一笔付款，已付或已拦截")} />
        </div>
        <MLabel>{tr("Connect your agent", "连接你的智能体")}</MLabel>
        <AgentConnect wallet={wallet} agentKey={key?.key} />
      </>}
    </div>
  );
}
