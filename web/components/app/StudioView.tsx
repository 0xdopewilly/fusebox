"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeEventLog, formatEther, parseUnits, type Address, type Hex } from "viem";
import { fuseRegistryAbi, tapeoutProcessorAbi } from "@/lib/abi";
import { DEP, pub } from "@/lib/client-chain";
import { SOCKETS } from "@/lib/sockets";
import { CONDS, compile, condOf, decodeDraft, encodeDraft, paramLabels, ruleProblem, ruleText, type Cond, type Rule } from "@/lib/studio";
import { prove, type Proof } from "@/lib/studioProof";
import { encodeMeta } from "@/lib/fuseMeta";
import { decodeNetlist } from "@/lib/tap02";
import { useTxQueue } from "@/lib/useTxQueue";
import { short, OKLINK } from "@/lib/hooks";
import { arcs } from "./ChainNetlist";
import { useWallet } from "./WalletProvider";
import NoWallet from "./NoWallet";

const transistorsAbi = [
  { type: "function", name: "mint", stateMutability: "payable", inputs: [{ name: "id", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "mintPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "protocolFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }, { name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;
const PROCESSOR = DEP.processor as Address;
const START: Record<number, Cond[][]> = { 1: [[{ kind: "each", k: 0 }]], 2: [[{ kind: "listed", k: 0 }, { kind: "cooled", k: 0 }]], 3: [], 4: [[{ kind: "small", k: 0 }], [{ kind: "seat", k: 1 }, { kind: "kof3", k: 2 }]] };
const SOCKET_ORDER = [1, 2, 3, 4];
interface Ctx { circuitId?: bigint; fuseId?: number }
// the shared write() is typed for any ABI, where viem can't see that these calls are payable; it passes value through
type WriteArg = Parameters<ReturnType<typeof useWallet>["write"]>[0];
const payable = (a: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[]; value: bigint }) => a as unknown as WriteArg;

/** Build a fuse from rules, prove it on every input, and tape it out and list it from your own wallet. */
export default function StudioView() {
  const { account, wallets, connect, write } = useWallet();
  const [socket, setSocket] = useState(1);
  const [groups, setGroups] = useState<Cond[][]>(START[1]);
  const [strikes, setStrikes] = useState(2);
  const rule: Rule = { socket, groups, strikes };
  const problem = ruleProblem(rule);
  const key = JSON.stringify(rule);
  const compiled = useMemo(() => { if (problem) return null; try { return compile(rule); } catch { return null; } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const overBudget = compiled ? compiled.net.gates > 512 : false;

  // the real wiring, drawn from the netlist bytes
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (compiled && cv.current) arcs(cv.current, decodeNetlist(compiled.net.hex, compiled.nIn), compiled.nIn); }, [compiled]);

  // the proof belongs to the exact netlist it checked
  const [proof, setProof] = useState<{ hash: string; p: Proof } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const proven = !!compiled && proof?.hash === compiled.net.keccak && proof.p.mismatches === 0;
  const runProof = async () => {
    if (!compiled) return;
    setProgress(0);
    const p = await prove(compiled, socket, (d, t) => setProgress(d / t));
    setProof({ hash: compiled.net.keccak, p }); setProgress(null);
  };

  // what it costs to tape out on TapeOut's processor, read live
  const [cost, setCost] = useState<{ T: Address; price: bigint; pfee: bigint; tape: bigint; haveN: bigint; haveL: bigint; okb: bigint | null } | null>(null);
  useEffect(() => {
    let on = true;
    (async () => {
      const T = await pub.readContract({ address: PROCESSOR, abi: tapeoutProcessorAbi, functionName: "transistors" });
      const [price, pfee, tape, haveN, haveL, okb] = await Promise.all([
        pub.readContract({ address: T, abi: transistorsAbi, functionName: "mintPrice" }),
        pub.readContract({ address: T, abi: transistorsAbi, functionName: "protocolFee" }),
        pub.readContract({ address: PROCESSOR, abi: tapeoutProcessorAbi, functionName: "TAPEOUT_FEE" }),
        account ? pub.readContract({ address: T, abi: transistorsAbi, functionName: "balanceOf", args: [account, 0n] }) : Promise.resolve(0n),
        account ? pub.readContract({ address: T, abi: transistorsAbi, functionName: "balanceOf", args: [account, 1n] }) : Promise.resolve(0n),
        account ? pub.getBalance({ address: account }) : Promise.resolve(null),
      ]);
      if (on) setCost({ T, price, pfee, tape, haveN, haveL, okb });
    })().catch(() => {});
    return () => { on = false; };
  }, [account]);
  const needN = compiled && cost ? BigInt(Math.max(0, compiled.net.nand - Number(cost.haveN))) : 0n;
  const needL = compiled && cost ? BigInt(Math.max(0, compiled.net.latch - Number(cost.haveL))) : 0n;
  const okbCost = cost && compiled ? (needN ? cost.price * needN + cost.pfee : 0n) + (needL ? cost.price * needL + cost.pfee : 0n) + cost.tape : null;

  // describe it
  const [name, setName] = useState(""); const [summary, setSummary] = useState(""); const [fee, setFee] = useState("0.001");
  // a shared draft (?draft=…) opens as it was designed
  useEffect(() => {
    const d = decodeDraft(new URLSearchParams(window.location.search).get("draft") ?? ""); if (!d) return;
    setSocket(d.rule.socket); setGroups(d.rule.groups); setStrikes(d.rule.strikes); setName(d.name);
  }, []);
  const draftCode = problem ? "" : encodeDraft(rule, name);
  const [copied, setCopied] = useState(false);
  const text = ruleText(rule);
  const feeOk = /^\d+(\.\d{1,6})?$/.test(fee.trim()) && Number(fee) <= 1;
  const metaUri = encodeMeta({ name: name.trim() || undefined, summary: (summary.trim() || `Allows a payment when ${text}.`).slice(0, 200), rule: text.slice(0, 160), designer: account ? short(account) : undefined, params: paramLabels(rule) });

  const q = useTxQueue<Ctx>();
  const [made, setMade] = useState<Ctx | null>(null);
  const blocker = !account ? "Connect the wallet that will own the circuit" : !compiled ? "Fix the rule first" : overBudget ? "Over the 512-gate budget" : !proven ? "Prove it first" : !name.trim() ? "Give it a name" : !feeOk ? "A fee from 0 to 1 USDT0" : okbCost !== null && cost?.okb != null && cost.okb < okbCost ? `Needs ${formatEther(okbCost)} OKB plus gas; this wallet has ${formatEther(cost.okb)}` : null;
  const launch = async () => {
    if (!compiled || !cost || !account) return;
    const net = compiled.net;
    const steps = [];
    if (needN > 0n) steps.push({ id: "nand", label: `Mint ${needN} NAND transistors`, detail: `${formatEther(cost.price * needN + cost.pfee)} OKB`, run: () => write(payable({ address: cost.T, abi: transistorsAbi, functionName: "mint", args: [0n, needN], value: cost.price * needN + cost.pfee })) });
    if (needL > 0n) steps.push({ id: "latch", label: `Mint ${needL} LATCH transistor${needL > 1n ? "s" : ""}`, detail: `${formatEther(cost.price * needL + cost.pfee)} OKB`, run: () => write(payable({ address: cost.T, abi: transistorsAbi, functionName: "mint", args: [1n, needL], value: cost.price * needL + cost.pfee })) });
    steps.push({ id: "tape", label: "Tape it out on TapeOut", detail: `${net.gates} gates · ${formatEther(cost.tape)} OKB`, run: () => write(payable({ address: PROCESSOR, abi: tapeoutProcessorAbi, functionName: "tapeout", args: [net.hex as Hex, compiled.nIn, 1], value: cost.tape })),
      after: (r: { logs: { address: string; data: Hex; topics: Hex[] }[] }, c: Ctx) => { for (const l of r.logs) { if (l.address.toLowerCase() !== PROCESSOR.toLowerCase()) continue; try { const ev = decodeEventLog({ abi: tapeoutProcessorAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }); if (ev.eventName === "TapedOut") c.circuitId = ev.args.circuitId; } catch {} } } });
    steps.push({ id: "list", label: "List it in the fuse market", detail: `${fee} USDT0 a check, described on-chain`, run: (c: Ctx) => write({ address: DEP.registry as Address, abi: fuseRegistryAbi, functionName: "list", args: [PROCESSOR, c.circuitId!, socket, net.keccak as Hex, parseUnits(fee.trim(), 6), metaUri] }),
      after: (r: { logs: { address: string; data: Hex; topics: Hex[] }[] }, c: Ctx) => { for (const l of r.logs) { try { const ev = decodeEventLog({ abi: fuseRegistryAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }); if (ev.eventName === "FuseListed") c.fuseId = Number(ev.args.fuseId); } catch {} } } });
    const ok = await q.start(steps as Parameters<typeof q.start>[0], {});
    if (ok) setMade({ ...(q.ctx() ?? {}) });
  };

  const pick = (s: number) => { setSocket(s); setGroups(START[s]); setProof(null); setMade(null); };
  const setCond = (g: number, i: number, c: Cond | null) => setGroups(groups.map((x, j) => (j !== g ? x : c ? x.map((y, k) => (k === i ? c : y)) : x.filter((_, k) => k !== i))).filter((x, j) => x.length || j !== g || x.length));
  const addCond = (g: number, kind: string) => { const d = condOf(socket, kind)!; setGroups(groups.map((x, j) => (j === g ? [...x, { kind, k: d.param?.def ?? 0 }] : x))); };
  const grid = <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>;

  return (
    <div className="page">
      {grid}
      <section className="try-head">
        <h1 className="disp" data-a>Fuse <span className="lime">[studio]</span>.</h1>
        <p data-a>Build a fuse from rules, prove it against every input, and tape it out on TapeOut from your own wallet. It lists in the market with its description on-chain, and earns you its fee on every check, the no&apos;s included.</p>
      </section>

      <h2 className="sr">1. Pick a socket</h2>
      <div className="st-sockets" data-a role="tablist" aria-label="Socket">
        {SOCKET_ORDER.map((s) => (
          <button key={s} role="tab" aria-selected={socket === s} className={socket === s ? "on" : ""} onClick={() => pick(s)}>
            <span className="m mute">Socket {s}</span><b>{SOCKETS[s].name}</b><small>{SOCKETS[s].pins.map(([n, w]) => `${n}${w > 1 ? `[${w}]` : ""}`).join(" · ")}</small>
          </button>
        ))}
      </div>

      <section className="st-main" data-a>
        <div className="st-rule">
          <div className="sim-h m"><span className="lime">01</span> The rule · allow a payment when…</div>
          {socket === 3 ? (
            <div className="st-strikes">
              <p className="oc-say">The Breaker socket is sequential: the circuit keeps latches on X Layer. A payment to a stranger is refused and counted; at the last strike it blows, and everything is refused until the owner resets it. A freeze blows it at once.</p>
              <div className="sim-presets">{[1, 2, 3].map((n) => <button key={n} className={`dt-btn${strikes === n ? " on" : ""}`} aria-pressed={strikes === n} onClick={() => { setStrikes(n); setProof(null); }}>{n} strike{n > 1 ? "s" : ""}</button>)}</div>
            </div>
          ) : (
            <>
              {groups.map((g, gi) => (
                <div key={gi}>
                  {gi > 0 && <div className="st-or m">or</div>}
                  <div className="st-group">
                    {g.map((c, ci) => {
                      const d = condOf(socket, c.kind)!;
                      return (
                        <div key={ci} className="st-cond">
                          {ci > 0 && <span className="m mute st-and">and</span>}
                          <span className="st-text">{d.label(c.k)}</span>
                          {d.param && <label className="st-k m"><span className="sr">{d.param.label}</span><input aria-label={d.param.label} value={c.k} onChange={(e) => { setCond(gi, ci, { kind: c.kind, k: Number(e.target.value.replace(/\D/g, "")) || 0 }); setProof(null); }} inputMode="numeric" /></label>}
                          <button className="sim-x" aria-label={`Remove: ${d.label(c.k)}`} onClick={() => { setGroups(groups.map((x, j) => (j === gi ? x.filter((_, k) => k !== ci) : x)).filter((x) => x.length)); setProof(null); }}>×</button>
                        </div>
                      );
                    })}
                    <select className="st-add m" aria-label={`Add a condition to group ${gi + 1}`} value="" onChange={(e) => { if (e.target.value) { addCond(gi, e.target.value); setProof(null); } }}>
                      <option value="">+ and…</option>
                      {CONDS[socket].map((d) => <option key={d.kind} value={d.kind}>{d.label(d.param?.def ?? 0)}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              <select className="st-add m st-or-add" aria-label="Add another group" value="" onChange={(e) => { if (e.target.value) { const d = condOf(socket, e.target.value)!; setGroups([...groups, [{ kind: e.target.value, k: d.param?.def ?? 0 }]]); setProof(null); } }}>
                <option value="">+ or another way through…</option>
                {CONDS[socket].map((d) => <option key={d.kind} value={d.kind}>{d.label(d.param?.def ?? 0)}</option>)}
              </select>
            </>
          )}
          <p className="st-sentence">{problem ? <span className="red">{problem}</span> : <>Allows a payment when <b>{text}</b>.</>}</p>
        </div>

        <div className="st-chip">
          <div className="sim-h m"><span className="lime">02</span> The circuit · compiled as you edit</div>
          {compiled ? (
            <>
              <canvas ref={cv} className="st-canvas" aria-label={`Netlist: ${compiled.net.nand} NAND gates${compiled.net.latch ? ` and ${compiled.net.latch} LATCH` : ""}`} />
              <div className="m kv fv-kv st-kv">
                <span>Gates</span><span>{compiled.net.nand} NAND{compiled.net.latch ? ` + ${compiled.net.latch} LATCH` : ""}</span>
                <span>Budget</span><span className={overBudget ? "red" : ""}>{compiled.net.gates} of 512</span>
                <span>Inputs</span><span>{compiled.nIn} · 1 output</span>
                <span>Netlist</span><span title={compiled.net.keccak}>{compiled.net.bytes.length} bytes · {compiled.net.keccak.slice(0, 10)}…</span>
                <span>Tape-out</span><span>{okbCost !== null ? `${formatEther(okbCost)} OKB + gas` : "reading TapeOut…"}</span>
              </div>
              <div className="st-meter" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, compiled.net.gates / 512)})` }} className={overBudget ? "over" : ""} /></div>
            </>
          ) : <p className="m mute">{problem ?? "Couldn't compile this rule."}</p>}
        </div>
      </section>

      <section className="st-prove" data-a>
        <div className="sim-h m"><span className="lime">03</span> Prove it · the bytes against the rule</div>
        <div className="st-prove-row">
          <button className="btn lime" disabled={!compiled || progress !== null} onClick={runProof}><span>{progress !== null ? `Checking… ${Math.round(progress * 100)}%` : proven ? "Proven · run again" : "Prove it on every input"}</span> <span className="k">→</span></button>
          {progress !== null && <div className="st-bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ transform: `scaleX(${progress})` }} /></div>}
          {proof && compiled && proof.hash === compiled.net.keccak && (
            <p className={`m ${proof.p.mismatches ? "red" : "lime"}`} role="status">
              {proof.p.mismatches ? `${proof.p.mismatches.toLocaleString()} mismatches in ${proof.p.checked.toLocaleString()} inputs. First: ${JSON.stringify(proof.p.example?.fields)}` : `${proof.p.checked.toLocaleString()} inputs checked, 0 mismatches: ${proof.p.mode}.`}
            </p>
          )}
        </div>
        <p className="oc-say">The netlist is decoded from its own TAP-02 bytes and run, 32 inputs at a time, against the rule written in plain code. The same bytes are what TapeOut stores and what the registry pins by hash.</p>
        <div className="st-draft m">
          <Link className={`dt-btn${draftCode ? "" : " off"}`} href={draftCode ? `/app/simulate?draft=${draftCode}` : "#"} aria-disabled={!draftCode}>Try it on payments in the simulator →</Link>
          <button className="dt-btn" disabled={!draftCode} onClick={() => { navigator.clipboard?.writeText(`${location.origin}/app/studio?draft=${draftCode}`); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? "Draft link copied" : "Copy a link to this draft"}</button>
          <span className="mute">Both are free: nothing is taped out until you say so below.</span>
        </div>
      </section>

      <section className="st-ship" data-a>
        <div className="sim-h m"><span className="lime">04</span> Tape it out and list it</div>
        <div className="st-ship-grid">
          <div className="st-fields">
            <label className="oc-f m"><span>Name</span><input aria-label="Fuse name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Careful Cap" /></label>
            <label className="oc-f m"><span>One line for the market (optional)</span><input aria-label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={200} placeholder={`Allows a payment when ${text}.`.slice(0, 90)} /></label>
            <label className="oc-f m"><span>Fee per check (USDT0)</span><input aria-label="Fee per check in USDT0" value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" /></label>
            <p className="m mute" style={{ fontSize: 10.5, lineHeight: 1.6 }}>90% of every fee goes to whoever holds the circuit NFT; Fusebox keeps 10%. The description is written on X Layer with the listing.</p>
          </div>
          <div className="st-go">
            {!account ? (wallets.length ? <div className="prow">{wallets.map((w) => <button key={w.info.rdns} className="btn lime" onClick={() => connect(w.info.rdns)}>Connect {w.info.name}</button>)}</div> : <NoWallet />) : (
              <>
                <button className="btn lime" disabled={!!blocker || q.running || !!made} onClick={launch}><span>{q.running ? "Working…" : "Tape out and list"}</span> <span className="k">→</span></button>
                {blocker && !made && <p className="m mute">{blocker}</p>}
              </>
            )}
            {q.steps.length > 0 && (
              <ul className="txs">
                {q.steps.map((s) => <li key={s.id} className={s.state}><span className="dot" /><span className="m">{s.label}<small>{s.state === "error" ? s.error : s.detail}</small></span>{s.hash ? <a className="m" href={`${OKLINK}/tx/${s.hash}`} target="_blank" rel="noreferrer">tx ↗</a> : null}</li>)}
              </ul>
            )}
            {q.steps.some((s) => s.state === "error") && <button className="btn" onClick={async () => { const ok = await q.retry(); if (ok) setMade({ ...(q.ctx() ?? {}) }); }}>Retry from the failed step</button>}
            {made?.fuseId && (
              <div className="done-card">
                <h4>It&apos;s listed.</h4>
                <p style={{ color: "var(--soft)", fontSize: 14, lineHeight: 1.5 }}>Circuit <span className="m lime">#{String(made.circuitId)}</span> is on TapeOut and listed as fuse <span className="m lime">{made.fuseId}</span>. Wallets can install it now.</p>
                <div className="prow" style={{ marginTop: 14 }}>
                  <Link className="btn lime" href={`/app/fuse/${made.fuseId}`}>Its page →</Link>
                  <Link className="btn" href={`/app/simulate?f=${made.fuseId}`}>Try it on payments</Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
