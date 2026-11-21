"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeEventLog, formatEther, parseUnits, type Address, type Hex } from "viem";
import { fuseRegistryAbi, tapeoutProcessorAbi } from "@/lib/abi";
import { CURRENT, DEP, pub } from "@/lib/client-chain";
import { SOCKETS } from "@/lib/sockets";
import { CONDS, compile, condOf, decodeDraft, encodeDraft, opOf, paramLabels, ruleProblem, ruleText, type Cond, type GroupMode, type GroupOp, type Join, type Rule } from "@/lib/studio";
import { prove, type Proof } from "@/lib/studioProof";
import { LIBRARY, type Template } from "@/lib/studioLibrary";
import { optimizeAsync, type Optimized } from "@/lib/circuits/optimize";
import records from "@/lib/circuits/optimize-records.json";
import ui from "./StudioOptimize.module.css";
import { encodeMeta } from "@/lib/fuseMeta";
import { decodeNetlist } from "@/lib/tap02";
import { useTxQueue } from "@/lib/useTxQueue";
import { short, OKLINK } from "@/lib/hooks";
import { arcs } from "./ChainNetlist";
import { useWallet } from "./WalletProvider";
import ConnectChoices from "./ConnectChoices";
import { PageChrome } from "./m/chrome";

const transistorsAbi = [
  { type: "function", name: "mint", stateMutability: "payable", inputs: [{ name: "id", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "mintPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "protocolFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }, { name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;
const PROCESSOR = DEP.processor as Address;
const START: Record<number, Cond[][]> = { 1: [[{ kind: "each", k: 0 }]], 2: [[{ kind: "listed", k: 0 }, { kind: "cooled", k: 0 }]], 3: [], 4: [[{ kind: "small", k: 0 }], [{ kind: "seat", k: 1 }, { kind: "kof3", k: 2 }]], 5: [[{ kind: "fresh", k: 0 }]] };
const SOCKET_ORDER = [1, 2, 3, 4, 5];
/** one group of the rule: its conditions and how they combine */
interface Line { conds: Cond[]; op: GroupOp }
const toLines = (gs: Cond[][]): Line[] => gs.map((conds) => ({ conds, op: { m: "all", k: 0 } }));
const MODE_LABEL: Record<GroupMode, string> = { all: "All of", any: "Any of", atleast: "At least", none: "None of" };
const MODE_WORD: Record<GroupMode, string> = { all: "and", any: "or", atleast: "·", none: "·" };
/** what a rule means, for spotting which ready-made rule is loaded (strikes only matter on the Breaker; the join only with 2+ groups) */
const meaningOf = (r: Rule) => JSON.stringify(r.socket === 3 ? [3, r.strikes] : [r.socket, r.groups.map((g, i) => [opOf(r, i).m, opOf(r, i).k, g.map((c) => [c.kind, c.k])]), r.groups.length > 1 ? r.join ?? "any" : "-"]);
// the library, compiled once: gate counts for the cards, and netlist hashes to spot rules already live on mainnet
const LIB = LIBRARY.map((t) => { const c = compile(t.rule); return { t, gates: c.net.gates, hash: c.net.keccak.toLowerCase(), meaning: meaningOf(t.rule) }; });
interface Ctx { circuitId?: bigint; fuseId?: number }
// the shared write() is typed for any ABI, where viem can't see that these calls are payable; it passes value through
type WriteArg = Parameters<ReturnType<typeof useWallet>["write"]>[0];
const payable = (a: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[]; value: bigint }) => a as unknown as WriteArg;

/** Build a fuse from rules, prove it on every input, and tape it out and list it from your own wallet. */
export default function StudioView() {
  const { account, write } = useWallet();
  const [socket, setSocket] = useState(1);
  const [lines, setLines] = useState<Line[]>(toLines(START[1]));
  const [join, setJoin] = useState<Join>("any");
  const [strikes, setStrikes] = useState(2);
  const groups = lines.map((l) => l.conds);
  const rule: Rule = { socket, groups, strikes, ops: lines.map((l) => l.op), join };
  const problem = ruleProblem(rule);
  const key = JSON.stringify(rule);
  const compiled = useMemo(() => { if (problem) return null; try { return compile(rule); } catch { return null; } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // gate golf: shrink the netlist and prove the smaller one does exactly the same, in the background as you edit
  const [opt, setOpt] = useState<{ key: string; r: Optimized } | null>(null);
  const [optProgress, setOptProgress] = useState<number | null>(null);
  const [useOpt, setUseOpt] = useState(true);
  // which netlist the optimizer has finished with (even if it failed): proving waits for it, so the circuit can't
  // change under a proof that's already running
  const [optDone, setOptDone] = useState<string | null>(null);
  useEffect(() => {
    if (!compiled) return;
    let live = true;
    const t = setTimeout(async () => {
      setOptProgress(0);
      try {
        const r = await optimizeAsync(compiled.net, (p) => { if (live) setOptProgress(p.stage === "proof" ? 0.95 : p.total ? Math.min(0.9, p.done / p.total) : 0.05); });
        if (live) setOpt({ key: compiled.net.keccak, r });
      } finally { if (live) { setOptProgress(null); setOptDone(compiled.net.keccak); } }
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [compiled]);
  const optFor = opt && compiled && opt.key === compiled.net.keccak ? opt.r : null;
  const optimized = !!optFor?.improved && optFor.proof?.equal === true;
  // the netlist that gets proven against the rule and taped out: the optimized one when it's smaller, proven and chosen
  const active = compiled ? (optimized && useOpt ? { ...compiled, net: optFor!.net } : compiled) : null;
  const overBudget = active ? active.net.gates > 512 : false;
  const settled = !!compiled && optDone === compiled.net.keccak;

  // the real wiring, drawn from the netlist bytes
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (compiled && cv.current) arcs(cv.current, decodeNetlist(compiled.net.hex, compiled.nIn), compiled.nIn); }, [compiled]);

  // the proof belongs to the exact netlist it checked
  const [proof, setProof] = useState<{ hash: string; p: Proof } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const proven = !!active && proof?.hash === active.net.keccak && proof.p.mismatches === 0;
  const runProof = async () => {
    if (!active) return;
    setProgress(0);
    const p = await prove(active, socket, (d, t) => setProgress(d / t), rule);
    setProof({ hash: active.net.keccak, p }); setProgress(null);
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
  const needN = active && cost ? BigInt(Math.max(0, active.net.nand - Number(cost.haveN))) : 0n;
  const needL = active && cost ? BigInt(Math.max(0, active.net.latch - Number(cost.haveL))) : 0n;
  const okbCost = cost && active ? (needN ? cost.price * needN + cost.pfee : 0n) + (needL ? cost.price * needL + cost.pfee : 0n) + cost.tape : null;

  // circuits already live in the market, by netlist hash: a ready-made rule that matches one needs no tape-out
  const [live, setLive] = useState<Record<string, number>>({});
  useEffect(() => {
    let on = true;
    fetch("/api/market").then((r) => (r.ok ? r.json() : null)).then((m: { fuses?: { fuseId: number; netlistHash: string; listed: boolean }[] } | null) => {
      if (on && m?.fuses) setLive(Object.fromEntries(m.fuses.filter((f) => f.listed).map((f) => [f.netlistHash.toLowerCase(), f.fuseId])));
    }).catch(() => {});
    return () => { on = false; };
  }, []);
  const liveId = active ? live[active.net.keccak.toLowerCase()] ?? (compiled ? live[compiled.net.keccak.toLowerCase()] : undefined) : undefined;

  // describe it
  const [name, setName] = useState(""); const [summary, setSummary] = useState(""); const [fee, setFee] = useState("0.001");
  // a shared draft (?draft=…) opens as it was designed
  useEffect(() => {
    const d = decodeDraft(new URLSearchParams(window.location.search).get("draft") ?? ""); if (!d) return;
    setSocket(d.rule.socket); setLines(d.rule.groups.map((conds, i) => ({ conds, op: opOf(d.rule, i) }))); setJoin(d.rule.join ?? "any"); setStrikes(d.rule.strikes); setName(d.name);
  }, []);
  const draftCode = problem ? "" : encodeDraft(rule, name);
  const [copied, setCopied] = useState(false);
  const text = ruleText(rule);
  const feeOk = /^\d+(\.\d{1,6})?$/.test(fee.trim()) && Number(fee) <= 1;
  const metaUri = encodeMeta({ name: name.trim() || undefined, summary: (summary.trim() || `Allows a payment when ${text}.`).slice(0, 200), rule: text.slice(0, 160), designer: account ? short(account) : undefined, params: paramLabels(rule) });

  const q = useTxQueue<Ctx>();
  const [made, setMade] = useState<Ctx | null>(null);
  const blocker = !account ? "Connect the wallet that will own the circuit" : !compiled ? "Fix the rule first" : overBudget ? "Over the 512-gate budget" : !proven ? "Prove it first" : !name.trim() ? "Give it a name" : !feeOk ? "A fee from 0 to 1 USD₮0" : okbCost !== null && cost?.okb != null && cost.okb < okbCost ? `Needs ${formatEther(okbCost)} OKB plus gas; this wallet has ${formatEther(cost.okb)}` : null;
  const launch = async () => {
    if (!active || !cost || !account) return;
    const net = active.net;
    const steps = [];
    if (needN > 0n) steps.push({ id: "nand", label: `Mint ${needN} NAND transistors`, detail: `${formatEther(cost.price * needN + cost.pfee)} OKB`, run: () => write(payable({ address: cost.T, abi: transistorsAbi, functionName: "mint", args: [0n, needN], value: cost.price * needN + cost.pfee })) });
    if (needL > 0n) steps.push({ id: "latch", label: `Mint ${needL} LATCH transistor${needL > 1n ? "s" : ""}`, detail: `${formatEther(cost.price * needL + cost.pfee)} OKB`, run: () => write(payable({ address: cost.T, abi: transistorsAbi, functionName: "mint", args: [1n, needL], value: cost.price * needL + cost.pfee })) });
    steps.push({ id: "tape", label: "Tape it out on TapeOut", detail: `${net.gates} gates · ${formatEther(cost.tape)} OKB`, run: () => write(payable({ address: PROCESSOR, abi: tapeoutProcessorAbi, functionName: "tapeout", args: [net.hex as Hex, active.nIn, 1], value: cost.tape })),
      after: (r: { logs: { address: string; data: Hex; topics: Hex[] }[] }, c: Ctx) => { for (const l of r.logs) { if (l.address.toLowerCase() !== PROCESSOR.toLowerCase()) continue; try { const ev = decodeEventLog({ abi: tapeoutProcessorAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }); if (ev.eventName === "TapedOut") c.circuitId = ev.args.circuitId; } catch {} } } });
    steps.push({ id: "list", label: "List it in the fuse market", detail: `${fee} USD₮0 a check, described on-chain`, run: (c: Ctx) => write({ address: CURRENT.registry, abi: fuseRegistryAbi, functionName: "list", args: [PROCESSOR, c.circuitId!, socket, net.keccak as Hex, parseUnits(fee.trim(), 6), metaUri] }),
      after: (r: { logs: { address: string; data: Hex; topics: Hex[] }[] }, c: Ctx) => { for (const l of r.logs) { try { const ev = decodeEventLog({ abi: fuseRegistryAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }); if (ev.eventName === "FuseListed") c.fuseId = Number(ev.args.fuseId); } catch {} } } });
    const ok = await q.start(steps as Parameters<typeof q.start>[0], {});
    if (ok) setMade({ ...(q.ctx() ?? {}) });
  };

  const pick = (s: number) => { setSocket(s); setLines(toLines(START[s])); setJoin("any"); setProof(null); setMade(null); };
  const meaning = meaningOf(rule);
  const loadTemplate = (t: Template) => {
    const r = t.rule;
    setSocket(r.socket); setLines(r.groups.map((g, i) => ({ conds: g.map((c) => ({ ...c })), op: opOf(r, i) }))); setJoin(r.join ?? "any");
    if (r.socket === 3) setStrikes(r.strikes);
    // its name fills in unless you typed your own
    if (!name.trim() || LIBRARY.some((x) => x.name === name)) setName(t.name);
    setProof(null); setMade(null);
  };
  // "at least k" can't ask for more conditions than the group has
  const fit = (l: Line): Line => (l.op.m === "atleast" ? { ...l, op: { m: "atleast", k: Math.max(1, Math.min(l.op.k || 1, l.conds.length)) } } : l);
  const editLines = (f: (ls: Line[]) => Line[]) => { setLines(f(lines).filter((l) => l.conds.length).map(fit)); setProof(null); };
  const setCond = (g: number, i: number, c: Cond | null) => editLines((ls) => ls.map((l, j) => (j !== g ? l : { ...l, conds: c ? l.conds.map((y, k) => (k === i ? c : y)) : l.conds.filter((_, k) => k !== i) })));
  const addCond = (g: number, kind: string) => { const d = condOf(socket, kind)!; editLines((ls) => ls.map((l, j) => (j === g ? { ...l, conds: [...l.conds, { kind, k: d.param?.def ?? 0 }] } : l))); };
  const setOp = (g: number, op: GroupOp) => editLines((ls) => ls.map((l, j) => (j === g ? { ...l, op } : l)));
  const grid = <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>;

  return (
    <div className="page">
      {grid}
      <PageChrome title="Fuse Studio" sub="Any rule, no code" info={<p>Build any payment rule without code. Combine conditions with all, any, at least or none; Fusebox turns it into TapeOut gates, trims every gate it doesn&apos;t need and proves it matches your rule on every possible input. Tape it out from your own wallet: it lists in the market and earns you its fee on every check, the no&apos;s included.</p>} />
      <section className="try-head m-hide">
        <h1 className="disp" data-a>Fuse <span className="lime">[studio]</span>.</h1>
        <p data-a><b>Build any payment rule. No code.</b> Start from a ready-made rule or your own, and combine conditions with all, any, at least or none. Fusebox turns it into TapeOut gates, trims every gate it doesn&apos;t need and proves it matches your rule on every possible input. Tape it out from your own wallet: it guards real payments in Fusebox wallets, lists in the market, and earns you its fee on every check.</p>
      </section>

      <h2 className="sr">1. Pick a socket</h2>
      <div className="st-sockets" data-a role="tablist" aria-label="Socket">
        {SOCKET_ORDER.map((s) => (
          <button key={s} role="tab" aria-selected={socket === s} className={socket === s ? "on" : ""} onClick={() => pick(s)}>
            <span className="m mute">Socket {s}</span><b>{SOCKETS[s].name}</b><small>{SOCKETS[s].pins.map(([n, w]) => `${n}${w > 1 ? `[${w}]` : ""}`).join(" · ")}</small>
          </button>
        ))}
      </div>

      <section className="st-lib" data-a aria-labelledby="st-lib-h">
        <div className="st-lib-h m"><span id="st-lib-h">Ready-made · {SOCKETS[socket].name}</span><span className="mute">{LIBRARY.length} rules in the library · tap one, then change anything</span></div>
        <div className="st-lib-row">
          {LIB.filter((x) => x.t.rule.socket === socket).map((x) => {
            const on = x.meaning === meaning, fid = live[x.hash];
            return (
              <button key={x.t.id} className={`st-lib-card${on ? " on" : ""}`} aria-pressed={on} onClick={() => loadTemplate(x.t)}>
                <b>{x.t.name}</b>
                <span className="st-lib-when">{x.t.when}</span>
                <span className="st-lib-meta m"><span>{x.gates} gates</span>{fid ? <span className="lime">Live · fuse #{fid}</span> : <span>Yours to tape out</span>}</span>
              </button>
            );
          })}
        </div>
      </section>

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
              <p className="m mute st-hint">No code: pick conditions, then choose how each group combines them. Before anything is taped out, the circuit is proved against your rule on every possible input: all 16.7 million for a daily-cap rule, all 8.6 billion for a payee rule.</p>
              {lines.length > 1 && (
                <div className="st-join m" role="radiogroup" aria-label="How the groups combine">
                  <span>Let a payment through when</span>
                  {(["any", "all"] as Join[]).map((j) => <button key={j} role="radio" aria-checked={join === j} className={`dt-btn${join === j ? " on" : ""}`} onClick={() => { setJoin(j); setProof(null); }}>{j === "any" ? "any group holds" : "every group holds"}</button>)}
                </div>
              )}
              {lines.map((l, gi) => (
                <div key={gi}>
                  {gi > 0 && <div className="st-or m">{join === "all" ? "and" : "or"}</div>}
                  <div className="st-group">
                    <div className="st-mode m" role="radiogroup" aria-label={`Group ${gi + 1}: how its conditions combine`}>
                      {(["all", "any", "atleast", "none"] as GroupMode[]).map((m) => (
                        <button key={m} role="radio" aria-checked={l.op.m === m} className={`dt-btn${l.op.m === m ? " on" : ""}`} disabled={m === "atleast" && l.conds.length < 2}
                          onClick={() => setOp(gi, { m, k: m === "atleast" ? Math.min(2, l.conds.length) : 0 })}>{MODE_LABEL[m]}</button>
                      ))}
                      {l.op.m === "atleast" && <label className="st-k m"><span className="sr">How many</span><input aria-label={`Group ${gi + 1}: at least how many`} value={l.op.k} onChange={(e) => setOp(gi, { m: "atleast", k: Number(e.target.value.replace(/\D/g, "")) || 1 })} inputMode="numeric" /><span className="mute">of {l.conds.length}</span></label>}
                    </div>
                    {l.conds.map((c, ci) => {
                      const d = condOf(socket, c.kind)!;
                      return (
                        <div key={ci} className="st-cond">
                          {ci > 0 && <span className="m mute st-and">{MODE_WORD[l.op.m]}</span>}
                          <span className="st-text">{d.label(c.k)}</span>
                          {d.param && <label className="st-k m"><span className="sr">{d.param.label}</span><input aria-label={d.param.label} value={c.k} onChange={(e) => setCond(gi, ci, { kind: c.kind, k: Number(e.target.value.replace(/\D/g, "")) || 0 })} inputMode="numeric" /></label>}
                          <button className="sim-x" aria-label={`Remove: ${d.label(c.k)}`} onClick={() => setCond(gi, ci, null)}>×</button>
                        </div>
                      );
                    })}
                    <select className="st-add m" aria-label={`Add a condition to group ${gi + 1}`} value="" onChange={(e) => { if (e.target.value) addCond(gi, e.target.value); }}>
                      <option value="">+ add a condition…</option>
                      {CONDS[socket].map((d) => <option key={d.kind} value={d.kind}>{d.label(d.param?.def ?? 0)}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              <select className="st-add m st-or-add" aria-label="Add another group" value="" onChange={(e) => { if (e.target.value) { const d = condOf(socket, e.target.value)!; editLines((ls) => [...ls, { conds: [{ kind: e.target.value, k: d.param?.def ?? 0 }], op: { m: "all", k: 0 } }]); } }}>
                <option value="">+ add another group…</option>
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

      <section className={ui.opt} data-a aria-label="Optimize">
        <div className="sim-h m"><span className="lime">03</span> Optimize · gate golf</div>
        {!compiled ? <p className="m mute">{problem ?? "Couldn't compile this rule."}</p>
          : optProgress !== null || !optFor ? (
            <div className={ui.working}>
              <p className="m mute" role="status">Looking for a smaller circuit that does exactly the same… {optProgress !== null ? `${Math.round(optProgress * 100)}%` : ""}</p>
              <div className="st-bar" aria-hidden="true"><i style={{ transform: `scaleX(${optProgress ?? 0})` }} /></div>
            </div>
          ) : (
            <>
              <div className={ui.compare}>
                {[["As built", compiled.net], [optimized ? "Optimized" : "Optimized (no change)", optimized ? optFor.net : compiled.net]].map(([label, n]) => {
                  const net = n as typeof compiled.net;
                  return (
                    <div key={label as string} className={`${ui.side} ${label === "Optimized" ? ui.win : ""}`}>
                      <span className="m mute">{label as string}</span>
                      <b className={ui.num}>{net.gates}</b>
                      <span className="m">{net.nand} NAND{net.latch ? ` + ${net.latch} LATCH` : ""}</span>
                      <dl className={`m ${ui.kv}`}>
                        <dt>Gas per check</dt><dd>≈ {gasOf(net.gates).toLocaleString("en-US")}</dd>
                        <dt>Transistors to mint</dt><dd>{net.gates}{cost ? ` · ${formatEther(cost.price * BigInt(net.gates))} OKB` : ""}</dd>
                      </dl>
                    </div>
                  );
                })}
              </div>
              <p className={`${optimized ? "lime" : "mute"} ${ui.verdict}`} role="status">
                {optimized
                  ? `${optFor.saved.gates} gates cut (${Math.round((100 * optFor.saved.gates) / compiled.net.gates)}%): ≈ ${(gasOf(compiled.net.gates) - gasOf(optFor.net.gates)).toLocaleString("en-US")} less gas on every check, and ${optFor.saved.gates} fewer transistors to mint. Proved identical on ${optFor.proof!.method === "exhaustive" ? `every one of the ${optFor.proof!.assignments.toLocaleString("en-US")} inputs${compiled.nState ? " and states" : ""}` : `all 2^${Math.round(Math.log2(optFor.proof!.assignments))} inputs, by comparing exact BDDs`}.`
                  : optFor.kept === "the candidate failed the equivalence check" ? "A smaller candidate failed the equivalence check, so the original is kept."
                  : "Already minimal: none of the rewrites finds a smaller circuit that does exactly the same."}
              </p>
              {optimized && (
                <label className={`m ${ui.toggle}`}>
                  <input type="checkbox" checked={useOpt} onChange={(e) => { setUseOpt(e.target.checked); setProof(null); }} />
                  Tape out the optimized circuit {useOpt ? "" : "(using the circuit as built)"}
                </label>
              )}
              {optFor.passes.length > 0 && <p className={`m mute ${ui.passes}`}>{optFor.passes.join(" · ")}</p>}
            </>
          )}
        <p className="oc-say">Merges gates that compute the same function, drops conditions another condition already implies, and removes gates that can be tied to a constant without changing any answer. The interface, the latches and the state bits stay exactly as they were.</p>
      </section>

      <section className="st-prove" data-a>
        <div className="sim-h m"><span className="lime">04</span> Prove it · {active && active !== compiled ? "the optimized bytes" : "the bytes"} against the rule</div>
        <div className="st-prove-row">
          <button className="btn lime" disabled={!active || progress !== null || !settled} onClick={runProof}><span>{!settled && active ? "Optimizing first…" : progress !== null ? `Checking… ${Math.round(progress * 100)}%` : proven ? "Proven · run again" : "Prove it against the rule"}</span> <span className="k">→</span></button>
          {progress !== null && <div className="st-bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ transform: `scaleX(${progress})` }} /></div>}
          {proof && active && proof.hash === active.net.keccak && (
            <p className={`m ${proof.p.mismatches ? "red" : "lime"}`} role="status">
              {proof.p.mismatches ? `${proof.p.mismatches.toLocaleString()} mismatches in ${proof.p.checked.toLocaleString()} inputs. First: ${JSON.stringify(proof.p.example?.fields)}` : `${proof.p.checked.toLocaleString()} inputs checked, 0 mismatches: ${proof.p.mode}.`}
            </p>
          )}
        </div>
        <p className="oc-say">The netlist is decoded from its own TAP-02 bytes and checked against the rule written in plain code: run on every input, 32 at a time, or for Payee Guard&apos;s 8.6 billion inputs, both turned into BDDs, a form in which two circuits that agree on every input come out identical. The same bytes are what TapeOut stores and what the registry pins by hash.</p>
        <div className="st-draft m">
          <Link className={`dt-btn${draftCode ? "" : " off"}`} href={draftCode ? `/app/simulate?draft=${draftCode}` : "#"} aria-disabled={!draftCode}>Try it on payments in the simulator →</Link>
          <button className="dt-btn" disabled={!draftCode} onClick={() => { navigator.clipboard?.writeText(`${location.origin}/app/studio?draft=${draftCode}`); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? "Draft link copied" : "Copy a link to this draft"}</button>
          <span className="mute">Both are free: nothing is taped out until you say so below.</span>
        </div>
      </section>

      <section className="st-ship" data-a>
        <div className="sim-h m"><span className="lime">05</span> Tape it out and list it</div>
        <div className="st-ship-grid">
          <div className="st-fields">
            <label className="oc-f m"><span>Name</span><input aria-label="Fuse name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Careful Cap" /></label>
            <label className="oc-f m"><span>One line for the market (optional)</span><input aria-label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={200} placeholder={`Allows a payment when ${text}.`.slice(0, 90)} /></label>
            <label className="oc-f m"><span>Fee per check (USD₮0)</span><input aria-label="Fee per check in USD₮0" value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" /></label>
            <p className="m mute" style={{ fontSize: 10.5, lineHeight: 1.6 }}>90% of every fee goes to whoever holds the circuit NFT; Fusebox keeps 10%. The description is written on X Layer with the listing.</p>
          </div>
          <div className="st-go">
            {liveId && !made && (
              <div className="st-live" role="note">
                <p><b className="lime">Already live as fuse #{liveId}.</b> This exact circuit is on X Layer mainnet, so a wallet can use it today with nothing to tape out. Taping out a copy is still allowed.</p>
                <div className="prow"><Link className="btn lime" href={`/app/new?f=${liveId}`}><span>Use it in a wallet</span> <span className="k">→</span></Link><Link className="btn" href={`/app/fuse/${liveId}`}>Its page</Link></div>
              </div>
            )}
            {!account ? <ConnectChoices /> : (
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

      <section className={ui.records} data-a aria-labelledby="golf-records">
        <div className="sim-h m"><span className="lime">06</span> <span id="golf-records">Gate golf records</span></div>
        <div className={ui.tables}>
          <div>
            <p className="m mute">Fusebox&apos;s circuits, through the optimizer</p>
            <table className={`m ${ui.table}`}>
              <thead><tr><th>Circuit</th><th>Gates</th><th>After</th></tr></thead>
              <tbody>{records.ours.map((x) => <tr key={x.title}><td>{x.title}{"circuit" in x && x.circuit ? <small> · TapeOut #{String(x.circuit)}</small> : x.kind === "rival" ? <small> · rival</small> : null}</td><td>{x.gates}</td><td className={x.improved ? "lime" : "mute"}>{x.improved ? x.optimized : "minimal"}</td></tr>)}</tbody>
            </table>
            <p className="m mute">Hand-built to the gate: none of them has a gate the optimizer can cut.</p>
          </div>
          <div>
            <p className="m mute">Rules people write in the Studio</p>
            <table className={`m ${ui.table}`}>
              <thead><tr><th>Rule</th><th>Gates</th><th>After</th></tr></thead>
              <tbody>{records.examples.map((x) => <tr key={x.title}><td>{x.title}</td><td>{x.gates}</td><td className="lime">{x.optimized} <small>−{Math.round((100 * (x.gates - x.optimized)) / x.gates)}%</small></td></tr>)}</tbody>
            </table>
            <p className="m mute">Every smaller circuit proved identical on every input. Gas ≈ {records.gasModel.base.toLocaleString("en-US")} + {records.gasModel.perGate.toLocaleString("en-US")} per gate, fitted to the four shipped fuses&apos; measured gas per check.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Gas per check, from the shipped fuses' measured gas (see records.gasModel). */
const gasOf = (gates: number) => Math.round((records.gasModel.base + records.gasModel.perGate * gates) / 100) * 100;
