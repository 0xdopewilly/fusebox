"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeEventLog, isAddress, parseUnits, getAddress, toHex, type Address } from "viem";
import { fuseboxFactoryAbi, fuseboxWalletAbi, fuseRegistryAbi } from "@/lib/abi";
import { DEP, pub } from "@/lib/client-chain";
import { useTxQueue, type TxStep } from "@/lib/useTxQueue";
import { short, OKLINK } from "@/lib/hooks";
import { useMarket } from "@/lib/useMarket";
import { useWallet } from "./WalletProvider";

const erc20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "t", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
const USDT = 1_000_000n;
const FUSES = [
  { key: "daily-cap", id: DEP.fuseIds[0], name: "Daily Cap", fee: 1000n, say: "No more than your cap in a UTC day, however the agent is asked." },
  { key: "payee-guard", id: DEP.fuseIds[1], name: "Payee Guard", fee: 1000n, say: "Saved payees only. A newly saved payee gets a small trial amount until its cooling-off ends." },
  { key: "breaker", id: DEP.fuseIds[2], name: "Breaker", fee: 500n, say: "Trips on a payment to a stranger and stays blown until you reset it." },
  { key: "approval-2of3", id: DEP.fuseIds[3], name: "Two of Three", fee: 2000n, say: "Above a threshold, two of three approvers must sign that exact payment." },
] as const;
type Key = (typeof FUSES)[number]["key"];
interface Ctx { wallet?: Address; block?: number }
const clamp = (v: string) => Math.max(0, Math.min(254, Math.floor(Number(v) || 0)));

/** Starting points: a whole line with its limits, and why it fits that kind of agent. */
const STARTERS: { id: string; name: string; why: string; on: Record<Key, boolean>; cap: string; cool: string; trial: string; thr: string }[] = [
  { id: "invoice", name: "Invoice agent", why: "Pays a known set of suppliers. New bank details get a test payment, never the invoice; big ones need two people.",
    on: { "daily-cap": true, "payee-guard": true, breaker: true, "approval-2of3": true }, cap: "50", cool: "24", trial: "2", thr: "20" },
  { id: "procure", name: "Procurement bot", why: "Larger, less frequent orders. A higher cap and threshold, a longer cooling-off for a new vendor.",
    on: { "daily-cap": true, "payee-guard": true, breaker: true, "approval-2of3": true }, cap: "200", cool: "72", trial: "5", thr: "50" },
  { id: "refund", name: "Refund desk", why: "Pays customers it has never paid before, so no payee book or Breaker: the daily cap and approvals carry the weight.",
    on: { "daily-cap": true, "payee-guard": false, breaker: false, "approval-2of3": true }, cap: "100", cool: "24", trial: "2", thr: "10" },
  { id: "allowance", name: "Small allowance", why: "For a new or experimental agent: a few USDT0 a day, saved payees only, one stranger blows it.",
    on: { "daily-cap": true, "payee-guard": true, breaker: true, "approval-2of3": false }, cap: "10", cool: "24", trial: "1", thr: "20" },
];

function Toggle({ on, flip, name }: { on: boolean; flip: () => void; name: string }) {
  return <span className={`tg${on ? " on" : ""}`} role="checkbox" aria-checked={on} aria-label={`Splice in ${name}`} tabIndex={0} onClick={flip} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } }} data-cursor={on ? "Remove" : "Add"} />;
}
function Field({ label, v, set, suffix }: { label: string; v: string; set: (s: string) => void; suffix?: string }) {
  return <div className="field m"><label>{label}{suffix ? ` (${suffix})` : ""}</label><input aria-label={suffix ? `${label} (${suffix})` : label} value={v} onChange={(e) => set(e.target.value)} inputMode="decimal" /></div>;
}

export default function NewWalletView() {
  const { account, wallets, connect, write } = useWallet();
  const q = useTxQueue<Ctx>();
  // designers can reprice their fuses, so the wizard reads today's fee and accepts exactly that
  const { data: market } = useMarket();
  const feeOf = (f: (typeof FUSES)[number]) => { const m = market?.fuses.find((x) => x.fuseId === f.id); return m ? parseUnits(m.fee, 6) : f.fee; };
  const [agent, setAgent] = useState("");
  const [on, setOn] = useState<Record<Key, boolean>>({ "daily-cap": true, "payee-guard": true, breaker: true, "approval-2of3": true });
  const [cap, setCap] = useState("50"); const [cool, setCool] = useState("24"); const [trial, setTrial] = useState("2"); const [thr, setThr] = useState("20");
  const [approvers, setApprovers] = useState(["", "", ""]);
  const [payees, setPayees] = useState<string[]>([""]);
  const [deposit, setDeposit] = useState("0.1"); const [float, setFloat] = useState("0");
  const side = useRef<HTMLDivElement>(null);
  const [sideSeen, setSideSeen] = useState(false);
  useEffect(() => {
    const el = side.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setSideSeen(e.isIntersecting), { rootMargin: "0px 0px -35% 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  const [bal, setBal] = useState<{ okb: bigint; usdt: bigint } | null>(null);
  const [made, setMade] = useState<Ctx | null>(null);

  useEffect(() => { if (account && !approvers[0]) setApprovers((a) => [account, a[1], a[2]]); }, [account]); // eslint-disable-line react-hooks/exhaustive-deps
  // arriving from the line simulator (?f=fuseId:a:b,…): start with the line that was tested
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("f"); if (!f) return;
    const ask = new Map(f.split(",").map((t) => { const [id, a, b] = t.split(":"); return [Number(id), { a, b }] as const; }));
    setOn(Object.fromEntries(FUSES.map((x) => [x.key, ask.has(x.id)])) as Record<Key, boolean>);
    const v = (id: number, k: "a" | "b") => ask.get(id)?.[k];
    const [dc, pg, , ap] = FUSES;
    if (v(dc.id, "a")) setCap(v(dc.id, "a")!); if (v(pg.id, "a")) setCool(v(pg.id, "a")!); if (v(pg.id, "b")) setTrial(v(pg.id, "b")!); if (v(ap.id, "a")) setThr(v(ap.id, "a")!);
  }, []);
  const simLink = `/app/simulate?f=${FUSES.filter((x) => on[x.key]).map((x) => (x.key === "daily-cap" ? `${x.id}:${clamp(cap)}` : x.key === "payee-guard" ? `${x.id}:${clamp(cool)}:${clamp(trial)}` : x.key === "approval-2of3" ? `${x.id}:${clamp(thr)}` : `${x.id}`)).join(",")}`;
  useEffect(() => {
    if (!account) return;
    Promise.all([pub.getBalance({ address: account }), pub.readContract({ address: DEP.usdt0 as Address, abi: erc20, functionName: "balanceOf", args: [account] })]).then(([okb, usdt]) => setBal({ okb, usdt })).catch(() => {});
  }, [account, made]);

  const perDecision = FUSES.filter((f) => on[f.key]).reduce((t, f) => t + feeOf(f), 0n);
  const depositUnits = (() => { try { return parseUnits(deposit || "0", 6); } catch { return -1n; } })();
  const floatUnits = (() => { try { return parseUnits(float || "0", 6); } catch { return -1n; } })();
  const goodPayees = payees.filter((p) => p.trim());
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!account) p.push("Connect a wallet: it becomes the owner.");
    if (!isAddress(agent.trim(), { strict: false })) p.push("Enter your agent's address.");
    else if (account && agent.trim().toLowerCase() === account.toLowerCase()) p.push("Use a separate key for the agent, not your own.");
    if (!Object.values(on).some(Boolean)) p.push("Pick at least one fuse.");
    if (on["approval-2of3"] && approvers.some((a) => !isAddress(a.trim(), { strict: false }))) p.push("Two of Three needs three approver addresses.");
    if (goodPayees.some((x) => !isAddress(x.trim(), { strict: false }))) p.push("A saved payee isn't a valid address.");
    if (depositUnits < 0n || floatUnits < 0n) p.push("Amounts must be numbers, up to 6 decimals.");
    if (bal && depositUnits + floatUnits > bal.usdt) p.push(`You have ${Number(bal.usdt) / 1e6} USDT0; the deposit and float need ${Number(depositUnits + floatUnits) / 1e6}.`);
    if (bal && bal.okb === 0n) p.push("You need a little OKB on X Layer for gas.");
    return p;
  }, [account, agent, on, approvers, goodPayees, depositUnits, floatUnits, bal]);

  const plan = (): TxStep<Ctx>[] => {
    const W = () => ({ abi: fuseboxWalletAbi, address: undefined as unknown as Address });
    const steps: TxStep<Ctx>[] = [
      {
        id: "create", label: "Create your Fusebox wallet", detail: `owner ${short(account!)} · agent ${short(agent.trim())}`,
        run: () => write({ address: DEP.factory as Address, abi: fuseboxFactoryAbi, functionName: "createWallet", args: [account!, [getAddress(agent.trim().toLowerCase())], toHex(crypto.getRandomValues(new Uint8Array(32)))] }),
        after: (r, c) => {
          for (const l of r.logs) { try { const ev = decodeEventLog({ abi: fuseboxFactoryAbi, data: l.data, topics: l.topics }); if (ev.eventName === "WalletCreated") c.wallet = ev.args.wallet; } catch {} }
          c.block = Number(r.blockNumber);
          try { const k = "fusebox:mine"; const list = JSON.parse(localStorage.getItem(k) || "[]"); list.unshift({ address: c.wallet, block: c.block, owner: account }); localStorage.setItem(k, JSON.stringify(list.slice(0, 20))); } catch {}
        },
      },
      { id: "token", label: "Let it pay in USDT0", run: (c) => write({ ...W(), address: c.wallet!, functionName: "setToken", args: [DEP.usdt0 as Address, true] }) },
    ];
    FUSES.filter((f) => on[f.key]).forEach((f) => {
      const params = f.key === "breaker" ? { token: "0x0000000000000000000000000000000000000000" as Address, unit: 0n, a: 0, b: 0 }
        : { token: DEP.usdt0 as Address, unit: USDT, a: f.key === "daily-cap" ? clamp(cap) : f.key === "payee-guard" ? clamp(cool) : clamp(thr), b: f.key === "payee-guard" ? clamp(trial) : 0 };
      const detail = f.key === "daily-cap" ? `${clamp(cap)} USDT0 a day` : f.key === "payee-guard" ? `${clamp(cool)} h cooling-off, ${clamp(trial)} USDT0 trial` : f.key === "approval-2of3" ? `approvals over ${clamp(thr)} USDT0` : "trips on strangers";
      steps.push({ id: `fuse-${f.key}`, label: `Splice in ${f.name}`, detail: `${detail} · ${Number(feeOf(f)) / 1e6} USDT0 per check`, run: (c) => write({ ...W(), address: c.wallet!, functionName: "addFuse", args: [BigInt(f.id), params, feeOf(f)] }) });
    });
    goodPayees.forEach((p, i) => steps.push({ id: `payee-${i}`, label: "Save a payee", detail: short(p.trim()), run: (c) => write({ ...W(), address: c.wallet!, functionName: "addPayee", args: [getAddress(p.trim().toLowerCase())] }) }));
    if (on["approval-2of3"]) steps.push({ id: "approvers", label: "Seat the three approvers", detail: approvers.map((a) => short(a.trim())).join(" · "), run: (c) => write({ ...W(), address: c.wallet!, functionName: "setApprovers", args: [approvers.map((a) => getAddress(a.trim().toLowerCase())) as [Address, Address, Address]] }) });
    if (depositUnits > 0n) {
      steps.push({ id: "approve", label: "Allow the registry to take the fee deposit", detail: `${deposit} USDT0`, run: async () => {
        const have = await pub.readContract({ address: DEP.usdt0 as Address, abi: erc20, functionName: "allowance", args: [account!, DEP.registry as Address] });
        return have >= depositUnits ? null : write({ address: DEP.usdt0 as Address, abi: erc20, functionName: "approve", args: [DEP.registry as Address, depositUnits] });
      } });
      steps.push({ id: "deposit", label: "Prepay fees", detail: `${deposit} USDT0 ≈ ${perDecision ? Number(depositUnits / perDecision) : 0} decisions`, run: (c) => write({ address: DEP.registry as Address, abi: fuseRegistryAbi, functionName: "deposit", args: [c.wallet!, depositUnits] }) });
    }
    if (floatUnits > 0n) steps.push({ id: "float", label: "Fund the wallet for payments", detail: `${float} USDT0`, run: (c) => write({ address: DEP.usdt0 as Address, abi: erc20, functionName: "transfer", args: [c.wallet!, floatUnits] }) });
    return steps;
  };

  const launch = async () => { setMade(null); const ok = await q.start(plan(), {}); if (ok) setMade({ ...(q.ctx() ?? {}) }); };
  const retry = async () => { const ok = await q.retry(); if (ok) setMade({ ...(q.ctx() ?? {}) }); };
  const failed = q.steps.some((s) => s.state === "error");
  // when the last step lands, bring the "It's live" card into view (on phones it sits under the step list)
  useEffect(() => { if (made?.wallet) setTimeout(() => document.querySelector(".done-card")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150); }, [made?.wallet]);

  const toggle = (k: Key) => setOn({ ...on, [k]: !on[k] });
  return (
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <section className="try-head">
        <h1 className="disp" data-a>Wire up a <span className="lime">[wallet]</span>.</h1>
        <p data-a>Your agent gets a key that can only pay through the fuses you pick. You stay the owner: you set the limits, save payees, and reset a blown fuse. Everything runs on X Layer mainnet.</p>
      </section>
      <h2 className="sr">Set up your wallet</h2>
      <section className="wz">
        <div className="wz-main" data-a>
          <div className={`wz-sec${account ? "" : " off"}`}>
            <div className="ix">01</div>
            <div>
              <h3>Connect the owner</h3>
              {account ? <p className="lead">Owner: <span className="m lime">{account}</span>. Only this address can change the wallet&apos;s fuses, payees and limits.</p> : (
                <>
                  <p className="lead">The wallet you connect becomes the owner. OKX Wallet works best on X Layer.</p>
                  <div className="prow">{wallets.length ? wallets.map((w) => <button key={w.info.rdns} className="btn" onClick={() => connect(w.info.rdns)} data-cursor="Connect">{w.info.icon ? <img src={w.info.icon} alt="" width={18} height={18} /> : null}{w.info.name}</button>) : <p className="lead">No wallet found in this browser. <a className="lime" href="https://web3.okx.com/download" target="_blank" rel="noreferrer">Get OKX Wallet ↗</a></p>}</div>
                </>
              )}
            </div>
          </div>
          <div className="wz-sec">
            <div className="ix">02</div>
            <div>
              <h3>Name the agent</h3>
              <p className="lead">The address your AI agent signs with. It can do exactly one thing: ask this wallet to pay, through every fuse. It can&apos;t change a fuse, a limit or a payee.</p>
              <div className="field m"><label>Agent address</label><input aria-label="Agent address" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x…" spellCheck={false} /></div>
            </div>
          </div>
          <div className="wz-sec">
            <div className="ix">03</div>
            <div>
              <h3>Pick the fuses</h3>
              <p className="lead">Each fuse is a TapeOut circuit on X Layer. A payment needs a yes from every fuse you splice in, and each check pays the fuse&apos;s designer.</p>
              <div className="starters" role="group" aria-label="Start from a line">
                {STARTERS.map((x) => {
                  const active = FUSES.every((f) => on[f.key] === x.on[f.key]) && (!x.on["daily-cap"] || cap === x.cap) && (!x.on["payee-guard"] || (cool === x.cool && trial === x.trial)) && (!x.on["approval-2of3"] || thr === x.thr);
                  const f = FUSES.filter((y) => x.on[y.key]).map((y) => (y.key === "daily-cap" ? `${y.id}:${x.cap}` : y.key === "payee-guard" ? `${y.id}:${x.cool}:${x.trial}` : y.key === "approval-2of3" ? `${y.id}:${x.thr}` : `${y.id}`)).join(",");
                  return (
                    <div key={x.id} className={`starter${active ? " on" : ""}`}>
                      <button onClick={() => { setOn(x.on); setCap(x.cap); setCool(x.cool); setTrial(x.trial); setThr(x.thr); }} aria-pressed={active}>
                        <b>{x.name}</b>
                        <span className="m mute">{FUSES.filter((y) => x.on[y.key]).map((y) => y.name).join(" · ")}</span>
                        <span className="starter-why">{x.why}</span>
                      </button>
                      <Link className="m lime" href={`/app/simulate?f=${f}`}>Test it →</Link>
                    </div>
                  );
                })}
              </div>
              {FUSES.map((f) => (
                <div className="fopt" key={f.key}>
                  <Toggle on={on[f.key]} flip={() => toggle(f.key)} name={f.name} />
                  <div>
                    <h4>{f.name}<small>{Number(feeOf(f)) / 1e6} USDT0 / check</small></h4>
                    <p>{f.say}</p>
                    {on[f.key] && f.key === "daily-cap" && <div className="prow"><Field label="Cap per day" suffix="USDT0" v={cap} set={setCap} /></div>}
                    {on[f.key] && f.key === "payee-guard" && <div className="prow"><Field label="Cooling-off" suffix="hours" v={cool} set={setCool} /><Field label="Trial amount" suffix="USDT0" v={trial} set={setTrial} /></div>}
                    {on[f.key] && f.key === "approval-2of3" && (
                      <>
                        <div className="prow"><Field label="Approvals above" suffix="USDT0" v={thr} set={setThr} /></div>
                        <div className="addr-list m" style={{ marginTop: 12 }}>
                          {approvers.map((a, i) => <div className="ar field" key={i}><input aria-label={`Approver ${i + 1} address`} value={a} onChange={(e) => setApprovers(approvers.map((x, k) => (k === i ? e.target.value : x)))} placeholder={`Approver ${i + 1} · 0x…`} spellCheck={false} /></div>)}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div className="fopt">
                <span />
                <div>
                  <h4>Saved payees</h4>
                  <p>Who Payee Guard and the Breaker treat as known. You can add more later.</p>
                  <div className="addr-list m">
                    {payees.map((p, i) => <div className="ar field" key={i}><input aria-label={`Saved payee ${i + 1} address`} value={p} onChange={(e) => setPayees(payees.map((x, k) => (k === i ? e.target.value : x)))} placeholder="0x…" spellCheck={false} /><button onClick={() => setPayees(payees.filter((_, k) => k !== i))} aria-label={`Remove saved payee ${i + 1}`}>✕</button></div>)}
                    <button className="linkbtn" onClick={() => setPayees([...payees, ""])}>+ Add a payee</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="wz-sec">
            <div className="ix">04</div>
            <div>
              <h3>Fund it</h3>
              <p className="lead">Fees come from a prepaid USDT0 balance in the registry; the payments themselves come from the wallet. {bal ? <>You have <span className="m lime">{(Number(bal.usdt) / 1e6).toFixed(4)} USDT0</span> and <span className="m lime">{(Number(bal.okb) / 1e18).toFixed(5)} OKB</span>.</> : null}</p>
              <div className="prow">
                <Field label="Fee balance" suffix="USDT0" v={deposit} set={setDeposit} />
                <Field label="Wallet float" suffix="USDT0" v={float} set={setFloat} />
              </div>
            </div>
          </div>
        </div>
        <div className="wz-side" data-a ref={side}>
          <div className="summary">
            <div className="sh2 m"><span className="mute">Your wallet</span><span className="lime">{Object.values(on).filter(Boolean).length} fuses</span></div>
            <div className="rows">
              <div><span>Per payment</span><span>{(Number(perDecision) / 1e6).toFixed(4)} USDT0</span></div>
              <div><span>Fee balance covers</span><span>{perDecision && depositUnits > 0n ? `${Number(depositUnits / perDecision)} decisions` : "—"}</span></div>
              <div><span>Daily cap</span><span>{on["daily-cap"] ? `${clamp(cap)} USDT0` : "off"}</span></div>
              <div><span>Approvals over</span><span>{on["approval-2of3"] ? `${clamp(thr)} USDT0` : "off"}</span></div>
              <div><span>Saved payees</span><span>{goodPayees.length}</span></div>
            </div>
            <Link className="m lime sim-link" href={simLink}>Test this line on sample payments first →</Link>
            {q.steps.length > 0 && (
              <ul className="txs">
                {q.steps.map((s) => (
                  <li key={s.id} className={s.state}>
                    <span className="dot" />
                    <span>{s.label}{s.detail ? <span className="m mute" style={{ display: "block", marginTop: 3 }}>{s.detail}</span> : null}</span>
                    <span className="st">{s.hash ? <a href={`${OKLINK}/tx/${s.hash}`} target="_blank" rel="noreferrer">{s.state === "done" ? "Done ↗" : "Mining ↗"}</a> : s.state === "sign" ? "Sign" : s.state === "skip" ? "Not needed" : s.state === "error" ? "Failed" : ""}</span>
                    {s.error && <span className="e">{s.error}</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="go">
              {made?.wallet ? (
                <div className="done-card">
                  <h4>It&apos;s live.</h4>
                  <p style={{ color: "var(--soft)", fontSize: 14, lineHeight: 1.5 }}>Your wallet <span className="m lime">{short(made.wallet)}</span> is on X Layer with its fuses spliced in. Give your agent its address.</p>
                  <div className="prow" style={{ marginTop: 14 }}><Link className="btn lime" href={`/app/w/${made.wallet}`} data-cursor="Open">Open my wallet <span className="k">→</span></Link></div>
                </div>
              ) : failed ? (
                <button className="btn lime" onClick={retry} disabled={q.running} data-cursor="Retry">{q.running ? "Working…" : "Retry from the failed step"}</button>
              ) : (
                <button className="btn lime" onClick={launch} disabled={q.running || problems.length > 0} data-cursor="Wire it">{q.running ? "Sign in your wallet…" : <><span className="roll"><span>Wire it up</span><span aria-hidden="true">Wire it up</span></span> <span className="k">→</span></>}</button>
              )}
              {!q.running && !made && problems.length > 0 && <div className="warn2">{problems[0]}</div>}
              {!made && <p className="m mute" style={{ marginTop: 12, lineHeight: 1.6 }}>Each step is one transaction you sign. Gas on X Layer is a tiny fraction of a cent.</p>}
            </div>
          </div>
        </div>
      </section>
      {/* phones: the summary is at the end of a long form, so its action rides above the dock until you reach it */}
      {!made?.wallet && !sideSeen && (
        <div className="wz-sticky">
          <div className="m"><b>{Object.values(on).filter(Boolean).length} fuses · {(Number(perDecision) / 1e6).toFixed(4)} USDT0 each</b>
            <span className={!q.running && problems.length ? "warn" : "mute"}>{q.running ? "Sign each step in your wallet…" : failed ? "A step failed: retry it below" : problems[0] ?? "Ready to wire it up"}</span></div>
          <button className="btn lime" disabled={q.running} onClick={() => { side.current?.scrollIntoView({ behavior: "smooth", block: "start" }); if (failed) retry(); else if (!problems.length) launch(); }}>
            {failed ? "Retry" : problems.length ? "Review" : "Wire it up"} <span className="k">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
