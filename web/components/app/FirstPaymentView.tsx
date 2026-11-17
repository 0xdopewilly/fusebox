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

const erc20 = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "t", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
const rand = () => getAddress("0x" + Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, "0")).join(""));
const Tag = ({ ok, children }: { ok: boolean | null; children: React.ReactNode }) => <span className={`mtag ${ok === null ? "dim" : ok ? "ok" : "no"}`}>{children}</span>;

/** Your first real payment: the wallet is funded, the agent has gas and a payee is saved; then the agent pays for real,
 *  and a payment to a stranger is checked (read-only, so the Breaker doesn't trip) to show the fuses stopping it. */
export default function FirstPaymentView() {
  const { account, write, send } = useWallet();
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
  useEffect(() => { gasNeeded().then(setNeed).catch(() => {}); }, []);
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
      <PageChrome title="First payment" sub="Your wallet, for real" />
      <div className="mtitle">No wallet here yet</div>
      <p className="mcap">Wire up a wallet first. It takes about ten signatures, and Fusebox can make your agent&apos;s key for you.</p>
      <Link className="btn lime" style={{ justifyContent: "center", height: 52 }} href="/app/new">Wire up a wallet <span className="k">→</span></Link>
    </div>
  );
  if (!a || a.isAtlas) return <div className="mpage first"><PageChrome title="First payment" sub={short(wallet)} /><Loading label="Reading your wallet from X Layer" error={error} /></div>;

  const owner = !!account && account.toLowerCase() === a.owner.toLowerCase();
  const W = { address: wallet, abi: fuseboxWalletAbi } as const;
  const funded = Number(a.balance) >= Number(amount || 0.01);
  const hasGas = agentOkb !== null && agentOkb > 0n && (need === null || agentOkb >= need);
  const hasPayee = a.payees.length > 0;
  const ready = funded && hasGas && hasPayee && Number(a.feeBalance) > 0;
  const last = q.steps[q.steps.length - 1];
  const status = last && <p className="m mute" role="status">{last.label}: {last.state === "done" ? "done" : last.state === "error" ? last.error : last.state === "mine" ? "confirming…" : "sign in your wallet…"}</p>;
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
      <PageChrome title="First payment" sub={`Wallet ${short(wallet)}`}
        info={<><p>This is your own wallet on X Layer mainnet. The agent pays for real here, signed in this browser with its key; every fuse decides in the same transaction.</p><p>The stranger test is a read-only check, so your Breaker doesn&apos;t trip. On a real payment to a stranger it would trip and stay tripped until you reset it.</p></>} />
      <div><div className="mtitle">Your first real payment</div><p className="mcap" style={{ marginTop: 8 }}>Three things to have, then your agent pays someone you saved, for real.</p></div>

      <MLabel>Get ready</MLabel>
      <div className="mrows">
        <MRow icon={<Glyph name="coin" size={16} />} title="Money in the wallet" sub={`${Number(a.balance).toFixed(4)} USD₮0 · fees for ${Math.floor(Number(a.feeBalance) / Math.max(1e-9, a.fuses.reduce((t, f) => t + Number(f.fee), 0)))} payments`} value={<Tag ok={funded}>{funded ? "Ready" : "Add some"}</Tag>} chev={false} />
        <MRow icon={<Glyph name="status" size={16} />} title="Gas for your agent" sub={agentAddr ? `${short(agentAddr)} · ${agentOkb === null ? "…" : (Number(agentOkb) / 1e18).toFixed(5)} OKB${need !== null && !hasGas ? ` · needs ${(Number(need) / 1e18).toFixed(5)}` : ""}` : "no agent found"} value={<Tag ok={agentOkb === null ? null : hasGas}>{hasGas ? "Ready" : "Needs OKB"}</Tag>} chev={false} />
        <MRow icon={<Glyph name="approve" size={16} />} title="A saved payee" sub={hasPayee ? `${a.payees.length} saved · ${short(a.payees[0].address)}` : "none yet"} value={<Tag ok={hasPayee}>{hasPayee ? "Ready" : "Save one"}</Tag>} chev={false} />
      </div>
      {(!funded || !hasGas || !hasPayee) && (!account ? <><p className="mnote">Connect the owner wallet to fix what&apos;s missing.</p><ConnectChoices /></>
        : !owner ? <p className="mnote">Connected as {short(account)}, but the owner is {short(a.owner)}. Connect the owner to fix what&apos;s missing.</p>
        : <div className="mcard mpay">
          {!funded && <div className="mfield-row"><label className="mfield"><span className="m">Add USD₮0 to the wallet</span><input aria-label="USD₮0 to add" value={fund} onChange={(e) => setFund(e.target.value)} inputMode="decimal" /></label><button className="btn lime fieldbtn" disabled={q.running} onClick={() => q.start([{ id: "fund", label: "Add USD₮0", run: () => write({ address: DEP.usdt0 as Address, abi: erc20, functionName: "transfer", args: [wallet, parseUnits(fund || "0", 6)] }) }], {})}>Add</button></div>}
          {!hasGas && agentAddr && <div className="mfield-row"><label className="mfield"><span className="m">Send your agent gas · OKB</span><input aria-label="Agent gas, OKB" value={gas} onChange={(e) => setGas(e.target.value)} inputMode="decimal" /></label><button className="btn lime fieldbtn" disabled={q.running} onClick={() => q.start([{ id: "gas", label: "Send your agent gas", run: () => send(agentAddr, parseEther(gas || "0")) }], {})}>Send</button></div>}
          {!hasPayee && <div className="mfield-row"><label className="mfield"><span className="m">Save a payee (an address you control works)</span><input aria-label="Payee to save" value={newPayee} onChange={(e) => setNewPayee(e.target.value)} placeholder="0x…" spellCheck={false} /></label><button className="btn lime fieldbtn" disabled={q.running || !isAddress(newPayee.trim(), { strict: false })} onClick={() => q.start([{ id: "payee", label: "Save the payee", run: () => write({ ...W, functionName: "addPayee", args: [getAddress(newPayee.trim().toLowerCase())] }) }], {})}>Save</button></div>}
          {status}
        </div>)}

      <MLabel>Pay as your agent</MLabel>
      {!key ? (
        <div className="mcard mpay">
          <p className="mcap">Your agent&apos;s key isn&apos;t in this browser. Either let your agent do it, or paste the key to pay from here.</p>
          <p className="mnote">Ask your agent: <i>&ldquo;Pay {hasPayee ? short(a.payees[0].address) : "my saved payee"} {amount} USD₮0.&rdquo;</i> {newOnes > 0 ? <b className="lime">It landed: {newOnes} new payment{newOnes > 1 ? "s" : ""}. Open your wallet to see it.</b> : <>Watching for it… <span className="live" /></>}</p>
          <div className="mfield-row"><label className="mfield"><span className="m">Or paste the agent key</span><input aria-label="Agent private key" value={imp} onChange={(e) => setImp(e.target.value)} placeholder="0x… (64 hex characters)" spellCheck={false} type="password" /></label>
            <button className="btn fieldbtn" disabled={!keyFrom(imp)} onClick={() => { const k = keyFrom(imp)!; saveAgentKey(wallet, k); setKey(k); setImp(""); }}>Use it</button></div>
          {imp && !keyFrom(imp) && <p className="mnote" style={{ color: "var(--red)" }}>That isn&apos;t a private key.</p>}
        </div>
      ) : (
        <div className="mcard mpay">
          <label className="mfield"><span className="m">Pay</span>
            <select aria-label="Saved payee" value={payee} onChange={(e) => setPayee(e.target.value)}>{a.payees.map((p) => <option key={p.address} value={p.address}>{short(p.address)}</option>)}</select></label>
          <label className="mfield"><span className="m">Amount · USD₮0</span><input aria-label="Amount, USD₮0" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
          <button className="btn lime" style={{ justifyContent: "center", height: 52 }} disabled={!ready || paying || !payee} onClick={pay}>{paying ? "Your fuses are deciding…" : `Pay ${amount} USD₮0 as the agent`} <span className="k">→</span></button>
          {!ready && <p className="mnote">Finish getting ready first.</p>}
          {payErr && <p className="mnote" style={{ color: "var(--red)" }} role="alert">{payErr}</p>}
        </div>
      )}
      {paid && (
        <div className={`mverdict ${paid.allowed ? "ok" : "no"}`} aria-live="polite">
          <span className="m">Payment #{paid.decisionId} · on X Layer</span>
          <b>{paid.allowed ? "Paid. Every fuse said yes." : "Stopped by your fuses"}</b>
          <div className="mrows">{a.fuses.map((f, i) => <MRow key={f.slot} title={f.name} value={<Tag ok={paid.status[i] === "pass"}>{paid.status[i] === "pass" ? "Passed" : "Stopped"}</Tag>} chev={false} />)}</div>
          <a className="m lime" href={`${OKLINK}/tx/${paid.hash}`} target="_blank" rel="noreferrer">See the transaction ↗</a>
        </div>
      )}

      <MLabel>Now a stranger</MLabel>
      <p className="mcap">The same payment to an address you never saved. Read-only, so nothing trips.</p>
      <button className="btn" style={{ justifyContent: "center", height: 48 }} onClick={tryStranger}>Check a payment to a stranger</button>
      {stranger && (
        <div className={`mverdict ${stranger.check.allowed ? "ok" : "no"}`}>
          <span className="m">1 USD₮0 → {short(stranger.to)} · read-only check</span>
          <b>{stranger.check.allowed ? "It would pass" : "Your fuses would stop it"}</b>
          <div className="mrows">{a.fuses.map((f, i) => <MRow key={f.slot} title={f.name} value={<Tag ok={stranger.check.status[i] === "pass"}>{stranger.check.status[i] === "pass" ? "Passed" : "Stopped"}</Tag>} chev={false} />)}</div>
        </div>
      )}

      {(paid?.allowed || newOnes > 0) && <>
        <MLabel>You&apos;re set</MLabel>
        <div className="mrows">
          <MRow href={`/app/assistant?wallet=${wallet}`} icon={<Glyph name="rob" size={16} />} title="Pay by chatting" sub="The Fusebox assistant" />
          <MRow href={`/app/w/${wallet}`} icon={<Glyph name="mine" size={16} />} title="Your wallet" sub="Every payment, paid or stopped" />
        </div>
        <MLabel>Connect your agent</MLabel>
        <AgentConnect wallet={wallet} agentKey={key?.key} />
      </>}
    </div>
  );
}
