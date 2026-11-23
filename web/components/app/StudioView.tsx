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
import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";

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
const MODE_LABEL_ZH: Record<GroupMode, string> = { all: "全部满足", any: "任一满足", atleast: "至少", none: "都不满足" };
const MODE_WORD_ZH: Record<GroupMode, string> = { all: "且", any: "或", atleast: "·", none: "·" };

// ---- 简体中文 for the text lib/studio.ts and lib/studioProof.ts produce, mapped at display time (the rule, the
// on-chain description and the draft link stay exactly as compiled)
/** each condition's label (CONDS), by socket and kind */
const COND_ZH: Record<string, (k: number) => string> = {
  "1:total": () => "今日累计不超过限额",
  "1:each": () => "本笔付款不超过限额",
  "1:half": () => "本笔付款不超过限额的一半",
  "1:fixed": (k) => `本笔付款不超过 ${k} USD₮0（无论设置如何）`,
  "2:listed": () => "收款方已保存",
  "2:cooled": () => "其冷静期已结束",
  "2:trial": () => "本笔付款在试付额度内",
  "2:age": (k) => `保存至今至少 ${k} 小时`,
  "2:fixed": (k) => `本笔付款不超过 ${k} USD₮0`,
  "4:small": () => "本笔付款不超过阈值",
  "4:kof3": (k) => `3 位审批人中至少 ${k} 位已签名`,
  "4:seat": (k) => `席位 ${k} 已签名`,
  "4:fixed": (k) => `本笔付款不超过 ${k} USD₮0`,
  "5:fresh": () => "窗口期内没有付过同一笔款",
  "5:cleared": () => "所有者已放行这次重复",
};
const condLabelZh = (socket: number, c: Cond) => COND_ZH[`${socket}:${c.kind}`]?.(c.k) ?? condOf(socket, c.kind)?.label(c.k) ?? c.kind;
const PARAM_ZH: Record<string, string> = { "Fixed limit (USD₮0)": "固定上限（USD₮0）", Hours: "小时数", Approvers: "审批人数", Seat: "席位" };
const paramZh = (l: string) => PARAM_ZH[l] ?? l;
/** ruleText, in Chinese: the same structure, phrase by phrase */
function ruleTextZh(r: Rule): string {
  if (r.socket === 3) {
    if (r.strikes === 1) return "向陌生地址付款会让它熔断，并一直保持熔断，直到所有者重置";
    return `${r.strikes === 2 ? "第一笔付给陌生地址的付款" : `前 ${r.strikes - 1} 笔付给陌生地址的付款`}被拒绝并计数；第 ${r.strikes} 笔会让它熔断，直到所有者重置`;
  }
  const phrase = (g: Cond[], op: GroupOp) => {
    const ls = g.map((c) => condLabelZh(r.socket, c));
    if (op.m === "any") return ls.length === 1 ? ls[0] : ls.length === 2 ? `${ls[0]}，或${ls[1]}` : `以下任一：${ls.join("、")}`;
    if (op.m === "none") return ls.length === 1 ? `并非：${ls[0]}` : `以下都不满足：${ls.join("、")}`;
    if (op.m === "atleast") return `以下至少 ${op.k} 项：${ls.join("、")}`;
    return ls.join("，且");
  };
  return r.groups.map((g, i) => phrase(g, opOf(r, i))).map((s) => (r.groups.length > 1 ? `（${s}）` : s)).join((r.join ?? "any") === "all" ? "且" : "或");
}
/** ruleProblem's messages */
const PROBLEM_ZH: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Pick 1, 2 or 3 strikes$/, () => "请选择 1、2 或 3 次"],
  [/^Add a condition$/, () => "请添加一个条件"],
  [/^Every group needs at least one condition$/, () => "每组至少需要一个条件"],
  [/^Every group needs its own setting$/, () => "每组都需要自己的设置"],
  [/^Unknown group setting$/, () => "未知的组设置"],
  [/^"At least" needs a number from 1 to (\d+)$/, (m) => `“至少”需要 1 到 ${m[1]} 之间的数字`],
  [/^Unknown condition$/, () => "未知条件"],
  [/^(.+): (\d+) to (\d+)$/, (m) => `${paramZh(m[1])}：${m[2]} 到 ${m[3]}`],
];
/** the proof's summary of what it checked (lib/studioProof.ts) */
const MODE_ZH: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^every one of the 2\^(\d+) inputs \((.+)\), proved with BDDs: the circuit and the rule are the same function$/, (m) => `全部 2^${m[1]} 个输入（${m[2]}），用 BDD 证明：电路与规则是同一个函数`],
  [/^every one of the 2\^(\d+) inputs, compared with BDDs$/, (m) => `全部 2^${m[1]} 个输入，用 BDD 比较`],
  [/^every state with every input \((.+)\), so every sequence of payments follows the rule; plus (.+) random beats in a row$/, (m) => `每种状态配每个输入（${m[1]}），因此任何付款序列都遵循规则；另加连续 ${m[2]} 个随机节拍`],
  [/^every one of the 2\^(\d+) inputs$/, (m) => `全部 2^${m[1]} 个输入`],
  [/^each comparator's (.+) operand pairs with the payee saved and not, plus (.+) random inputs$/, (m) => `每个比较器的 ${m[1]} 组操作数（收款方已保存和未保存各一遍），另加 ${m[2]} 个随机输入`],
];
/** the optimizer's pass log (lib/circuits/optimize.ts) */
const PASS_ZH: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^structural: (.+) gates$/, (m) => `结构化：${m[1]} 个门`],
  [/^functional reduction: (.+) gates$/, (m) => `功能化简：${m[1]} 个门`],
  [/^redundancy removal: (.+) gates$/, (m) => `冗余消除：${m[1]} 个门`],
  [/^functional passes skipped: the BDDs grew too large$/, () => "已跳过功能化简：BDD 过大"],
];
const mapZh = (table: [RegExp, (m: RegExpExecArray) => string][], s: string) => { for (const [re, f] of table) { const m = re.exec(s); if (m) return f(m); } return s; };
/** the example rules in the gate golf records (optimize-records.json) */
const EXAMPLE_ZH: Record<string, string> = {
  "Today's total within the cap and this payment within the cap": "今日累计在限额内，且本笔在限额内",
  "This payment within the cap and within half the cap": "本笔在限额内，且在限额的一半以内",
  "At most 100 USD₮0 and at most 50 USD₮0": "最多 100 USD₮0，且最多 50 USD₮0",
  "Today's total within the cap and at most 100 USD₮0": "今日累计在限额内，且最多 100 USD₮0",
  "Under the threshold, or seat 1 and two of three signed (Studio's default)": "低于阈值，或席位 1 签名且三签二（Studio 默认）",
  "At most 50, or at most 20 with two of three signed": "最多 50，或三签二时最多 20",
};
const OPT_LABEL_ZH: Record<string, string> = { "As built": "原始构建", Optimized: "已优化", "Optimized (no change)": "已优化（无变化）" };
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
  const { t: tr, zh } = useLang();
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
  // what the page shows; `text` itself is what goes on-chain and into the draft
  const shown = zh ? ruleTextZh(rule) : text;
  const problemShown = problem && zh ? mapZh(PROBLEM_ZH, problem) : problem;
  const condLabel = (c: Cond) => (zh ? condLabelZh(socket, c) : condOf(socket, c.kind)!.label(c.k));
  const feeOk = /^\d+(\.\d{1,6})?$/.test(fee.trim()) && Number(fee) <= 1;
  const metaUri = encodeMeta({ name: name.trim() || undefined, summary: (summary.trim() || `Allows a payment when ${text}.`).slice(0, 200), rule: text.slice(0, 160), designer: account ? short(account) : undefined, params: paramLabels(rule) });

  const q = useTxQueue<Ctx>();
  const [made, setMade] = useState<Ctx | null>(null);
  const blocker = !account ? tr("Connect the wallet that will own the circuit", "连接将持有该电路的钱包") : !compiled ? tr("Fix the rule first", "请先修正规则") : overBudget ? tr("Over the 512-gate budget", "超出 512 个门的预算") : !proven ? tr("Prove it first", "请先完成证明") : !name.trim() ? tr("Give it a name", "请给它起个名字") : !feeOk ? tr("A fee from 0 to 1 USD₮0", "费用需在 0 到 1 USD₮0 之间") : okbCost !== null && cost?.okb != null && cost.okb < okbCost ? tr(`Needs ${formatEther(okbCost)} OKB plus gas; this wallet has ${formatEther(cost.okb)}`, `需要 ${formatEther(okbCost)} OKB 加 gas；这个钱包只有 ${formatEther(cost.okb)}`) : null;
  const launch = async () => {
    if (!active || !cost || !account) return;
    const net = active.net;
    const steps = [];
    if (needN > 0n) steps.push({ id: "nand", label: tr(`Mint ${needN} NAND transistors`, `铸造 ${needN} 个 NAND 晶体管`), detail: `${formatEther(cost.price * needN + cost.pfee)} OKB`, run: () => write(payable({ address: cost.T, abi: transistorsAbi, functionName: "mint", args: [0n, needN], value: cost.price * needN + cost.pfee })) });
    if (needL > 0n) steps.push({ id: "latch", label: tr(`Mint ${needL} LATCH transistor${needL > 1n ? "s" : ""}`, `铸造 ${needL} 个 LATCH 晶体管`), detail: `${formatEther(cost.price * needL + cost.pfee)} OKB`, run: () => write(payable({ address: cost.T, abi: transistorsAbi, functionName: "mint", args: [1n, needL], value: cost.price * needL + cost.pfee })) });
    steps.push({ id: "tape", label: tr("Tape it out on TapeOut", "在 TapeOut 上流片"), detail: tr(`${net.gates} gates · ${formatEther(cost.tape)} OKB`, `${net.gates} 个门 · ${formatEther(cost.tape)} OKB`), run: () => write(payable({ address: PROCESSOR, abi: tapeoutProcessorAbi, functionName: "tapeout", args: [net.hex as Hex, active.nIn, 1], value: cost.tape })),
      after: (r: { logs: { address: string; data: Hex; topics: Hex[] }[] }, c: Ctx) => { for (const l of r.logs) { if (l.address.toLowerCase() !== PROCESSOR.toLowerCase()) continue; try { const ev = decodeEventLog({ abi: tapeoutProcessorAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }); if (ev.eventName === "TapedOut") c.circuitId = ev.args.circuitId; } catch {} } } });
    steps.push({ id: "list", label: tr("List it in the fuse market", "在保险丝市场上架"), detail: tr(`${fee} USD₮0 a check, described on-chain`, `每次检查 ${fee} USD₮0，描述写在链上`), run: (c: Ctx) => write({ address: CURRENT.registry, abi: fuseRegistryAbi, functionName: "list", args: [PROCESSOR, c.circuitId!, socket, net.keccak as Hex, parseUnits(fee.trim(), 6), metaUri] }),
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
      <PageChrome title="Fuse Studio" sub={tr("Any rule, no code", "任意规则，无需代码")} info={tr(<p>Build any payment rule without code. Combine conditions with all, any, at least or none; Fusebox turns it into TapeOut gates, trims every gate it doesn&apos;t need and proves it matches your rule on every possible input. Tape it out from your own wallet: it lists in the market and earns you its fee on every check, the no&apos;s included.</p>, <p>无需代码即可构建任意付款规则。用“全部满足”“任一满足”“至少”或“都不满足”组合条件；Fusebox 把它变成 TapeOut 门电路，删掉所有用不到的门，并证明它在每一种可能的输入上都与你的规则一致。用你自己的钱包流片：它会在市场上架，每次检查都为你赚取费用，拒绝的也算。</p>)} />
      <section className="try-head m-hide">
        <h1 className="disp" data-a>Fuse <span className="lime">[studio]</span>.</h1>
        <p data-a>{tr(<><b>Build any payment rule. No code.</b> Start from a ready-made rule or your own, and combine conditions with all, any, at least or none. Fusebox turns it into TapeOut gates, trims every gate it doesn&apos;t need and proves it matches your rule on every possible input. Tape it out from your own wallet: it guards real payments in Fusebox wallets, lists in the market, and earns you its fee on every check.</>, <><b>构建任意付款规则，无需代码。</b>从现成规则或你自己的规则开始，用“全部满足”“任一满足”“至少”或“都不满足”组合条件。Fusebox 把它变成 TapeOut 门电路，删掉所有用不到的门，并证明它在每一种可能的输入上都与你的规则一致。用你自己的钱包流片：它守护 Fusebox 钱包里的真实付款，在市场上架，每次检查都为你赚取费用。</>)}</p>
      </section>

      <h2 className="sr">{tr("1. Pick a socket", "1. 选择插槽")}</h2>
      <div className="st-sockets" data-a role="tablist" aria-label={tr("Socket", "插槽")}>
        {SOCKET_ORDER.map((s) => (
          <button key={s} role="tab" aria-selected={socket === s} className={socket === s ? "on" : ""} onClick={() => pick(s)}>
            <span className="m mute">{tr("Socket", "插槽")} {s}</span><b>{SOCKETS[s].name}</b><small>{SOCKETS[s].pins.map(([n, w]) => `${n}${w > 1 ? `[${w}]` : ""}`).join(" · ")}</small>
          </button>
        ))}
      </div>

      <section className="st-lib" data-a aria-labelledby="st-lib-h">
        <div className="st-lib-h m"><span id="st-lib-h">{tr("Ready-made", "现成规则")} · {SOCKETS[socket].name}</span><span className="mute">{tr(`${LIBRARY.length} rules in the library · tap one, then change anything`, `库中共 ${LIBRARY.length} 条规则 · 点选一条，再随意修改`)}</span></div>
        <div className="st-lib-row">
          {LIB.filter((x) => x.t.rule.socket === socket).map((x) => {
            const on = x.meaning === meaning, fid = live[x.hash];
            return (
              <button key={x.t.id} className={`st-lib-card${on ? " on" : ""}`} aria-pressed={on} onClick={() => loadTemplate(x.t)}>
                <b>{zh ? x.t.nameZh ?? x.t.name : x.t.name}</b>
                <span className="st-lib-when">{zh ? x.t.whenZh ?? x.t.when : x.t.when}</span>
                <span className="st-lib-meta m"><span>{tr(`${x.gates} gates`, `${x.gates} 个门`)}</span>{fid ? <span className="lime">{tr("Live · fuse", "已上线 · 保险丝")} #{fid}</span> : <span>{tr("Yours to tape out", "待你流片")}</span>}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="st-main" data-a>
        <div className="st-rule">
          <div className="sim-h m"><span className="lime">01</span> {tr("The rule · allow a payment when…", "规则 · 满足以下条件时允许付款…")}</div>
          {socket === 3 ? (
            <div className="st-strikes">
              <p className="oc-say">{tr("The Breaker socket is sequential: the circuit keeps latches on X Layer. A payment to a stranger is refused and counted; at the last strike it blows, and everything is refused until the owner resets it. A freeze blows it at once.", "Breaker 插槽是时序电路：电路在 X Layer 上保存锁存器。付给陌生地址的付款会被拒绝并计数；到最后一次时它熔断，此后所有付款都被拒绝，直到所有者重置。冻结会让它立即熔断。")}</p>
              <div className="sim-presets">{[1, 2, 3].map((n) => <button key={n} className={`dt-btn${strikes === n ? " on" : ""}`} aria-pressed={strikes === n} onClick={() => { setStrikes(n); setProof(null); }}>{tr(`${n} strike${n > 1 ? "s" : ""}`, `第 ${n} 次熔断`)}</button>)}</div>
            </div>
          ) : (
            <>
              <p className="m mute st-hint">{tr("No code: pick conditions, then choose how each group combines them. Before anything is taped out, the circuit is proved against your rule on every possible input: all 16.7 million for a daily-cap rule, all 8.6 billion for a payee rule.", "无需代码：选好条件，再为每组选择组合方式。流片之前，电路会在每一种可能的输入上对照你的规则完成证明：每日限额规则共 1670 万个输入，收款方规则共 86 亿个，全部覆盖。")}</p>
              {lines.length > 1 && (
                <div className="st-join m" role="radiogroup" aria-label={tr("How the groups combine", "各组如何组合")}>
                  <span>{tr("Let a payment through when", "放行付款的条件：")}</span>
                  {(["any", "all"] as Join[]).map((j) => <button key={j} role="radio" aria-checked={join === j} className={`dt-btn${join === j ? " on" : ""}`} onClick={() => { setJoin(j); setProof(null); }}>{j === "any" ? tr("any group holds", "任一组成立") : tr("every group holds", "每组都成立")}</button>)}
                </div>
              )}
              {lines.map((l, gi) => (
                <div key={gi}>
                  {gi > 0 && <div className="st-or m">{join === "all" ? tr("and", "且") : tr("or", "或")}</div>}
                  <div className="st-group">
                    <div className="st-mode m" role="radiogroup" aria-label={tr(`Group ${gi + 1}: how its conditions combine`, `第 ${gi + 1} 组：条件如何组合`)}>
                      {(["all", "any", "atleast", "none"] as GroupMode[]).map((m) => (
                        <button key={m} role="radio" aria-checked={l.op.m === m} className={`dt-btn${l.op.m === m ? " on" : ""}`} disabled={m === "atleast" && l.conds.length < 2}
                          onClick={() => setOp(gi, { m, k: m === "atleast" ? Math.min(2, l.conds.length) : 0 })}>{zh ? MODE_LABEL_ZH[m] : MODE_LABEL[m]}</button>
                      ))}
                      {l.op.m === "atleast" && <label className="st-k m"><span className="sr">{tr("How many", "几项")}</span><input aria-label={tr(`Group ${gi + 1}: at least how many`, `第 ${gi + 1} 组：至少几项`)} value={l.op.k} onChange={(e) => setOp(gi, { m: "atleast", k: Number(e.target.value.replace(/\D/g, "")) || 1 })} inputMode="numeric" /><span className="mute">{tr(`of ${l.conds.length}`, `/ ${l.conds.length} 项`)}</span></label>}
                    </div>
                    {l.conds.map((c, ci) => {
                      const d = condOf(socket, c.kind)!;
                      const pl = d.param ? (zh ? paramZh(d.param.label) : d.param.label) : "";
                      return (
                        <div key={ci} className="st-cond">
                          {ci > 0 && <span className="m mute st-and">{zh ? MODE_WORD_ZH[l.op.m] : MODE_WORD[l.op.m]}</span>}
                          <span className="st-text">{condLabel(c)}</span>
                          {d.param && <label className="st-k m"><span className="sr">{pl}</span><input aria-label={pl} value={c.k} onChange={(e) => setCond(gi, ci, { kind: c.kind, k: Number(e.target.value.replace(/\D/g, "")) || 0 })} inputMode="numeric" /></label>}
                          <button className="sim-x" aria-label={tr(`Remove: ${condLabel(c)}`, `删除：${condLabel(c)}`)} onClick={() => setCond(gi, ci, null)}>×</button>
                        </div>
                      );
                    })}
                    <select className="st-add m" aria-label={tr(`Add a condition to group ${gi + 1}`, `向第 ${gi + 1} 组添加条件`)} value="" onChange={(e) => { if (e.target.value) addCond(gi, e.target.value); }}>
                      <option value="">{tr("+ add a condition…", "+ 添加条件…")}</option>
                      {CONDS[socket].map((d) => <option key={d.kind} value={d.kind}>{condLabel({ kind: d.kind, k: d.param?.def ?? 0 })}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              <select className="st-add m st-or-add" aria-label={tr("Add another group", "再加一组")} value="" onChange={(e) => { if (e.target.value) { const d = condOf(socket, e.target.value)!; editLines((ls) => [...ls, { conds: [{ kind: e.target.value, k: d.param?.def ?? 0 }], op: { m: "all", k: 0 } }]); } }}>
                <option value="">{tr("+ add another group…", "+ 再加一组…")}</option>
                {CONDS[socket].map((d) => <option key={d.kind} value={d.kind}>{condLabel({ kind: d.kind, k: d.param?.def ?? 0 })}</option>)}
              </select>
            </>
          )}
          <p className="st-sentence">{problem ? <span className="red">{problemShown}</span> : tr(<>Allows a payment when <b>{text}</b>.</>, <>满足以下条件时允许付款：<b>{shown}</b>。</>)}</p>
        </div>

        <div className="st-chip">
          <div className="sim-h m"><span className="lime">02</span> {tr("The circuit · compiled as you edit", "电路 · 边改边编译")}</div>
          {compiled ? (
            <>
              <canvas ref={cv} className="st-canvas" aria-label={tr(`Netlist: ${compiled.net.nand} NAND gates${compiled.net.latch ? ` and ${compiled.net.latch} LATCH` : ""}`, `网表：${compiled.net.nand} 个 NAND 门${compiled.net.latch ? `和 ${compiled.net.latch} 个 LATCH` : ""}`)} />
              <div className="m kv fv-kv st-kv">
                <span>{tr("Gates", "门")}</span><span>{compiled.net.nand} NAND{compiled.net.latch ? ` + ${compiled.net.latch} LATCH` : ""}</span>
                <span>{tr("Budget", "预算")}</span><span className={overBudget ? "red" : ""}>{tr(`${compiled.net.gates} of 512`, `${compiled.net.gates} / 512`)}</span>
                <span>{tr("Inputs", "输入")}</span><span>{tr(`${compiled.nIn} · 1 output`, `${compiled.nIn} · 1 个输出`)}</span>
                <span>{tr("Netlist", "网表")}</span><span title={compiled.net.keccak}>{compiled.net.bytes.length} {tr("bytes", "字节")} · {compiled.net.keccak.slice(0, 10)}…</span>
                <span>{tr("Tape-out", "流片")}</span><span>{okbCost !== null ? `${formatEther(okbCost)} OKB + gas` : tr("reading TapeOut…", "正在读取 TapeOut…")}</span>
              </div>
              <div className="st-meter" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, compiled.net.gates / 512)})` }} className={overBudget ? "over" : ""} /></div>
            </>
          ) : <p className="m mute">{problemShown ?? tr("Couldn't compile this rule.", "无法编译这条规则。")}</p>}
        </div>
      </section>

      <section className={ui.opt} data-a aria-label={tr("Optimize", "优化")}>
        <div className="sim-h m"><span className="lime">03</span> {tr("Optimize · gate golf", "优化 · 门数高尔夫")}</div>
        {!compiled ? <p className="m mute">{problemShown ?? tr("Couldn't compile this rule.", "无法编译这条规则。")}</p>
          : optProgress !== null || !optFor ? (
            <div className={ui.working}>
              <p className="m mute" role="status">{tr("Looking for a smaller circuit that does exactly the same…", "正在寻找功能完全相同的更小电路…")} {optProgress !== null ? `${Math.round(optProgress * 100)}%` : ""}</p>
              <div className="st-bar" aria-hidden="true"><i style={{ transform: `scaleX(${optProgress ?? 0})` }} /></div>
            </div>
          ) : (
            <>
              <div className={ui.compare}>
                {[["As built", compiled.net], [optimized ? "Optimized" : "Optimized (no change)", optimized ? optFor.net : compiled.net]].map(([label, n]) => {
                  const net = n as typeof compiled.net;
                  return (
                    <div key={label as string} className={`${ui.side} ${label === "Optimized" ? ui.win : ""}`}>
                      <span className="m mute">{zh ? OPT_LABEL_ZH[label as string] ?? (label as string) : (label as string)}</span>
                      <b className={ui.num}>{net.gates}</b>
                      <span className="m">{net.nand} NAND{net.latch ? ` + ${net.latch} LATCH` : ""}</span>
                      <dl className={`m ${ui.kv}`}>
                        <dt>{tr("Gas per check", "每次检查的 gas")}</dt><dd>≈ {gasOf(net.gates).toLocaleString("en-US")}</dd>
                        <dt>{tr("Transistors to mint", "需铸造的晶体管")}</dt><dd>{net.gates}{cost ? ` · ${formatEther(cost.price * BigInt(net.gates))} OKB` : ""}</dd>
                      </dl>
                    </div>
                  );
                })}
              </div>
              <p className={`${optimized ? "lime" : "mute"} ${ui.verdict}`} role="status">
                {optimized
                  ? tr(`${optFor.saved.gates} gates cut (${Math.round((100 * optFor.saved.gates) / compiled.net.gates)}%): ≈ ${(gasOf(compiled.net.gates) - gasOf(optFor.net.gates)).toLocaleString("en-US")} less gas on every check, and ${optFor.saved.gates} fewer transistors to mint. Proved identical on ${optFor.proof!.method === "exhaustive" ? `every one of the ${optFor.proof!.assignments.toLocaleString("en-US")} inputs${compiled.nState ? " and states" : ""}` : `all 2^${Math.round(Math.log2(optFor.proof!.assignments))} inputs, by comparing exact BDDs`}.`,
                    `减少 ${optFor.saved.gates} 个门（${Math.round((100 * optFor.saved.gates) / compiled.net.gates)}%）：每次检查约省 ${(gasOf(compiled.net.gates) - gasOf(optFor.net.gates)).toLocaleString("en-US")} gas，少铸造 ${optFor.saved.gates} 个晶体管。${optFor.proof!.method === "exhaustive" ? `已在全部 ${optFor.proof!.assignments.toLocaleString("en-US")} 个输入${compiled.nState ? "和状态" : ""}上证明完全一致` : `已通过比较精确 BDD，在全部 2^${Math.round(Math.log2(optFor.proof!.assignments))} 个输入上证明完全一致`}。`)
                  : optFor.kept === "the candidate failed the equivalence check" ? tr("A smaller candidate failed the equivalence check, so the original is kept.", "更小的候选电路未通过等价性检查，因此保留原电路。")
                  : tr("Already minimal: none of the rewrites finds a smaller circuit that does exactly the same.", "已是最小：任何改写都找不到功能完全相同的更小电路。")}
              </p>
              {optimized && (
                <label className={`m ${ui.toggle}`}>
                  <input type="checkbox" checked={useOpt} onChange={(e) => { setUseOpt(e.target.checked); setProof(null); }} />
                  {tr("Tape out the optimized circuit", "流片优化后的电路")} {useOpt ? "" : tr("(using the circuit as built)", "（当前使用原始电路）")}
                </label>
              )}
              {optFor.passes.length > 0 && <p className={`m mute ${ui.passes}`}>{(zh ? optFor.passes.map((p) => mapZh(PASS_ZH, p)) : optFor.passes).join(" · ")}</p>}
            </>
          )}
        <p className="oc-say">{tr("Merges gates that compute the same function, drops conditions another condition already implies, and removes gates that can be tied to a constant without changing any answer. The interface, the latches and the state bits stay exactly as they were.", "合并计算相同函数的门，去掉已被其他条件蕴含的条件，并移除那些接成常量也不改变任何结果的门。接口、锁存器和状态位保持原样。")}</p>
      </section>

      <section className="st-prove" data-a>
        <div className="sim-h m"><span className="lime">04</span> {tr(<>Prove it · {active && active !== compiled ? "the optimized bytes" : "the bytes"} against the rule</>, <>证明 · 对照规则检验{active && active !== compiled ? "优化后的" : ""}字节</>)}</div>
        <div className="st-prove-row">
          <button className="btn lime" disabled={!active || progress !== null || !settled} onClick={runProof}><span>{!settled && active ? tr("Optimizing first…", "先完成优化…") : progress !== null ? `${tr("Checking…", "检查中…")} ${Math.round(progress * 100)}%` : proven ? tr("Proven · run again", "已证明 · 再跑一次") : tr("Prove it against the rule", "对照规则证明")}</span> <span className="k">→</span></button>
          {progress !== null && <div className="st-bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ transform: `scaleX(${progress})` }} /></div>}
          {proof && active && proof.hash === active.net.keccak && (
            <p className={`m ${proof.p.mismatches ? "red" : "lime"}`} role="status">
              {proof.p.mismatches
                ? tr(`${proof.p.mismatches.toLocaleString()} mismatches in ${proof.p.checked.toLocaleString()} inputs. First: ${JSON.stringify(proof.p.example?.fields)}`, `${proof.p.checked.toLocaleString()} 个输入中有 ${proof.p.mismatches.toLocaleString()} 处不一致。第一处：${JSON.stringify(proof.p.example?.fields)}`)
                : tr(`${proof.p.checked.toLocaleString()} inputs checked, 0 mismatches: ${proof.p.mode}.`, `已检查 ${proof.p.checked.toLocaleString()} 个输入，0 处不一致：${mapZh(MODE_ZH, proof.p.mode)}。`)}
            </p>
          )}
        </div>
        <p className="oc-say">{tr("The netlist is decoded from its own TAP-02 bytes and checked against the rule written in plain code: run on every input, 32 at a time, or for Payee Guard's 8.6 billion inputs, both turned into BDDs, a form in which two circuits that agree on every input come out identical. The same bytes are what TapeOut stores and what the registry pins by hash.", "网表从它自己的 TAP-02 字节解码，再与用普通代码写成的规则对照：每个输入都跑一遍，每次 32 个；Payee Guard 有 86 亿个输入，就把两者都转成 BDD。在这种形式下，两个在所有输入上都一致的电路会完全相同。TapeOut 存储的、注册表按哈希锁定的，正是这些字节。")}</p>
        <div className="st-draft m">
          <Link className={`dt-btn${draftCode ? "" : " off"}`} href={draftCode ? `/app/simulate?draft=${draftCode}` : "#"} aria-disabled={!draftCode}>{tr("Try it on payments in the simulator →", "在模拟器里用付款试试 →")}</Link>
          <button className="dt-btn" disabled={!draftCode} onClick={() => { navigator.clipboard?.writeText(`${location.origin}/app/studio?draft=${draftCode}`); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? tr("Draft link copied", "草稿链接已复制") : tr("Copy a link to this draft", "复制这份草稿的链接")}</button>
          <span className="mute">{tr("Both are free: nothing is taped out until you say so below.", "两者都免费：在你于下方确认之前，不会流片任何东西。")}</span>
        </div>
      </section>

      <section className="st-ship" data-a>
        <div className="sim-h m"><span className="lime">05</span> {tr("Tape it out and list it", "流片并上架")}</div>
        <div className="st-ship-grid">
          <div className="st-fields">
            <label className="oc-f m"><span>{tr("Name", "名称")}</span><input aria-label={tr("Fuse name", "保险丝名称")} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={tr("e.g. Careful Cap", "例如 Careful Cap")} /></label>
            <label className="oc-f m"><span>{tr("One line for the market (optional)", "市场上的一句话简介（可选）")}</span><input aria-label={tr("Summary", "简介")} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={200} placeholder={tr(`Allows a payment when ${text}.`, `满足以下条件时允许付款：${shown}。`).slice(0, 90)} /></label>
            <label className="oc-f m"><span>{tr("Fee per check (USD₮0)", "每次检查的费用（USD₮0）")}</span><input aria-label={tr("Fee per check in USD₮0", "每次检查的费用，单位 USD₮0")} value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" /></label>
            <p className="m mute" style={{ fontSize: 10.5, lineHeight: 1.6 }}>{tr("90% of every fee goes to whoever holds the circuit NFT; Fusebox keeps 10%. The description is written on X Layer with the listing.", "每笔费用的 90% 付给电路 NFT 的持有者，Fusebox 保留 10%。描述会随上架一起写入 X Layer。")}</p>
          </div>
          <div className="st-go">
            {liveId && !made && (
              <div className="st-live" role="note">
                <p>{tr(<><b className="lime">Already live as fuse #{liveId}.</b> This exact circuit is on X Layer mainnet, so a wallet can use it today with nothing to tape out. Taping out a copy is still allowed.</>, <><b className="lime">已作为保险丝 #{liveId} 上线。</b>完全相同的电路已在 X Layer 主网上，钱包今天就能直接使用，无需流片。你仍然可以流片一份副本。</>)}</p>
                <div className="prow"><Link className="btn lime" href={`/app/new?f=${liveId}`}><span>{tr("Use it in a wallet", "在钱包中使用")}</span> <span className="k">→</span></Link><Link className="btn" href={`/app/fuse/${liveId}`}>{tr("Its page", "详情页")}</Link></div>
              </div>
            )}
            {!account ? <ConnectChoices /> : (
              <>
                <button className="btn lime" disabled={!!blocker || q.running || !!made} onClick={launch}><span>{q.running ? tr("Working…", "处理中…") : tr("Tape out and list", "流片并上架")}</span> <span className="k">→</span></button>
                {blocker && !made && <p className="m mute">{blocker}</p>}
              </>
            )}
            {q.steps.length > 0 && (
              <ul className="txs">
                {q.steps.map((s) => <li key={s.id} className={s.state}><span className="dot" /><span className="m">{s.label}<small>{s.state === "error" ? (zh && s.error ? errZh(s.error) : s.error) : s.detail}</small></span>{s.hash ? <a className="m" href={`${OKLINK}/tx/${s.hash}`} target="_blank" rel="noreferrer">tx ↗</a> : null}</li>)}
              </ul>
            )}
            {q.steps.some((s) => s.state === "error") && <button className="btn" onClick={async () => { const ok = await q.retry(); if (ok) setMade({ ...(q.ctx() ?? {}) }); }}>{tr("Retry from the failed step", "从失败的步骤重试")}</button>}
            {made?.fuseId && (
              <div className="done-card">
                <h4>{tr("It's listed.", "已上架。")}</h4>
                <p style={{ color: "var(--soft)", fontSize: 14, lineHeight: 1.5 }}>{tr(<>Circuit <span className="m lime">#{String(made.circuitId)}</span> is on TapeOut and listed as fuse <span className="m lime">{made.fuseId}</span>. Wallets can install it now.</>, <>电路 <span className="m lime">#{String(made.circuitId)}</span> 已在 TapeOut 上，并作为保险丝 <span className="m lime">{made.fuseId}</span> 上架。钱包现在就可以安装它。</>)}</p>
                <div className="prow" style={{ marginTop: 14 }}>
                  <Link className="btn lime" href={`/app/fuse/${made.fuseId}`}>{tr("Its page →", "详情页 →")}</Link>
                  <Link className="btn" href={`/app/simulate?f=${made.fuseId}`}>{tr("Try it on payments", "用付款试试")}</Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={ui.records} data-a aria-labelledby="golf-records">
        <div className="sim-h m"><span className="lime">06</span> <span id="golf-records">{tr("Gate golf records", "门数高尔夫纪录")}</span></div>
        <div className={ui.tables}>
          <div>
            <p className="m mute">{tr("Fusebox's circuits, through the optimizer", "Fusebox 的电路，过一遍优化器")}</p>
            <table className={`m ${ui.table}`}>
              <thead><tr><th>{tr("Circuit", "电路")}</th><th>{tr("Gates", "门数")}</th><th>{tr("After", "优化后")}</th></tr></thead>
              <tbody>{records.ours.map((x) => <tr key={x.title}><td>{x.title}{"circuit" in x && x.circuit ? <small> · TapeOut #{String(x.circuit)}</small> : x.kind === "rival" ? <small> · {tr("rival", "竞品")}</small> : null}</td><td>{x.gates}</td><td className={x.improved ? "lime" : "mute"}>{x.improved ? x.optimized : tr("minimal", "已最小")}</td></tr>)}</tbody>
            </table>
            <p className="m mute">{tr("Hand-built to the gate: none of them has a gate the optimizer can cut.", "逐门手工构建：优化器在它们身上一个门也删不掉。")}</p>
          </div>
          <div>
            <p className="m mute">{tr("Rules people write in the Studio", "大家在 Studio 里写的规则")}</p>
            <table className={`m ${ui.table}`}>
              <thead><tr><th>{tr("Rule", "规则")}</th><th>{tr("Gates", "门数")}</th><th>{tr("After", "优化后")}</th></tr></thead>
              <tbody>{records.examples.map((x) => <tr key={x.title}><td>{zh ? EXAMPLE_ZH[x.title] ?? x.title : x.title}</td><td>{x.gates}</td><td className="lime">{x.optimized} <small>−{Math.round((100 * (x.gates - x.optimized)) / x.gates)}%</small></td></tr>)}</tbody>
            </table>
            <p className="m mute">{tr(<>Every smaller circuit proved identical on every input. Gas ≈ {records.gasModel.base.toLocaleString("en-US")} + {records.gasModel.perGate.toLocaleString("en-US")} per gate, fitted to the four shipped fuses&apos; measured gas per check.</>, <>每个更小的电路都已证明在所有输入上完全一致。Gas ≈ {records.gasModel.base.toLocaleString("en-US")} + 每个门 {records.gasModel.perGate.toLocaleString("en-US")}，按四个已上线保险丝实测的每次检查 gas 拟合。</>)}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Gas per check, from the shipped fuses' measured gas (see records.gasModel). */
const gasOf = (gates: number) => Math.round((records.gasModel.base + records.gasModel.perGate * gates) / 100) * 100;
