"use client";
import Link from "next/link";
import { alertsLink } from "@/lib/alerts";
import { useEffect, useMemo, useRef, useState } from "react";
import GuardrailsCard from "./GuardrailsCard";
import { decodeEventLog, domainSeparator, isAddress, parseSignature, parseUnits, getAddress, toHex, type Address, type Hex } from "viem";
import { fuseboxFactoryAbi, fuseboxSetupAbi, fuseboxWalletAbi, fuseRegistryAbi } from "@/lib/abi";
import { CURRENT, DEP, pub } from "@/lib/client-chain";
import { useTxQueue, type TxStep } from "@/lib/useTxQueue";
import { short, OKLINK } from "@/lib/hooks";
import { useMarket } from "@/lib/useMarket";
import { useWallet } from "./WalletProvider";
import ConnectChoices from "./ConnectChoices";
import { Responsive } from "./m/useMobile";
import { PageChrome } from "./m/chrome";
import { MRow, MSheet, MSticky, MChips } from "./m/ui";
import { Glyph, Plate, type GlyphName } from "./Pixel";
import Term from "./m/Term";
import { OKX_DOWNLOAD, errCode } from "@/lib/walletLinks";
import { parseEther } from "viem";
import AgentConnect from "./AgentConnect";
import { download, keyFile, loadPendingKey, newAgentKey, saveAgentKey, savePendingKey, type AgentKey } from "@/lib/agentKey";

const GAS_PER_PAY = 0.00002; // OKB a pay() costs on X Layer, roughly (Atlas's real payments)

/** The agent key made in this browser: shown once, copy or download it, and keep it here for the assistant. */
function KeyCard({ k, keep, setKeep }: { k: AgentKey; keep: boolean; setKeep: (v: boolean) => void }) {
  const [shown, setShown] = useState(false); const [copied, setCopied] = useState(false);
  return (
    <div className="keycard">
      <div className="m lime">Your agent&apos;s key · made in this browser</div>
      <div className="kc-row"><span className="m mute">Address</span><span className="m">{k.address}</span></div>
      <div className="kc-row"><span className="m mute">Private key</span><span className="m kc-secret">{shown ? k.key : "•".repeat(28)}</span></div>
      <div className="kc-acts m">
        <button className="btn" onClick={() => setShown(!shown)}>{shown ? "Hide" : "Reveal"}</button>
        <button className="btn" onClick={() => { navigator.clipboard?.writeText(k.key); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? "Copied ✓" : "Copy key"}</button>
        <button className="btn" onClick={() => download("fusebox-agent-key.txt", keyFile(null, k))}>Download</button>
      </div>
      <label className="kc-keep"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep it in this browser so the Fusebox assistant can pay for you</label>
      <p className="kc-warn">It can only ask your wallet to pay, through every fuse. Still, keep it secret: whoever holds it can spend what your fuses allow. Fusebox never sees it.</p>
    </div>
  );
}

/** What a newcomer needs before wiring up, with what Fusebox can already see. */
function NeedList({ account, bal, compact }: { account: Address | null; bal: { okb: bigint; usdt: bigint } | null; compact?: boolean }) {
  const items: [GlyphName, React.ReactNode, string, React.ReactNode][] = [
    ["key", "A wallet on X Layer", "It becomes the owner. OKX Wallet works best.", account ? <span className="mtag ok">Connected</span> : <span className="mtag no">Not yet</span>],
    ["rob", <Term key="a" k="agent">An agent key</Term>, "The address your AI agent signs with. No agent yet? Fusebox makes one for you in a later step, right in this browser.", <span className="mtag dim">Made or pasted</span>],
    ["coin", <><Term key="u" k="usdt0">USD₮0</Term> on X Layer</>, "Pays the fuses' fees and the agent's payments. Withdraw to the X Layer network from an exchange, or bridge.", !bal ? <span className="mtag dim">—</span> : bal.usdt > 0n ? <span className="mtag ok">{(Number(bal.usdt) / 1e6).toFixed(2)}</span> : <span className="mtag no">None yet</span>],
    ["status", <>A little <Term key="o" k="okb">OKB</Term> for gas</>, "For your own steps and your agent's payments; gas costs a fraction of a cent each.", !bal ? <span className="mtag dim">—</span> : bal.okb > 0n ? <span className="mtag ok">{(Number(bal.okb) / 1e18).toFixed(4)}</span> : <span className="mtag no">None yet</span>],
  ];
  return (
    <div className={`need${compact ? " compact" : ""}`}>
      {items.map(([g, title, say, st], i) => (
        <div key={i} className="need-i">
          <span className="need-ico"><Glyph name={g} size={16} /></span>
          <span className="need-t"><b>{title}</b><small>{say}</small></span>
          <span className="need-st m">{st}</span>
        </div>
      ))}
    </div>
  );
}

const erc20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "t", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "o", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
] as const;
const USDT = 1_000_000n;
// new wallets are made by the v2 factory, so they can splice in the Repeat Guard (fuse 5)
const FUSES = [
  { key: "daily-cap", id: CURRENT.fuseIds[0], name: "Daily Cap", fee: 1000n, say: "No more than your cap in a UTC day, however the agent is asked." },
  { key: "payee-guard", id: CURRENT.fuseIds[1], name: "Payee Guard", fee: 1000n, say: "Saved payees only. A newly saved payee gets a small trial amount until its cooling-off ends." },
  { key: "breaker", id: CURRENT.fuseIds[2], name: "Breaker", fee: 500n, say: "Trips on a payment to a stranger and stays blown until you reset it." },
  { key: "approval-2of3", id: CURRENT.fuseIds[3], name: "Two of Three", fee: 2000n, say: "Above a threshold, two of three approvers must sign that exact payment." },
  { key: "repeat-guard", id: CURRENT.fuseIds[4], name: "Repeat Guard", fee: 500n, say: "The same invoice sent twice gets paid once: the same amount to the same payee inside the window is stopped. You can clear a real repeat. Leave it off for an agent that pays per call." },
] as const;
type Key = (typeof FUSES)[number]["key"];
interface Permit { value: bigint; deadline: bigint; v: number; r: Hex; s: Hex }
interface Ctx { wallet?: Address; block?: number; permit?: Permit }
const NO_PERMIT: Permit = { value: 0n, deadline: 0n, v: 0, r: `0x${"0".repeat(64)}`, s: `0x${"0".repeat(64)}` };
const PERMIT_TYPES = { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] } as const;
const clamp = (v: string) => Math.max(0, Math.min(254, Math.floor(Number(v) || 0)));
const hours = (v: string) => Math.max(1, clamp(v)); // the Repeat Guard's window: 1 to 254 hours

/** Starting points: a whole line with its limits, and why it fits that kind of agent. */
const STARTERS: { id: string; name: string; why: string; on: Record<Key, boolean>; cap: string; cool: string; trial: string; thr: string; win: string }[] = [
  { id: "invoice", name: "Invoice agent", why: "Pays a known set of suppliers. New bank details get a test payment, never the invoice; big ones need two people.",
    on: { "daily-cap": true, "payee-guard": true, breaker: true, "approval-2of3": true, "repeat-guard": true }, cap: "50", cool: "24", trial: "2", thr: "20", win: "24" },
  { id: "procure", name: "Procurement bot", why: "Larger, less frequent orders. A higher cap and threshold, a longer cooling-off for a new vendor.",
    on: { "daily-cap": true, "payee-guard": true, breaker: true, "approval-2of3": true, "repeat-guard": true }, cap: "200", cool: "72", trial: "5", thr: "50", win: "72" },
  { id: "refund", name: "Refund desk", why: "Pays customers it has never paid before, so no payee book or Breaker: the daily cap and approvals carry the weight.",
    on: { "daily-cap": true, "payee-guard": false, breaker: false, "approval-2of3": true, "repeat-guard": true }, cap: "100", cool: "24", trial: "2", thr: "10", win: "24" },
  { id: "allowance", name: "Small allowance", why: "For a new or experimental agent: a few USD₮0 a day, saved payees only, one stranger blows it.",
    on: { "daily-cap": true, "payee-guard": true, breaker: true, "approval-2of3": false, "repeat-guard": false }, cap: "10", cool: "24", trial: "1", thr: "20", win: "24" },
];

function Toggle({ on, flip, name }: { on: boolean; flip: () => void; name: string }) {
  return <span className={`tg${on ? " on" : ""}`} role="checkbox" aria-checked={on} aria-label={`Splice in ${name}`} tabIndex={0} onClick={flip} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } }} data-cursor={on ? "Remove" : "Add"} />;
}
function Field({ label, v, set, suffix }: { label: string; v: string; set: (s: string) => void; suffix?: string }) {
  return <div className="field m"><label>{label}{suffix ? ` (${suffix})` : ""}</label><input aria-label={suffix ? `${label} (${suffix})` : label} value={v} onChange={(e) => set(e.target.value)} inputMode="decimal" /></div>;
}

export default function NewWalletView() {
  const { account, write, send, signTyped } = useWallet();
  const q = useTxQueue<Ctx>();
  // designers can reprice their fuses, so the wizard reads today's fee and accepts exactly that
  const { data: market } = useMarket();
  const feeOf = (f: (typeof FUSES)[number]) => { const m = market?.fuses.find((x) => x.fuseId === f.id); return m ? parseUnits(m.fee, 6) : f.fee; };
  const [agent, setAgent] = useState("");
  const [on, setOn] = useState<Record<Key, boolean>>({ "daily-cap": true, "payee-guard": true, breaker: true, "approval-2of3": true, "repeat-guard": true });
  const [cap, setCap] = useState("50"); const [cool, setCool] = useState("24"); const [trial, setTrial] = useState("2"); const [thr, setThr] = useState("20"); const [win, setWin] = useState("24");
  const [approvers, setApprovers] = useState(["", "", ""]);
  // quick setup (the default): what the agent does, who it pays, a daily limit and the money; the rest are defaults
  const [quick, setQuick] = useState(true);
  const [starterId, setStarterId] = useState("invoice");
  const [payees, setPayees] = useState<string[]>([""]);
  const [deposit, setDeposit] = useState("0.1"); const [float, setFloat] = useState("0");
  // an agent with no OKB can't send its payments: the wizard can hand it some gas
  const [gas, setGas] = useState("0.0005");
  const [genKey, setGenKey] = useState<AgentKey | null>(null); const [keepKey, setKeepKey] = useState(true);
  useEffect(() => { const k = loadPendingKey(); if (k) { setGenKey(k); setAgent((a) => a || k.address); } }, []);
  const makeKey = () => { const k = newAgentKey(); setGenKey(k); savePendingKey(k); setAgent(k.address); };
  const keyLive = genKey && agent.trim().toLowerCase() === genKey.address.toLowerCase() ? genKey : null;
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
    const [dc, pg, , ap, rg] = FUSES;
    if (v(dc.id, "a")) setCap(v(dc.id, "a")!); if (v(pg.id, "a")) setCool(v(pg.id, "a")!); if (v(pg.id, "b")) setTrial(v(pg.id, "b")!); if (v(ap.id, "a")) setThr(v(ap.id, "a")!); if (v(rg.id, "a")) setWin(v(rg.id, "a")!);
  }, []);
  const simLink = `/app/simulate?f=${FUSES.filter((x) => on[x.key]).map((x) => (x.key === "daily-cap" ? `${x.id}:${clamp(cap)}` : x.key === "payee-guard" ? `${x.id}:${clamp(cool)}:${clamp(trial)}` : x.key === "approval-2of3" ? `${x.id}:${clamp(thr)}` : x.key === "repeat-guard" ? `${x.id}:${hours(win)}` : `${x.id}`)).join(",")}`;
  useEffect(() => {
    if (!account) return;
    Promise.all([pub.getBalance({ address: account }), pub.readContract({ address: DEP.usdt0 as Address, abi: erc20, functionName: "balanceOf", args: [account] })]).then(([okb, usdt]) => setBal({ okb, usdt })).catch(() => {});
  }, [account, made]);

  const perDecision = FUSES.filter((f) => on[f.key]).reduce((t, f) => t + feeOf(f), 0n);
  const depositUnits = (() => { try { return parseUnits(deposit || "0", 6); } catch { return -1n; } })();
  const floatUnits = (() => { try { return parseUnits(float || "0", 6); } catch { return -1n; } })();
  const goodPayees = payees.filter((p) => p.trim());
  const gasWei = (() => { try { return parseEther(gas || "0"); } catch { return -1n; } })();
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!account) p.push("Connect a wallet: it becomes the owner.");
    if (!isAddress(agent.trim(), { strict: false })) p.push("Enter your agent's address.");
    else if (account && agent.trim().toLowerCase() === account.toLowerCase()) p.push("Use a separate key for the agent, not your own.");
    if (!Object.values(on).some(Boolean)) p.push("Pick at least one fuse.");
    if (on["approval-2of3"] && approvers.some((a) => !isAddress(a.trim(), { strict: false }))) p.push("Two of Three needs three approver addresses.");
    if (goodPayees.some((x) => !isAddress(x.trim(), { strict: false }))) p.push("A saved payee isn't a valid address.");
    if (depositUnits < 0n || floatUnits < 0n) p.push("Amounts must be numbers, up to 6 decimals.");
    if (bal && depositUnits + floatUnits > bal.usdt) p.push(`You have ${Number(bal.usdt) / 1e6} USD₮0; the deposit and float need ${Number(depositUnits + floatUnits) / 1e6}.`);
    if (bal && bal.okb === 0n) p.push("You need a little OKB on X Layer for gas.");
    else if (bal && gasWei > 0n && bal.okb <= gasWei) p.push(`The agent's gas (${gas} OKB) is more than the OKB you have; lower it or top up.`);
    if (gasWei < 0n) p.push("Agent gas must be a number of OKB.");
    return p;
  }, [account, agent, on, approvers, goodPayees, depositUnits, floatUnits, bal, gas, gasWei]);

  const ZERO = "0x0000000000000000000000000000000000000000" as Address;
  const paramsOf = (f: (typeof FUSES)[number]) => f.key === "breaker" ? { token: ZERO, unit: 0n, a: 0, b: 0 }
    : f.key === "repeat-guard" ? { token: ZERO, unit: 0n, a: hours(win), b: 0 }
    : { token: DEP.usdt0 as Address, unit: USDT, a: f.key === "daily-cap" ? clamp(cap) : f.key === "payee-guard" ? clamp(cool) : clamp(thr), b: f.key === "payee-guard" ? clamp(trial) : 0 };
  const remember = (c: Ctx) => { try { const k = "fusebox:mine"; const list = JSON.parse(localStorage.getItem(k) || "[]"); list.unshift({ address: c.wallet, block: c.block, owner: account }); localStorage.setItem(k, JSON.stringify(list.slice(0, 20))); } catch {} };

  // three taps through FuseboxSetup: a free USD₮0 permit, one transaction that does every step, then accept ownership
  const planFast = (SETUP: Address): TxStep<Ctx>[] => {
    const USD = DEP.usdt0 as Address;
    const pull = depositUnits + floatUnits;
    const installs = FUSES.filter((f) => on[f.key]);
    const names = installs.map((f) => f.name).join(", ");
    const seats = on["approval-2of3"] ? approvers.map((a) => getAddress(a.trim().toLowerCase())) as [Address, Address, Address] : [ZERO, ZERO, ZERO] as [Address, Address, Address];
    const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const money = [depositUnits > 0n && `${deposit} USD₮0 fees`, floatUnits > 0n && `${float} USD₮0 to spend`, gasWei > 0n && `${gas} OKB agent gas`].filter(Boolean).join(" · ");
    return [
      {
        id: "permit", label: "Let the setup take your USD₮0", detail: pull > 0n ? `${Number(pull) / 1e6} USD₮0 · a free signature, no gas` : "nothing to move", nullIs: "done",
        run: async (c) => {
          c.permit = NO_PERMIT;
          if (pull === 0n) return null;
          const have = await pub.readContract({ address: USD, abi: erc20, functionName: "allowance", args: [account!, SETUP] });
          if (have >= pull) return null;
          try {
            const domain = { name: "USD₮0", version: "1", chainId: 196, verifyingContract: USD } as const;
            const [nonce, onchain] = await Promise.all([
              pub.readContract({ address: USD, abi: erc20, functionName: "nonces", args: [account!] }),
              pub.readContract({ address: USD, abi: erc20, functionName: "DOMAIN_SEPARATOR" }),
            ]);
            if (domainSeparator({ domain }) !== onchain) throw new Error("USD₮0's signing domain changed");
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const sig = await signTyped({ domain, types: PERMIT_TYPES, primaryType: "Permit", message: { owner: account!, spender: SETUP, value: pull, nonce, deadline } });
            const { r, s: ss, v, yParity } = parseSignature(sig);
            c.permit = { value: pull, deadline, v: Number(v ?? BigInt(yParity + 27)), r, s: ss };
            return null;
          } catch (e) {
            if (errCode(e) === 4001 || /reject|denied|cancel/i.test(String((e as Error).message))) throw e;
            // this wallet can't sign a permit: an approval transaction does the same job
            return write({ address: USD, abi: erc20, functionName: "approve", args: [SETUP, pull] });
          }
        },
      },
      {
        id: "setup", label: "Wire up your wallet", detail: `one transaction: ${installs.length} fuse${installs.length === 1 ? "" : "s"} (${names}) · ${goodPayees.length} payee${goodPayees.length === 1 ? "" : "s"}${money ? ` · ${money}` : ""}`,
        run: (c) => write({
          address: SETUP, abi: fuseboxSetupAbi, functionName: "setUpWallet", ...({ value: gasWei > 0n ? gasWei : 0n } as object),
          args: [{
            agents: [getAddress(agent.trim().toLowerCase())], salt, token: USD,
            fuses: installs.map((f) => ({ fuseId: BigInt(f.id), params: paramsOf(f), maxFee: feeOf(f) })),
            payees: goodPayees.map((x) => getAddress(x.trim().toLowerCase())), approvers: seats,
            feeDeposit: depositUnits > 0n ? depositUnits : 0n, walletFloat: floatUnits > 0n ? floatUnits : 0n,
          }, c.permit ?? NO_PERMIT],
        }),
        after: (r, c) => {
          for (const l of r.logs) { try { const ev = decodeEventLog({ abi: fuseboxSetupAbi, data: l.data, topics: l.topics }); if (ev.eventName === "WalletSetUp") c.wallet = ev.args.wallet; } catch {} }
          c.block = Number(r.blockNumber); remember(c);
        },
      },
      { id: "accept", label: "Make it yours", detail: "accept ownership: only you can change its fuses from now on", run: (c) => write({ address: c.wallet!, abi: fuseboxWalletAbi, functionName: "acceptOwnership" }) },
    ];
  };

  // the step-by-step way: one transaction per step (used when no setup helper is deployed)
  const planClassic = (): TxStep<Ctx>[] => {
    const W = () => ({ abi: fuseboxWalletAbi, address: undefined as unknown as Address });
    const steps: TxStep<Ctx>[] = [
      {
        id: "create", label: "Create your Fusebox wallet", detail: `owner ${short(account!)} · agent ${short(agent.trim())}`,
        run: () => write({ address: CURRENT.factory, abi: fuseboxFactoryAbi, functionName: "createWallet", args: [account!, [getAddress(agent.trim().toLowerCase())], toHex(crypto.getRandomValues(new Uint8Array(32)))] }),
        after: (r, c) => {
          for (const l of r.logs) { try { const ev = decodeEventLog({ abi: fuseboxFactoryAbi, data: l.data, topics: l.topics }); if (ev.eventName === "WalletCreated") c.wallet = ev.args.wallet; } catch {} }
          c.block = Number(r.blockNumber); remember(c);
        },
      },
      { id: "token", label: "Let it pay in USD₮0", run: (c) => write({ ...W(), address: c.wallet!, functionName: "setToken", args: [DEP.usdt0 as Address, true] }) },
    ];
    FUSES.filter((f) => on[f.key]).forEach((f) => {
      const detail = f.key === "daily-cap" ? `${clamp(cap)} USD₮0 a day` : f.key === "payee-guard" ? `${clamp(cool)} h cooling-off, ${clamp(trial)} USD₮0 trial` : f.key === "approval-2of3" ? `approvals over ${clamp(thr)} USD₮0` : f.key === "repeat-guard" ? `the same payment once per ${hours(win)} h` : "trips on strangers";
      steps.push({ id: `fuse-${f.key}`, label: `Splice in ${f.name}`, detail: `${detail} · ${Number(feeOf(f)) / 1e6} USD₮0 per check`, run: (c) => write({ ...W(), address: c.wallet!, functionName: "addFuse", args: [BigInt(f.id), paramsOf(f), feeOf(f)] }) });
    });
    goodPayees.forEach((p, i) => steps.push({ id: `payee-${i}`, label: "Save a payee", detail: short(p.trim()), run: (c) => write({ ...W(), address: c.wallet!, functionName: "addPayee", args: [getAddress(p.trim().toLowerCase())] }) }));
    if (on["approval-2of3"]) steps.push({ id: "approvers", label: "Seat the three approvers", detail: approvers.map((a) => short(a.trim())).join(" · "), run: (c) => write({ ...W(), address: c.wallet!, functionName: "setApprovers", args: [approvers.map((a) => getAddress(a.trim().toLowerCase())) as [Address, Address, Address]] }) });
    if (depositUnits > 0n) {
      steps.push({ id: "approve", label: "Allow the registry to take the fee deposit", detail: `${deposit} USD₮0`, run: async () => {
        const have = await pub.readContract({ address: DEP.usdt0 as Address, abi: erc20, functionName: "allowance", args: [account!, CURRENT.registry] });
        return have >= depositUnits ? null : write({ address: DEP.usdt0 as Address, abi: erc20, functionName: "approve", args: [CURRENT.registry, depositUnits] });
      } });
      steps.push({ id: "deposit", label: "Prepay fees", detail: `${deposit} USD₮0 ≈ ${perDecision ? Number(depositUnits / perDecision) : 0} decisions`, run: (c) => write({ address: CURRENT.registry, abi: fuseRegistryAbi, functionName: "deposit", args: [c.wallet!, depositUnits] }) });
    }
    if (gasWei > 0n) steps.push({ id: "gas", label: "Send your agent gas", detail: `${gas} OKB · about ${Math.floor(Number(gas) / GAS_PER_PAY)} payments`, run: () => send(getAddress(agent.trim().toLowerCase()), gasWei) });
    if (floatUnits > 0n) steps.push({ id: "float", label: "Fund the wallet for payments", detail: `${float} USD₮0`, run: (c) => write({ address: DEP.usdt0 as Address, abi: erc20, functionName: "transfer", args: [c.wallet!, floatUnits] }) });
    return steps;
  };
  const plan = (): TxStep<Ctx>[] => (CURRENT.setup ? planFast(CURRENT.setup) : planClassic());

  const launch = async () => { setMade(null); const ok = await q.start(plan(), {}); if (ok) setMade({ ...(q.ctx() ?? {}) }); };
  const retry = async () => { const ok = await q.retry(); if (ok) setMade({ ...(q.ctx() ?? {}) }); };
  const failed = q.steps.some((s) => s.state === "error");
  // when the last step lands, bring the "It's live" card into view (on phones it sits under the step list)
  // the key made here belongs to the new wallet now: keep it for the assistant (or not), and drop the pending copy
  useEffect(() => { if (!made?.wallet || !keyLive) return; if (keepKey) saveAgentKey(made.wallet, keyLive); savePendingKey(null); }, [made?.wallet]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (made?.wallet) setTimeout(() => document.querySelector(".done-card")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150); }, [made?.wallet]);

  const toggle = (k: Key) => setOn({ ...on, [k]: !on[k] });
  const approversReady = [1, 2].every((i) => isAddress(approvers[i].trim(), { strict: false }));
  // in quick setup a starter never turns on Two of Three by itself: it waits for two named approvers
  const applyStarter = (x: (typeof STARTERS)[number]) => { setStarterId(x.id); setOn(quick ? { ...x.on, "approval-2of3": x.on["approval-2of3"] && approversReady } : x.on); setWin(x.win); setCap(x.cap); setCool(x.cool); setTrial(x.trial); setThr(x.thr); };
  const starter = STARTERS.find((x) => x.id === starterId) ?? STARTERS[0];
  // quick setup never blocks on approvers: Two of Three switches on once two more people are named
  useEffect(() => {
    if (!quick) return;
    const want = starter.on["approval-2of3"] && approversReady;
    setOn((o) => (o["approval-2of3"] === want ? o : { ...o, "approval-2of3": want }));
  }, [quick, starter, approversReady, on]);
  const modeSwitch = (
    <div className="wz-mode m" role="radiogroup" aria-label="Setup mode">
      <button role="radio" aria-checked={quick} className={`dt-btn${quick ? " on" : ""}`} onClick={() => setQuick(true)}>Quick setup</button>
      <button role="radio" aria-checked={!quick} className={`dt-btn${!quick ? " on" : ""}`} onClick={() => setQuick(false)}>Every setting</button>
      <span className="mute">{quick ? "Four answers; sensible defaults for the rest" : "Every fuse, limit and amount"}</span>
    </div>
  );
  const quickApprovers = (
    <div className="addr-list m">
      {[1, 2].map((i) => <div className="ar field" key={i}><input aria-label={`Approver ${i + 1} address`} value={approvers[i]} onChange={(e) => setApprovers(approvers.map((x, k) => (k === i ? e.target.value : x)))} placeholder={`Approver ${i + 1} · 0x… (optional)`} spellCheck={false} /></div>)}
    </div>
  );

  // ---- phones: one step per screen, Back / Next under the thumb
  const [step, setStep] = useState(0);
  const [describe, setDescribe] = useState(false);
  const STEPS = ["Start", "Owner", "Agent", "Fuses", "People", "Fund"];
  const GL: Record<Key, GlyphName> = { "daily-cap": "mine", "payee-guard": "approve", breaker: "stop", "approval-2of3": "x402", "repeat-guard": "copy" };
  const agentErr = !agent.trim() ? "Enter the address your agent signs with." : !isAddress(agent.trim(), { strict: false }) ? "That isn't an address." : account && agent.trim().toLowerCase() === account.toLowerCase() ? "Use a separate key for the agent, not your own." : null;
  const blockNext = step === 2 && !!agentErr;
  const activeStarter = STARTERS.find((x) => FUSES.every((f) => on[f.key] === x.on[f.key]) && (!x.on["daily-cap"] || cap === x.cap) && (!x.on["payee-guard"] || (cool === x.cool && trial === x.trial)) && (!x.on["approval-2of3"] || thr === x.thr) && (!x.on["repeat-guard"] || win === x.win));
  const go = (n: number) => { setStep(n); window.scrollTo({ top: 0 }); };
  const mobileView = (
    <div className="mpage wzm">
      <PageChrome title="Wire up" sub={made?.wallet ? "Done" : `Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
        info={<><p>Your agent gets a key that can only pay through the fuses you pick. You stay the owner: you set the limits, save payees, and reset a blown fuse.</p><p>Each fuse is a TapeOut circuit on X Layer. A payment needs a yes from every fuse, and each check pays the fuse&apos;s designer. Everything runs on X Layer mainnet; gas is a tiny fraction of a cent.</p></>} />
      <div className="wzm-prog" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${STEPS.length}, 1fr)` }}>{STEPS.map((s, i) => <i key={s} className={i <= step || made?.wallet ? "on" : ""} />)}</div>

      {made?.wallet ? (
        <div className="done-card">
          <div className="mtitle">It&apos;s live.</div>
          <p className="mcap" style={{ marginTop: 10 }}>Your wallet <span className="m lime">{short(made.wallet)}</span> is on X Layer with its fuses spliced in. Now hand it to your agent, or make your first payment right here.</p>
          <Link className="btn lime" style={{ marginTop: 16, justifyContent: "center", height: 52 }} href={`/app/first?wallet=${made.wallet}`}>Make your first payment <span className="k">→</span></Link>
          <div className="mlabel m" style={{ marginTop: 18 }}><span>Connect your agent</span></div>
          <AgentConnect wallet={made.wallet} agentKey={keyLive?.key} />
          <a className="btn" style={{ marginTop: 12, justifyContent: "center", height: 48 }} href={alertsLink(made.wallet)} target="_blank" rel="noreferrer">Get alerts on Telegram <span className="k">↗</span></a>
          <Link className="btn" style={{ marginTop: 12, justifyContent: "center", height: 48 }} href={`/app/w/${made.wallet}`}>Open my wallet</Link>
        </div>
      ) : <>
        {step === 0 && <>
          <div><div className="mtitle">Before you start</div><p className="mcap" style={{ marginTop: 8 }}>You&apos;ll need four things. Fusebox checks what it can.</p></div>
          <NeedList account={account} bal={bal} />
          <p className="mnote">Missing something? You can still walk through every step: nothing is signed until the last one.</p>
          <div className="mrows">
            {!account && <MRow href={OKX_DOWNLOAD} ext icon={<Glyph name="key" size={16} />} title="Get OKX Wallet" sub="The wallet that works best on X Layer" />}
            <MRow href="/docs#start" icon={<Glyph name="docs" size={16} />} title="How Fusebox works" sub="The two-minute version" />
          </div>
        </>}
        {step === 1 && <>
          <div><div className="mtitle">Connect the owner</div><p className="mcap" style={{ marginTop: 8 }}>The wallet you connect owns the new one. Only it can change fuses, limits and payees.</p></div>
          {account ? <MRow icon={<Plate address={account} size={22} />} title={short(account)} sub="Owner · connected" chev={false} /> : <ConnectChoices cta="" />}
        </>}
        {step === 2 && <>
          <div><div className="mtitle">Name the agent</div><p className="mcap" style={{ marginTop: 8 }}>The address your AI agent signs with. It can only ask this wallet to pay, through every fuse.</p></div>
          {!keyLive && <button className="btn lime" style={{ justifyContent: "center", height: 52 }} onClick={makeKey}>Make an agent key for me</button>}
          {keyLive ? <KeyCard k={keyLive} keep={keepKey} setKeep={setKeepKey} /> : <>
            <div className="mlabel m"><span>Or paste your agent&apos;s address</span></div>
            <label className="mfield"><span className="sr">Agent address</span><input aria-label="Agent address" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x…" spellCheck={false} /></label>
          </>}
          {agent.trim() && agentErr && <p className="mnote" style={{ color: "var(--red)" }}>{agentErr}</p>}
          {keyLive && <button className="linkbtn m" onClick={() => { setGenKey(null); savePendingKey(null); setAgent(""); }}>Use my own agent address instead</button>}
        </>}
        {step === 3 && quick && <>
          {modeSwitch}
          <div><div className="mtitle">What does your agent do?</div><p className="mcap" style={{ marginTop: 8 }}>Pick the closest; each comes with fuses and limits that fit.</p></div>
          <MChips label="What your agent does" items={STARTERS.map((x) => [x.id, x.name] as const)} value={starterId} onChange={(id) => applyStarter(STARTERS.find((s) => s.id === id)!)} />
          <p className="mnote">{starter.why}</p>
          <div className="mcard" style={{ padding: 14 }}><div className="mkv"><span>Fuses</span><span>{FUSES.filter((f) => on[f.key]).map((f) => f.name).join(" · ")}</span></div></div>
          {on["daily-cap"] && <label className="mfield"><span className="m">At most a day · USD₮0</span><input aria-label="Cap per day (USD₮0)" value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" /></label>}
        </>}
        {step === 3 && !quick && <>
          {modeSwitch}
          <div><div className="mtitle">Pick the fuses</div><p className="mcap" style={{ marginTop: 8 }}>Every payment must pass all of them.</p></div>
          <MChips label="Start from a line" items={STARTERS.map((x) => [x.id, x.name] as const)} value={activeStarter?.id ?? null} onChange={(id) => { const x = STARTERS.find((s) => s.id === id)!; setOn(x.on); setWin(x.win); setCap(x.cap); setCool(x.cool); setTrial(x.trial); setThr(x.thr); }} />
          {activeStarter && <p className="mnote">{activeStarter.why}</p>}
          <MRow icon={<Glyph name="rob" size={16} />} title="Describe your agent instead" sub="Get a line of fuses, with reasons" onClick={() => setDescribe(true)} />
          {FUSES.map((f) => (
            <div key={f.key} className={`mcard mopt${on[f.key] ? " on" : ""}`}>
              <div className="mopt-t">
                <Glyph name={GL[f.key]} size={18} color={on[f.key] ? "var(--lime)" : "var(--dim)"} />
                <span><b>{f.name}</b><small className="m">{Number(feeOf(f)) / 1e6} USD₮0 / check</small></span>
                <Toggle on={on[f.key]} flip={() => toggle(f.key)} name={f.name} />
              </div>
              {on[f.key] && f.key === "daily-cap" && <label className="mfield"><span className="m">Cap per day · USD₮0</span><input aria-label="Cap per day (USD₮0)" value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" /></label>}
              {on[f.key] && f.key === "payee-guard" && <div className="mopt-2"><label className="mfield"><span className="m">Cooling-off · h</span><input aria-label="Cooling-off (hours)" value={cool} onChange={(e) => setCool(e.target.value)} inputMode="decimal" /></label><label className="mfield"><span className="m">Trial · USD₮0</span><input aria-label="Trial amount (USD₮0)" value={trial} onChange={(e) => setTrial(e.target.value)} inputMode="decimal" /></label></div>}
              {on[f.key] && f.key === "repeat-guard" && <label className="mfield"><span className="m">Window · h</span><input aria-label="Repeat window (hours)" value={win} onChange={(e) => setWin(e.target.value)} inputMode="numeric" /></label>}
              {on[f.key] && f.key === "approval-2of3" && <label className="mfield"><span className="m">Approvals above · USD₮0</span><input aria-label="Approvals above (USD₮0)" value={thr} onChange={(e) => setThr(e.target.value)} inputMode="decimal" /></label>}
              {!on[f.key] && <p className="mnote">{f.say}</p>}
            </div>
          ))}
          <Link className="m lime" href={simLink}>Test this line on sample payments →</Link>
        </>}
        {step === 4 && <>
          <div><div className="mtitle">Payees and approvers</div><p className="mcap" style={{ marginTop: 8 }}>{on["payee-guard"] || on.breaker ? "Saved payees go straight through Payee Guard and the Breaker." : "Payees you save now; you can add more later."}</p></div>
          <div className="mlabel m"><span>Saved payees</span><span>{goodPayees.length}</span></div>
          {payees.map((p, i) => <div className="mfield-row" key={i}><label className="mfield"><span className="sr">Saved payee {i + 1} address</span><input aria-label={`Saved payee ${i + 1} address`} value={p} onChange={(e) => setPayees(payees.map((x, k) => (k === i ? e.target.value : x)))} placeholder="0x…" spellCheck={false} /></label><button className="mfield-x" onClick={() => setPayees(payees.filter((_, k) => k !== i))} aria-label={`Remove saved payee ${i + 1}`}>✕</button></div>)}
          <button className="btn" style={{ justifyContent: "center" }} onClick={() => setPayees([...payees, ""])}>+ Add a payee</button>
          {quick && starter.on["approval-2of3"] && <>
            <div className="mlabel m"><span>Two people for big payments · optional</span></div>
            <p className="mnote">Name two more approvers and anything over {clamp(thr)} USD₮0 needs two of the three of you. Leave empty to skip.</p>
            {[1, 2].map((i) => <label className="mfield" key={i}><span className="sr">Approver {i + 1} address</span><input aria-label={`Approver ${i + 1} address`} value={approvers[i]} onChange={(e) => setApprovers(approvers.map((x, k) => (k === i ? e.target.value : x)))} placeholder={`Approver ${i + 1} · 0x… (optional)`} spellCheck={false} /></label>)}
          </>}
          {!quick && on["approval-2of3"] && <>
            <div className="mlabel m"><span>Approvers · two of three sign over {clamp(thr)} USD₮0</span></div>
            {approvers.map((a, i) => <label className="mfield" key={i}><span className="sr">Approver {i + 1} address</span><input aria-label={`Approver ${i + 1} address`} value={a} onChange={(e) => setApprovers(approvers.map((x, k) => (k === i ? e.target.value : x)))} placeholder={`Approver ${i + 1} · 0x…`} spellCheck={false} /></label>)}
          </>}
        </>}
        {step === 5 && <>
          <div><div className="mtitle">Fund it</div><p className="mcap" style={{ marginTop: 8 }}>Fees come from a prepaid balance; payments come from the wallet.</p></div>
          {bal && <div className="mstats" style={{ gridTemplateColumns: "1fr 1fr" }}><div><span className="m">You have</span><b>{(Number(bal.usdt) / 1e6).toFixed(2)}<small>USD₮0</small></b></div><div><span className="m">Gas</span><b>{(Number(bal.okb) / 1e18).toFixed(4)}<small>OKB</small></b></div></div>}
          {quick ? <>
            <label className="mfield"><span className="m">Money to spend · USD₮0</span><input aria-label="Money to spend (USD₮0)" value={float} onChange={(e) => setFloat(e.target.value)} inputMode="decimal" /></label>
            <p className="mnote">Also set aside: {deposit} USD₮0 of prepaid checks and {gas} OKB of gas for your agent. <button className="linkbtn" onClick={() => setQuick(false)}>Change these</button></p>
          </> : <>
          <div className="mopt-2">
            <label className="mfield"><span className="m">Fee balance · USD₮0</span><input aria-label="Fee balance (USD₮0)" value={deposit} onChange={(e) => setDeposit(e.target.value)} inputMode="decimal" /></label>
            <label className="mfield"><span className="m">Wallet float · USD₮0</span><input aria-label="Wallet float (USD₮0)" value={float} onChange={(e) => setFloat(e.target.value)} inputMode="decimal" /></label>
          </div>
          <label className="mfield"><span className="m">Agent gas · OKB · ≈ {Math.max(0, Math.floor(Number(gas || 0) / GAS_PER_PAY))} payments</span><input aria-label="Agent gas (OKB)" value={gas} onChange={(e) => setGas(e.target.value)} inputMode="decimal" /></label>
          </>}
          <div className="mcard" style={{ padding: 14 }}><div className="mkv">
            <span>Fuses</span><span>{Object.values(on).filter(Boolean).length} · {(Number(perDecision) / 1e6).toFixed(4)} USD₮0 a payment</span>
            <span>Fees cover</span><span>{perDecision && depositUnits > 0n ? `${Number(depositUnits / perDecision)} decisions` : "—"}</span>
            <span>Daily cap</span><span>{on["daily-cap"] ? `${clamp(cap)} USD₮0` : "off"}</span>
            <span>Approvals over</span><span>{on["approval-2of3"] ? `${clamp(thr)} USD₮0` : "off"}</span>
            <span>Repeats</span><span>{on["repeat-guard"] ? `once per ${hours(win)} h` : "off"}</span>
            <span>Saved payees</span><span>{goodPayees.length}</span>
          </div></div>
          {q.steps.length > 0 && <ul className="txs">{q.steps.map((s) => (
            <li key={s.id} className={s.state}><span className="dot" /><span>{s.label}{s.detail ? <span className="m mute" style={{ display: "block", marginTop: 3 }}>{s.detail}</span> : null}</span>
              <span className="st">{s.hash ? <a href={`${OKLINK}/tx/${s.hash}`} target="_blank" rel="noreferrer">{s.state === "done" ? "Done ↗" : "Mining ↗"}</a> : s.state === "sign" ? "Sign" : s.state === "skip" ? "Not needed" : s.state === "error" ? "Failed" : s.state === "done" ? "Signed" : ""}</span>
              {s.error && <span className="e">{s.error}</span>}</li>))}</ul>}
          {!q.running && problems.length > 0 && <p className="mnote" style={{ color: "var(--red)" }}>{problems[0]}</p>}
        </>}
        {step === 5 && !q.steps.length && <p className="m mute">{CURRENT.setup ? "Three taps: a free signature, one transaction that sets everything up, then make it yours." : "Each step is one transaction you sign."}</p>}
        <MSticky>
          {step > 0 && <button className="btn fit" onClick={() => go(step - 1)} disabled={q.running}>Back</button>}
          {step < STEPS.length - 1
            ? <button className="btn lime" disabled={blockNext} onClick={() => go(step + 1)}>Next · {STEPS[step + 1]} <span className="k">→</span></button>
            : failed ? <button className="btn lime" onClick={retry} disabled={q.running}>{q.running ? "Working…" : "Retry the failed step"}</button>
            : <button className="btn lime" onClick={launch} disabled={q.running || problems.length > 0}>{q.running ? "Sign in your wallet…" : "Wire it up"} <span className="k">→</span></button>}
        </MSticky>
      </>}
      <MSheet open={describe} onClose={() => setDescribe(false)} title="Describe your agent">
        <GuardrailsCard onApply={(g) => {
          setOn((o) => ({ ...o, "daily-cap": g.line.dailyCap.on, "payee-guard": g.line.payeeGuard.on, breaker: g.line.breaker.on, "approval-2of3": g.line.twoOfThree.on }));
          setCap(String(g.line.dailyCap.cap)); setCool(String(g.line.payeeGuard.coolingHours)); setTrial(String(g.line.payeeGuard.trial)); setThr(String(g.line.twoOfThree.threshold));
          if (g.payees.length) setPayees(g.payees);
          if (g.approvers.length) setApprovers((cur) => [0, 1, 2].map((i) => g.approvers[i] ?? cur[i]));
          setDescribe(false);
        }} />
      </MSheet>
    </div>
  );

  return <Responsive mobile={mobileView} desktop={
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <section className="try-head">
        <h1 className="disp" data-a>Wire up a <span className="lime">[wallet]</span>.</h1>
        <p data-a>Your agent gets a key that can only pay through the fuses you pick. You stay the owner: you set the limits, save payees, and reset a blown fuse. Everything runs on X Layer mainnet.</p>
      </section>
      <section className="need-box" data-a aria-label="Before you start">
        <div className="need-h m"><span className="lime">Before you start</span><span className="mute">nothing is signed until the last step</span></div>
        <NeedList account={account} bal={bal} compact />
      </section>
      <h2 className="sr">Set up your wallet</h2>
      <section className="wz">
        <div className="wz-main" data-a>
          {modeSwitch}
          <div className={`wz-sec${account ? "" : " off"}`}>
            <div className="ix">01</div>
            <div>
              <h3>Connect the owner</h3>
              {account ? <p className="lead">Owner: <span className="m lime">{account}</span>. Only this address can change the wallet&apos;s fuses, payees and limits.</p> : (
                <>
                  <p className="lead">The wallet you connect becomes the owner. OKX Wallet works best on X Layer.</p>
                  <ConnectChoices cta="" />
                </>
              )}
            </div>
          </div>
          <div className="wz-sec">
            <div className="ix">02</div>
            <div>
              <h3>Name the agent</h3>
              <p className="lead">The address your AI agent signs with. It can do exactly one thing: ask this wallet to pay, through every fuse. It can&apos;t change a fuse, a limit or a payee.</p>
              {keyLive ? <KeyCard k={keyLive} keep={keepKey} setKeep={setKeepKey} /> : <>
                <button className="btn lime" onClick={makeKey} style={{ marginBottom: 14 }}>Make an agent key for me <span className="k">→</span></button>
                <div className="field m"><label>Or paste your agent&apos;s address</label><input aria-label="Agent address" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x…" spellCheck={false} /></div>
              </>}
              {keyLive && <button className="linkbtn m" style={{ marginTop: 10 }} onClick={() => { setGenKey(null); savePendingKey(null); setAgent(""); }}>Use my own agent address instead</button>}
            </div>
          </div>
          <div className="wz-sec">
            <div className="ix">03</div>
            <div>
              {quick ? <>
              <h3>What does your agent do?</h3>
              <p className="lead">Pick the closest. Each one is a set of fuses with limits that fit; you can change any of it under Every setting.</p>
              <div className="starters" role="group" aria-label="What your agent does">
                {STARTERS.map((x) => (
                  <div key={x.id} className={`starter${starterId === x.id ? " on" : ""}`}>
                    <button onClick={() => applyStarter(x)} aria-pressed={starterId === x.id}>
                      <b>{x.name}</b>
                      <span className="m mute">{FUSES.filter((y) => x.on[y.key]).map((y) => y.name).join(" · ")}</span>
                      <span className="starter-why">{x.why}</span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="fopt"><span /><div>
                <h4>Who does it pay?</h4>
                <p>Addresses your agent pays without a second look. You can add more later.</p>
                <div className="addr-list m">
                  {payees.map((p, i) => <div className="ar field" key={i}><input aria-label={`Saved payee ${i + 1} address`} value={p} onChange={(e) => setPayees(payees.map((x, k) => (k === i ? e.target.value : x)))} placeholder="0x…" spellCheck={false} /></div>)}
                  <button className="linkbtn" onClick={() => setPayees([...payees, ""])}>+ Add a payee</button>
                </div>
              </div></div>
              {on["daily-cap"] && <div className="fopt"><span /><div><h4>How much a day, at most?</h4><p>The Daily Cap stops anything past this in one UTC day, however the agent is asked.</p><div className="prow"><Field label="Cap per day" suffix="USD₮0" v={cap} set={setCap} /></div></div></div>}
              {starter.on["approval-2of3"] && <div className="fopt"><span /><div><h4>Two people for big payments <small>optional</small></h4><p>Name two more approvers and anything over {clamp(thr)} USD₮0 needs two of the three of you to sign. Leave it empty to skip; you can add them later.</p>{quickApprovers}</div></div>}
              </> : <>
              <h3>Pick the fuses</h3>
              <p className="lead">Each fuse is a TapeOut circuit on X Layer. A payment needs a yes from every fuse you splice in, and each check pays the fuse&apos;s designer.</p>
              <GuardrailsCard onApply={(g) => {
                setOn((o) => ({ ...o, "daily-cap": g.line.dailyCap.on, "payee-guard": g.line.payeeGuard.on, breaker: g.line.breaker.on, "approval-2of3": g.line.twoOfThree.on }));
                setCap(String(g.line.dailyCap.cap)); setCool(String(g.line.payeeGuard.coolingHours)); setTrial(String(g.line.payeeGuard.trial)); setThr(String(g.line.twoOfThree.threshold));
                if (g.payees.length) setPayees(g.payees);
                if (g.approvers.length) setApprovers((cur) => [0, 1, 2].map((i) => g.approvers[i] ?? cur[i]));
              }} />
              <div className="starters" role="group" aria-label="Start from a line">
                {STARTERS.map((x) => {
                  const active = FUSES.every((f) => on[f.key] === x.on[f.key]) && (!x.on["daily-cap"] || cap === x.cap) && (!x.on["payee-guard"] || (cool === x.cool && trial === x.trial)) && (!x.on["approval-2of3"] || thr === x.thr) && (!x.on["repeat-guard"] || win === x.win);
                  const f = FUSES.filter((y) => x.on[y.key]).map((y) => (y.key === "daily-cap" ? `${y.id}:${x.cap}` : y.key === "payee-guard" ? `${y.id}:${x.cool}:${x.trial}` : y.key === "approval-2of3" ? `${y.id}:${x.thr}` : y.key === "repeat-guard" ? `${y.id}:${x.win}` : `${y.id}`)).join(",");
                  return (
                    <div key={x.id} className={`starter${active ? " on" : ""}`}>
                      <button onClick={() => { setOn(x.on); setWin(x.win); setCap(x.cap); setCool(x.cool); setTrial(x.trial); setThr(x.thr); }} aria-pressed={active}>
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
                    <h4>{f.name}<small>{Number(feeOf(f)) / 1e6} USD₮0 / check</small></h4>
                    <p>{f.say}</p>
                    {on[f.key] && f.key === "daily-cap" && <div className="prow"><Field label="Cap per day" suffix="USD₮0" v={cap} set={setCap} /></div>}
                    {on[f.key] && f.key === "payee-guard" && <div className="prow"><Field label="Cooling-off" suffix="hours" v={cool} set={setCool} /><Field label="Trial amount" suffix="USD₮0" v={trial} set={setTrial} /></div>}
                    {on[f.key] && f.key === "repeat-guard" && <div className="prow"><Field label="Window" suffix="hours" v={win} set={setWin} /></div>}
                    {on[f.key] && f.key === "approval-2of3" && (
                      <>
                        <div className="prow"><Field label="Approvals above" suffix="USD₮0" v={thr} set={setThr} /></div>
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
              </>}
            </div>
          </div>
          <div className="wz-sec">
            <div className="ix">04</div>
            <div>
              <h3>Fund it</h3>
              {quick ? <>
              <p className="lead">The money your agent can spend goes into the wallet. {bal ? <>You have <span className="m lime">{(Number(bal.usdt) / 1e6).toFixed(4)} USD₮0</span>.</> : null}</p>
              <div className="prow"><Field label="Money to spend" suffix="USD₮0" v={float} set={setFloat} /></div>
              <p className="m mute" style={{ marginTop: 8, lineHeight: 1.6 }}>Also set aside: {deposit} USD₮0 of prepaid checks (about {perDecision && depositUnits > 0n ? Number(depositUnits / perDecision) : 0} payments) and {gas} OKB of gas for your agent. <button className="linkbtn" onClick={() => setQuick(false)}>Change these</button></p>
              </> : <>
              <p className="lead">Fees come from a prepaid USD₮0 balance in the registry; the payments themselves come from the wallet. {bal ? <>You have <span className="m lime">{(Number(bal.usdt) / 1e6).toFixed(4)} USD₮0</span> and <span className="m lime">{(Number(bal.okb) / 1e18).toFixed(5)} OKB</span>.</> : null}</p>
              <div className="prow">
                <Field label="Fee balance" suffix="USD₮0" v={deposit} set={setDeposit} />
                <Field label="Wallet float" suffix="USD₮0" v={float} set={setFloat} />
                <Field label="Agent gas" suffix="OKB" v={gas} set={setGas} />
              </div>
              <p className="m mute" style={{ marginTop: 8 }}>Agent gas ≈ {Math.max(0, Math.floor(Number(gas || 0) / GAS_PER_PAY))} payments. Your agent needs a little OKB to send its payments; set 0 if you fund it yourself.</p>
              </>}
            </div>
          </div>
        </div>
        <div className="wz-side" data-a ref={side}>
          <div className="summary">
            <div className="sh2 m"><span className="mute">Your wallet</span><span className="lime">{Object.values(on).filter(Boolean).length} fuses</span></div>
            <div className="rows">
              <div><span>Per payment</span><span>{(Number(perDecision) / 1e6).toFixed(4)} USD₮0</span></div>
              <div><span>Fee balance covers</span><span>{perDecision && depositUnits > 0n ? `${Number(depositUnits / perDecision)} decisions` : "—"}</span></div>
              <div><span>Daily cap</span><span>{on["daily-cap"] ? `${clamp(cap)} USD₮0` : "off"}</span></div>
              <div><span>Approvals over</span><span>{on["approval-2of3"] ? `${clamp(thr)} USD₮0` : "off"}</span></div>
              <div><span>Repeats</span><span>{on["repeat-guard"] ? `once per ${hours(win)} h` : "off"}</span></div>
              <div><span>Saved payees</span><span>{goodPayees.length}</span></div>
            </div>
            <Link className="m lime sim-link" href={simLink}>Test this line on sample payments first →</Link>
            {q.steps.length > 0 && (
              <ul className="txs">
                {q.steps.map((s) => (
                  <li key={s.id} className={s.state}>
                    <span className="dot" />
                    <span>{s.label}{s.detail ? <span className="m mute" style={{ display: "block", marginTop: 3 }}>{s.detail}</span> : null}</span>
                    <span className="st">{s.hash ? <a href={`${OKLINK}/tx/${s.hash}`} target="_blank" rel="noreferrer">{s.state === "done" ? "Done ↗" : "Mining ↗"}</a> : s.state === "sign" ? "Sign" : s.state === "skip" ? "Not needed" : s.state === "error" ? "Failed" : s.state === "done" ? "Signed" : ""}</span>
                    {s.error && <span className="e">{s.error}</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="go">
              {made?.wallet ? (
                <div className="done-card">
                  <h4>It&apos;s live.</h4>
                  <p style={{ color: "var(--soft)", fontSize: 14, lineHeight: 1.5 }}>Your wallet <span className="m lime">{short(made.wallet)}</span> is on X Layer with its fuses spliced in. Hand it to your agent, or make your first payment here.</p>
                  <div className="prow" style={{ marginTop: 14 }}><Link className="btn lime" href={`/app/first?wallet=${made.wallet}`} data-cursor="Pay">Make your first payment <span className="k">→</span></Link><Link className="btn" href={`/app/w/${made.wallet}`} data-cursor="Open">Open my wallet</Link></div>
                  <h4 style={{ marginTop: 18 }}>Connect your agent</h4>
                  <AgentConnect wallet={made.wallet} agentKey={keyLive?.key} />
                  <p style={{ color: "var(--soft)", fontSize: 14, lineHeight: 1.5, marginTop: 16 }}>Want a message on your phone for every payment your agent tries? <a className="lime" href={alertsLink(made.wallet)} target="_blank" rel="noreferrer">Get alerts on Telegram ↗</a></p>
                </div>
              ) : failed ? (
                <button className="btn lime" onClick={retry} disabled={q.running} data-cursor="Retry">{q.running ? "Working…" : "Retry from the failed step"}</button>
              ) : (
                <button className="btn lime" onClick={launch} disabled={q.running || problems.length > 0} data-cursor="Wire it">{q.running ? "Sign in your wallet…" : <><span className="roll"><span>Wire it up</span><span aria-hidden="true">Wire it up</span></span> <span className="k">→</span></>}</button>
              )}
              {!q.running && !made && problems.length > 0 && <div className="warn2">{problems[0]}</div>}
              {!made && <p className="m mute" style={{ marginTop: 12, lineHeight: 1.6 }}>{CURRENT.setup ? "Three taps: a free signature, one transaction that sets everything up, then you accept the wallet as yours. Gas on X Layer is a tiny fraction of a cent." : "Each step is one transaction you sign. Gas on X Layer is a tiny fraction of a cent."}</p>}
            </div>
          </div>
        </div>
      </section>
      {/* phones: the summary is at the end of a long form, so its action rides above the dock until you reach it */}
      {!made?.wallet && !sideSeen && (
        <div className="wz-sticky">
          <div className="m"><b>{Object.values(on).filter(Boolean).length} fuses · {(Number(perDecision) / 1e6).toFixed(4)} USD₮0 each</b>
            <span className={!q.running && problems.length ? "warn" : "mute"}>{q.running ? "Sign each step in your wallet…" : failed ? "A step failed: retry it below" : problems[0] ?? "Ready to wire it up"}</span></div>
          <button className="btn lime" disabled={q.running} onClick={() => { side.current?.scrollIntoView({ behavior: "smooth", block: "start" }); if (failed) retry(); else if (!problems.length) launch(); }}>
            {failed ? "Retry" : problems.length ? "Review" : "Wire it up"} <span className="k">→</span>
          </button>
        </div>
      )}
    </div>
  } />;
}
