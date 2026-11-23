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
import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";

const GAS_PER_PAY = 0.00002; // OKB a pay() costs on X Layer, roughly (Atlas's real payments)

/** The agent key made in this browser: shown once, copy or download it, and keep it here for the assistant. */
function KeyCard({ k, keep, setKeep }: { k: AgentKey; keep: boolean; setKeep: (v: boolean) => void }) {
  const [shown, setShown] = useState(false); const [copied, setCopied] = useState(false);
  const { t } = useLang();
  return (
    <div className="keycard">
      <div className="m lime">{t(<>Your agent&apos;s key · made in this browser</>, <>你的智能体密钥 · 在本浏览器中生成</>)}</div>
      <div className="kc-row"><span className="m mute">{t("Address", "地址")}</span><span className="m">{k.address}</span></div>
      <div className="kc-row"><span className="m mute">{t("Private key", "私钥")}</span><span className="m kc-secret">{shown ? k.key : "•".repeat(28)}</span></div>
      <div className="kc-acts m">
        <button className="btn" onClick={() => setShown(!shown)}>{shown ? t("Hide", "隐藏") : t("Reveal", "显示")}</button>
        <button className="btn" onClick={() => { navigator.clipboard?.writeText(k.key); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? t("Copied ✓", "已复制 ✓") : t("Copy key", "复制密钥")}</button>
        <button className="btn" onClick={() => download("fusebox-agent-key.txt", keyFile(null, k))}>{t("Download", "下载")}</button>
      </div>
      <label className="kc-keep"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> {t("Keep it in this browser so the Fusebox assistant can pay for you", "保存在本浏览器中，让 Fusebox 助手替你付款")}</label>
      <p className="kc-warn">{t("It can only ask your wallet to pay, through every fuse. Still, keep it secret: whoever holds it can spend what your fuses allow. Fusebox never sees it.", "它只能请求你的钱包付款，并且要经过每个保险丝。但仍请妥善保密：谁持有它，谁就能花掉保险丝允许的金额。Fusebox 永远看不到它。")}</p>
    </div>
  );
}

/** What a newcomer needs before wiring up, with what Fusebox can already see. */
function NeedList({ account, bal, compact }: { account: Address | null; bal: { okb: bigint; usdt: bigint } | null; compact?: boolean }) {
  const { t } = useLang();
  const items: [GlyphName, React.ReactNode, string, React.ReactNode][] = [
    ["key", t("A wallet on X Layer", "一个 X Layer 钱包"), t("It becomes the owner. OKX Wallet works best.", "它将成为所有者。推荐使用 OKX Wallet。"), account ? <span className="mtag ok">{t("Connected", "已连接")}</span> : <span className="mtag no">{t("Not yet", "还没有")}</span>],
    ["rob", <Term key="a" k="agent">{t("An agent key", "一个智能体密钥")}</Term>, t("The address your AI agent signs with. No agent yet? Fusebox makes one for you in a later step, right in this browser.", "你的 AI 智能体用来签名的地址。还没有智能体？Fusebox 会在后面的步骤中，直接在本浏览器里为你生成一个。"), <span className="mtag dim">{t("Made or pasted", "生成或粘贴")}</span>],
    ["coin", t(<><Term key="u" k="usdt0">USD₮0</Term> on X Layer</>, <>X Layer 上的 <Term key="u" k="usdt0">USD₮0</Term></>), t("Pays the fuses' fees and the agent's payments. Withdraw to the X Layer network from an exchange, or bridge.", "用于支付保险丝费用和智能体的付款。可从交易所提币到 X Layer 网络，或通过跨链桥转入。"), !bal ? <span className="mtag dim">—</span> : bal.usdt > 0n ? <span className="mtag ok">{(Number(bal.usdt) / 1e6).toFixed(2)}</span> : <span className="mtag no">{t("None yet", "暂无")}</span>],
    ["status", t(<>A little <Term key="o" k="okb">OKB</Term> for gas</>, <>少量 <Term key="o" k="okb">OKB</Term> 用作 gas</>), t("For your own steps and your agent's payments; gas costs a fraction of a cent each.", "用于你自己的操作步骤和智能体的付款；每笔 gas 不到一美分。"), !bal ? <span className="mtag dim">—</span> : bal.okb > 0n ? <span className="mtag ok">{(Number(bal.okb) / 1e18).toFixed(4)}</span> : <span className="mtag no">{t("None yet", "暂无")}</span>],
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
  { key: "daily-cap", id: CURRENT.fuseIds[0], name: "Daily Cap", fee: 1000n, say: "No more than your cap in a UTC day, however the agent is asked.", sayZh: "无论智能体被怎么要求，一个 UTC 日内的付款都不超过你设定的上限。" },
  { key: "payee-guard", id: CURRENT.fuseIds[1], name: "Payee Guard", fee: 1000n, say: "Saved payees only. A newly saved payee gets a small trial amount until its cooling-off ends.", sayZh: "只付给已保存的收款方。新保存的收款方在冷静期结束前，只能收到一小笔试付额度。" },
  { key: "breaker", id: CURRENT.fuseIds[2], name: "Breaker", fee: 500n, say: "Trips on a payment to a stranger and stays blown until you reset it.", sayZh: "一遇到付给陌生地址的付款就触发，并保持熔断，直到你重置。" },
  { key: "approval-2of3", id: CURRENT.fuseIds[3], name: "Two of Three", fee: 2000n, say: "Above a threshold, two of three approvers must sign that exact payment.", sayZh: "超过阈值时，三位审批人中必须有两位为这笔具体付款签名。" },
  { key: "repeat-guard", id: CURRENT.fuseIds[4], name: "Repeat Guard", fee: 500n, say: "The same invoice sent twice gets paid once: the same amount to the same payee inside the window is stopped. You can clear a real repeat. Leave it off for an agent that pays per call.", sayZh: "同一张发票发两次，只付一次：时间窗口内向同一收款方付同样的金额会被拦截。确属重复的付款，你可以放行。按次调用付费的智能体请不要开启。" },
] as const;
type Key = (typeof FUSES)[number]["key"];
interface Permit { value: bigint; deadline: bigint; v: number; r: Hex; s: Hex }
interface Ctx { wallet?: Address; block?: number; permit?: Permit }
const NO_PERMIT: Permit = { value: 0n, deadline: 0n, v: 0, r: `0x${"0".repeat(64)}`, s: `0x${"0".repeat(64)}` };
const PERMIT_TYPES = { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] } as const;
const clamp = (v: string) => Math.max(0, Math.min(254, Math.floor(Number(v) || 0)));
const hours = (v: string) => Math.max(1, clamp(v)); // the Repeat Guard's window: 1 to 254 hours

/** Starting points: a whole line with its limits, and why it fits that kind of agent. */
const STARTERS: { id: string; name: string; nameZh: string; why: string; whyZh: string; on: Record<Key, boolean>; cap: string; cool: string; trial: string; thr: string; win: string }[] = [
  { id: "invoice", name: "Invoice agent", nameZh: "发票智能体", why: "Pays a known set of suppliers. New bank details get a test payment, never the invoice; big ones need two people.",
    whyZh: "向一组已知的供应商付款。新的银行账户只能收到一笔试付款，拿不到发票全款；大额付款需要两个人审批。",
    on: { "daily-cap": true, "payee-guard": true, breaker: true, "approval-2of3": true, "repeat-guard": true }, cap: "50", cool: "24", trial: "2", thr: "20", win: "24" },
  { id: "procure", name: "Procurement bot", nameZh: "采购机器人", why: "Larger, less frequent orders. A higher cap and threshold, a longer cooling-off for a new vendor.",
    whyZh: "订单金额更大、频率更低。更高的限额和阈值，新供应商的冷静期也更长。",
    on: { "daily-cap": true, "payee-guard": true, breaker: true, "approval-2of3": true, "repeat-guard": true }, cap: "200", cool: "72", trial: "5", thr: "50", win: "72" },
  { id: "refund", name: "Refund desk", nameZh: "退款台", why: "Pays customers it has never paid before, so no payee book or Breaker: the daily cap and approvals carry the weight.",
    whyZh: "要付款给从未付过的客户，所以不用收款方名单和 Breaker：主要靠每日限额和审批把关。",
    on: { "daily-cap": true, "payee-guard": false, breaker: false, "approval-2of3": true, "repeat-guard": true }, cap: "100", cool: "24", trial: "2", thr: "10", win: "24" },
  { id: "allowance", name: "Small allowance", nameZh: "小额额度", why: "For a new or experimental agent: a few USD₮0 a day, saved payees only, one stranger blows it.",
    whyZh: "适合新的或试验中的智能体：每天几个 USD₮0，只付给已保存的收款方，一次付给陌生地址就熔断。",
    on: { "daily-cap": true, "payee-guard": true, breaker: true, "approval-2of3": false, "repeat-guard": false }, cap: "10", cool: "24", trial: "1", thr: "20", win: "24" },
];

function Toggle({ on, flip, name }: { on: boolean; flip: () => void; name: string }) {
  const { t } = useLang();
  return <span className={`tg${on ? " on" : ""}`} role="checkbox" aria-checked={on} aria-label={t(`Splice in ${name}`, `接入 ${name}`)} tabIndex={0} onClick={flip} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } }} data-cursor={on ? t("Remove", "移除") : t("Add", "添加")} />;
}
function Field({ label, v, set, suffix }: { label: string; v: string; set: (s: string) => void; suffix?: string }) {
  const { zh } = useLang();
  const sfx = suffix ? (zh ? `（${suffix}）` : ` (${suffix})`) : "";
  return <div className="field m"><label>{label}{sfx}</label><input aria-label={suffix ? `${label}${sfx}` : label} value={v} onChange={(e) => set(e.target.value)} inputMode="decimal" /></div>;
}

export default function NewWalletView() {
  const { account, write, send, signTyped } = useWallet();
  const { t: tr, zh } = useLang();
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
    setQuick(false); // the fuses were already chosen: show them, not the starter questions
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
  // only the Daily Cap and Two of Three read how much is paid for every payee: without one, a saved payee can be sent everything
  const noLimit = Object.values(on).some(Boolean) && !on["daily-cap"] && !on["approval-2of3"];
  const NO_LIMIT = tr("Turn on the Daily Cap or Two of Three. Without one, nothing limits how much the agent can send to a saved payee.", "请开启 Daily Cap 或 Two of Three。两者都不开，智能体向已保存的收款方付多少都没有限制。");
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!account) p.push(tr("Connect a wallet: it becomes the owner.", "请连接钱包：它将成为所有者。"));
    if (!isAddress(agent.trim(), { strict: false })) p.push(tr("Enter your agent's address.", "请输入智能体的地址。"));
    else if (account && agent.trim().toLowerCase() === account.toLowerCase()) p.push(tr("Use a separate key for the agent, not your own.", "请给智能体用单独的密钥，不要用你自己的。"));
    if (!Object.values(on).some(Boolean)) p.push(tr("Pick at least one fuse.", "请至少选择一个保险丝。"));
    else if (noLimit) p.push(NO_LIMIT);
    if (on["approval-2of3"] && approvers.some((a) => !isAddress(a.trim(), { strict: false }))) p.push(tr("Two of Three needs three approver addresses.", "Two of Three 需要三个审批人地址。"));
    if (goodPayees.some((x) => !isAddress(x.trim(), { strict: false }))) p.push(tr("A saved payee isn't a valid address.", "有一个已保存的收款方不是有效地址。"));
    if (depositUnits < 0n || floatUnits < 0n) p.push(tr("Amounts must be numbers, up to 6 decimals.", "金额必须是数字，最多 6 位小数。"));
    if (bal && depositUnits + floatUnits > bal.usdt) p.push(tr(`You have ${Number(bal.usdt) / 1e6} USD₮0; the deposit and float need ${Number(depositUnits + floatUnits) / 1e6}.`, `你持有 ${Number(bal.usdt) / 1e6} USD₮0，预存费用和钱包资金共需 ${Number(depositUnits + floatUnits) / 1e6}。`));
    if (bal && bal.okb === 0n) p.push(tr("You need a little OKB on X Layer for gas.", "你需要一点 X Layer 上的 OKB 来支付 gas。"));
    else if (bal && gasWei > 0n && bal.okb <= gasWei) p.push(tr(`The agent's gas (${gas} OKB) is more than the OKB you have; lower it or top up.`, `给智能体的 gas（${gas} OKB）超过了你持有的 OKB；请调低或充值。`));
    if (gasWei < 0n) p.push(tr("Agent gas must be a number of OKB.", "智能体 gas 必须是一个 OKB 数值。"));
    return p;
  }, [account, agent, on, approvers, goodPayees, depositUnits, floatUnits, bal, gas, gasWei, noLimit, NO_LIMIT, tr]);

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
    const money = [depositUnits > 0n && tr(`${deposit} USD₮0 fees`, `${deposit} USD₮0 费用`), floatUnits > 0n && tr(`${float} USD₮0 to spend`, `${float} USD₮0 可支出`), gasWei > 0n && tr(`${gas} OKB agent gas`, `${gas} OKB 智能体 gas`)].filter(Boolean).join(" · ");
    return [
      {
        id: "permit", label: tr("Let the setup take your USD₮0", "允许设置合约划转你的 USD₮0"), detail: pull > 0n ? tr(`${Number(pull) / 1e6} USD₮0 · a free signature, no gas`, `${Number(pull) / 1e6} USD₮0 · 免费签名，无需 gas`) : tr("nothing to move", "无需划转"), nullIs: "done",
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
        id: "setup", label: tr("Wire up your wallet", "搭建你的钱包"), detail: tr(`one transaction: ${installs.length} fuse${installs.length === 1 ? "" : "s"} (${names}) · ${goodPayees.length} payee${goodPayees.length === 1 ? "" : "s"}${money ? ` · ${money}` : ""}`, `一笔交易：${installs.length} 个保险丝（${names}）· ${goodPayees.length} 个收款方${money ? ` · ${money}` : ""}`),
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
      { id: "accept", label: tr("Make it yours", "成为所有者"), detail: tr("accept ownership: only you can change its fuses from now on", "接受所有权：从此只有你能修改它的保险丝"), run: (c) => write({ address: c.wallet!, abi: fuseboxWalletAbi, functionName: "acceptOwnership" }) },
    ];
  };

  // the step-by-step way: one transaction per step (used when no setup helper is deployed)
  const planClassic = (): TxStep<Ctx>[] => {
    const W = () => ({ abi: fuseboxWalletAbi, address: undefined as unknown as Address });
    const steps: TxStep<Ctx>[] = [
      {
        id: "create", label: tr("Create your Fusebox wallet", "创建你的 Fusebox 钱包"), detail: tr(`owner ${short(account!)} · agent ${short(agent.trim())}`, `所有者 ${short(account!)} · 智能体 ${short(agent.trim())}`),
        run: () => write({ address: CURRENT.factory, abi: fuseboxFactoryAbi, functionName: "createWallet", args: [account!, [getAddress(agent.trim().toLowerCase())], toHex(crypto.getRandomValues(new Uint8Array(32)))] }),
        after: (r, c) => {
          for (const l of r.logs) { try { const ev = decodeEventLog({ abi: fuseboxFactoryAbi, data: l.data, topics: l.topics }); if (ev.eventName === "WalletCreated") c.wallet = ev.args.wallet; } catch {} }
          c.block = Number(r.blockNumber); remember(c);
        },
      },
      { id: "token", label: tr("Let it pay in USD₮0", "启用 USD₮0 付款"), run: (c) => write({ ...W(), address: c.wallet!, functionName: "setToken", args: [DEP.usdt0 as Address, true] }) },
    ];
    FUSES.filter((f) => on[f.key]).forEach((f) => {
      const detail = f.key === "daily-cap" ? tr(`${clamp(cap)} USD₮0 a day`, `每天 ${clamp(cap)} USD₮0`) : f.key === "payee-guard" ? tr(`${clamp(cool)} h cooling-off, ${clamp(trial)} USD₮0 trial`, `${clamp(cool)} 小时冷静期，试付 ${clamp(trial)} USD₮0`) : f.key === "approval-2of3" ? tr(`approvals over ${clamp(thr)} USD₮0`, `超过 ${clamp(thr)} USD₮0 需审批`) : f.key === "repeat-guard" ? tr(`the same payment once per ${hours(win)} h`, `同一笔付款每 ${hours(win)} 小时只付一次`) : tr("trips on strangers", "遇陌生地址即触发");
      steps.push({ id: `fuse-${f.key}`, label: tr(`Splice in ${f.name}`, `接入 ${f.name}`), detail: tr(`${detail} · ${Number(feeOf(f)) / 1e6} USD₮0 per check`, `${detail} · 每次检查 ${Number(feeOf(f)) / 1e6} USD₮0`), run: (c) => write({ ...W(), address: c.wallet!, functionName: "addFuse", args: [BigInt(f.id), paramsOf(f), feeOf(f)] }) });
    });
    goodPayees.forEach((p, i) => steps.push({ id: `payee-${i}`, label: tr("Save a payee", "保存收款方"), detail: short(p.trim()), run: (c) => write({ ...W(), address: c.wallet!, functionName: "addPayee", args: [getAddress(p.trim().toLowerCase())] }) }));
    if (on["approval-2of3"]) steps.push({ id: "approvers", label: tr("Seat the three approvers", "设置三位审批人"), detail: approvers.map((a) => short(a.trim())).join(" · "), run: (c) => write({ ...W(), address: c.wallet!, functionName: "setApprovers", args: [approvers.map((a) => getAddress(a.trim().toLowerCase())) as [Address, Address, Address]] }) });
    if (depositUnits > 0n) {
      steps.push({ id: "approve", label: tr("Allow the registry to take the fee deposit", "允许注册表划转预存费用"), detail: `${deposit} USD₮0`, run: async () => {
        const have = await pub.readContract({ address: DEP.usdt0 as Address, abi: erc20, functionName: "allowance", args: [account!, CURRENT.registry] });
        return have >= depositUnits ? null : write({ address: DEP.usdt0 as Address, abi: erc20, functionName: "approve", args: [CURRENT.registry, depositUnits] });
      } });
      steps.push({ id: "deposit", label: tr("Prepay fees", "预付费用"), detail: tr(`${deposit} USD₮0 ≈ ${perDecision ? Number(depositUnits / perDecision) : 0} decisions`, `${deposit} USD₮0 ≈ ${perDecision ? Number(depositUnits / perDecision) : 0} 次决策`), run: (c) => write({ address: CURRENT.registry, abi: fuseRegistryAbi, functionName: "deposit", args: [c.wallet!, depositUnits] }) });
    }
    if (gasWei > 0n) steps.push({ id: "gas", label: tr("Send your agent gas", "给智能体发送 gas"), detail: tr(`${gas} OKB · about ${Math.floor(Number(gas) / GAS_PER_PAY)} payments`, `${gas} OKB · 约 ${Math.floor(Number(gas) / GAS_PER_PAY)} 笔付款`), run: () => send(getAddress(agent.trim().toLowerCase()), gasWei) });
    if (floatUnits > 0n) steps.push({ id: "float", label: tr("Fund the wallet for payments", "为钱包充值以供付款"), detail: `${float} USD₮0`, run: (c) => write({ address: DEP.usdt0 as Address, abi: erc20, functionName: "transfer", args: [c.wallet!, floatUnits] }) });
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
    <div className="wz-mode m" role="radiogroup" aria-label={tr("Setup mode", "设置模式")}>
      <button role="radio" aria-checked={quick} className={`dt-btn${quick ? " on" : ""}`} onClick={() => setQuick(true)}>{tr("Quick setup", "快速设置")}</button>
      <button role="radio" aria-checked={!quick} className={`dt-btn${!quick ? " on" : ""}`} onClick={() => setQuick(false)}>{tr("Every setting", "全部设置")}</button>
      <span className="mute">{quick ? tr("Four answers; sensible defaults for the rest", "回答四个问题，其余使用合理的默认值") : tr("Every fuse, limit and amount", "每个保险丝、限额和金额")}</span>
    </div>
  );
  const quickApprovers = (
    <div className="addr-list m">
      {[1, 2].map((i) => <div className="ar field" key={i}><input aria-label={tr(`Approver ${i + 1} address`, `审批人 ${i + 1} 地址`)} value={approvers[i]} onChange={(e) => setApprovers(approvers.map((x, k) => (k === i ? e.target.value : x)))} placeholder={tr(`Approver ${i + 1} · 0x… (optional)`, `审批人 ${i + 1} · 0x…（可选）`)} spellCheck={false} /></div>)}
    </div>
  );

  // ---- phones: one step per screen, Back / Next under the thumb
  const [step, setStep] = useState(0);
  const [describe, setDescribe] = useState(false);
  const STEPS = zh ? ["开始", "所有者", "智能体", "保险丝", "人员", "充值"] : ["Start", "Owner", "Agent", "Fuses", "People", "Fund"];
  const GL: Record<Key, GlyphName> = { "daily-cap": "mine", "payee-guard": "approve", breaker: "stop", "approval-2of3": "x402", "repeat-guard": "copy" };
  const agentErr = !agent.trim() ? tr("Enter the address your agent signs with.", "请输入智能体用来签名的地址。") : !isAddress(agent.trim(), { strict: false }) ? tr("That isn't an address.", "这不是一个有效地址。") : account && agent.trim().toLowerCase() === account.toLowerCase() ? tr("Use a separate key for the agent, not your own.", "请给智能体用单独的密钥，不要用你自己的。") : null;
  const blockNext = step === 2 && !!agentErr;
  const activeStarter = STARTERS.find((x) => FUSES.every((f) => on[f.key] === x.on[f.key]) && (!x.on["daily-cap"] || cap === x.cap) && (!x.on["payee-guard"] || (cool === x.cool && trial === x.trial)) && (!x.on["approval-2of3"] || thr === x.thr) && (!x.on["repeat-guard"] || win === x.win));
  const go = (n: number) => { setStep(n); window.scrollTo({ top: 0 }); };
  const mobileView = (
    <div className="mpage wzm">
      <PageChrome title={tr("Wire up", "搭建钱包")} sub={made?.wallet ? tr("Done", "完成") : tr(`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`, `第 ${step + 1} 步，共 ${STEPS.length} 步 · ${STEPS[step]}`)}
        info={tr(<><p>Your agent gets a key that can only pay through the fuses you pick. You stay the owner: you set the limits, save payees, and reset a blown fuse.</p><p>Each fuse is a TapeOut circuit on X Layer. A payment needs a yes from every fuse, and each check pays the fuse&apos;s designer. Everything runs on X Layer mainnet; gas is a tiny fraction of a cent.</p></>,
          <><p>你的智能体会拿到一个密钥，只能通过你选的保险丝付款。你仍是所有者：由你设定限额、保存收款方、重置已熔断的保险丝。</p><p>每个保险丝都是 X Layer 上的一个 TapeOut 电路。一笔付款需要每个保险丝都说“是”，每次检查都会向保险丝的设计者付费。一切都在 X Layer 主网上运行；gas 远不到一美分。</p></>)} />
      <div className="wzm-prog" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${STEPS.length}, 1fr)` }}>{STEPS.map((s, i) => <i key={s} className={i <= step || made?.wallet ? "on" : ""} />)}</div>

      {made?.wallet ? (
        <div className="done-card">
          <div className="mtitle">{tr(<>It&apos;s live.</>, <>已上线。</>)}</div>
          <p className="mcap" style={{ marginTop: 10 }}>{tr(<>Your wallet <span className="m lime">{short(made.wallet)}</span> is on X Layer with its fuses spliced in. Now hand it to your agent, or make your first payment right here.</>, <>你的钱包 <span className="m lime">{short(made.wallet)}</span> 已在 X Layer 上线，保险丝均已接入。现在把它交给你的智能体，或者就在这里完成第一笔付款。</>)}</p>
          <Link className="btn lime" style={{ marginTop: 16, justifyContent: "center", height: 52 }} href={`/app/first?wallet=${made.wallet}`}>{tr("Make your first payment", "完成第一笔付款")} <span className="k">→</span></Link>
          <div className="mlabel m" style={{ marginTop: 18 }}><span>{tr("Connect your agent", "连接你的智能体")}</span></div>
          <AgentConnect wallet={made.wallet} agentKey={keyLive?.key} />
          <a className="btn" style={{ marginTop: 12, justifyContent: "center", height: 48 }} href={alertsLink(made.wallet)} target="_blank" rel="noreferrer">{tr("Get alerts on Telegram", "在 Telegram 上接收提醒")} <span className="k">↗</span></a>
          <Link className="btn" style={{ marginTop: 12, justifyContent: "center", height: 48 }} href={`/app/w/${made.wallet}`}>{tr("Open my wallet", "打开我的钱包")}</Link>
        </div>
      ) : <>
        {step === 0 && <>
          <div><div className="mtitle">{tr("Before you start", "开始之前")}</div><p className="mcap" style={{ marginTop: 8 }}>{tr(<>You&apos;ll need four things. Fusebox checks what it can.</>, <>你需要准备四样东西。能检查的，Fusebox 会帮你检查。</>)}</p></div>
          <NeedList account={account} bal={bal} />
          <p className="mnote">{tr("Missing something? You can still walk through every step: nothing is signed until the last one.", "缺了什么？你仍然可以走完每一步：直到最后一步才需要签名。")}</p>
          <div className="mrows">
            {!account && <MRow href={OKX_DOWNLOAD} ext icon={<Glyph name="key" size={16} />} title={tr("Get OKX Wallet", "获取 OKX Wallet")} sub={tr("The wallet that works best on X Layer", "在 X Layer 上最好用的钱包")} />}
            <MRow href="/docs#start" icon={<Glyph name="docs" size={16} />} title={tr("How Fusebox works", "Fusebox 如何运作")} sub={tr("The two-minute version", "两分钟看懂")} />
          </div>
        </>}
        {step === 1 && <>
          <div><div className="mtitle">{tr("Connect the owner", "连接所有者")}</div><p className="mcap" style={{ marginTop: 8 }}>{tr("The wallet you connect owns the new one. Only it can change fuses, limits and payees.", "你连接的钱包将拥有这个新钱包。只有它能修改保险丝、限额和收款方。")}</p></div>
          {account ? <MRow icon={<Plate address={account} size={22} />} title={short(account)} sub={tr("Owner · connected", "所有者 · 已连接")} chev={false} /> : <ConnectChoices cta="" />}
        </>}
        {step === 2 && <>
          <div><div className="mtitle">{tr("Name the agent", "指定智能体")}</div><p className="mcap" style={{ marginTop: 8 }}>{tr("The address your AI agent signs with. It can only ask this wallet to pay, through every fuse.", "你的 AI 智能体用来签名的地址。它只能请求这个钱包付款，并且要经过每个保险丝。")}</p></div>
          {!keyLive && <button className="btn lime" style={{ justifyContent: "center", height: 52 }} onClick={makeKey}>{tr("Make an agent key for me", "帮我生成智能体密钥")}</button>}
          {keyLive ? <KeyCard k={keyLive} keep={keepKey} setKeep={setKeepKey} /> : <>
            <div className="mlabel m"><span>{tr(<>Or paste your agent&apos;s address</>, <>或粘贴你的智能体地址</>)}</span></div>
            <label className="mfield"><span className="sr">{tr("Agent address", "智能体地址")}</span><input aria-label={tr("Agent address", "智能体地址")} value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x…" spellCheck={false} /></label>
          </>}
          {agent.trim() && agentErr && <p className="mnote" style={{ color: "var(--red)" }}>{agentErr}</p>}
          {keyLive && <button className="linkbtn m" onClick={() => { setGenKey(null); savePendingKey(null); setAgent(""); }}>{tr("Use my own agent address instead", "改用我自己的智能体地址")}</button>}
        </>}
        {step === 3 && quick && <>
          {modeSwitch}
          <div><div className="mtitle">{tr("What does your agent do?", "你的智能体做什么？")}</div><p className="mcap" style={{ marginTop: 8 }}>{tr("Pick the closest; each comes with fuses and limits that fit.", "选最接近的一项；每项都配好了合适的保险丝和限额。")}</p></div>
          <MChips label={tr("What your agent does", "智能体的用途")} items={STARTERS.map((x) => [x.id, zh ? x.nameZh : x.name] as const)} value={starterId} onChange={(id) => applyStarter(STARTERS.find((s) => s.id === id)!)} />
          <p className="mnote">{zh ? starter.whyZh : starter.why}</p>
          <div className="mcard" style={{ padding: 14 }}><div className="mkv"><span>{tr("Fuses", "保险丝")}</span><span>{FUSES.filter((f) => on[f.key]).map((f) => f.name).join(" · ")}</span></div></div>
          {on["daily-cap"] && <label className="mfield"><span className="m">{tr("At most a day · USD₮0", "每天最多 · USD₮0")}</span><input aria-label={tr("Cap per day (USD₮0)", "每日上限（USD₮0）")} value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" /></label>}
        </>}
        {step === 3 && !quick && <>
          {modeSwitch}
          <div><div className="mtitle">{tr("Pick the fuses", "选择保险丝")}</div><p className="mcap" style={{ marginTop: 8 }}>{tr("Every payment must pass all of them.", "每笔付款都必须通过所有保险丝。")}</p></div>
          <MChips label={tr("Start from a line", "从一条线路开始")} items={STARTERS.map((x) => [x.id, zh ? x.nameZh : x.name] as const)} value={activeStarter?.id ?? null} onChange={(id) => { const x = STARTERS.find((s) => s.id === id)!; setOn(x.on); setWin(x.win); setCap(x.cap); setCool(x.cool); setTrial(x.trial); setThr(x.thr); }} />
          {activeStarter && <p className="mnote">{zh ? activeStarter.whyZh : activeStarter.why}</p>}
          <MRow icon={<Glyph name="rob" size={16} />} title={tr("Describe your agent instead", "改为描述你的智能体")} sub={tr("Get a line of fuses, with reasons", "得到一条保险丝线路，并附上理由")} onClick={() => setDescribe(true)} />
          {FUSES.map((f) => (
            <div key={f.key} className={`mcard mopt${on[f.key] ? " on" : ""}`}>
              <div className="mopt-t">
                <Glyph name={GL[f.key]} size={18} color={on[f.key] ? "var(--lime)" : "var(--dim)"} />
                <span><b>{f.name}</b><small className="m">{Number(feeOf(f)) / 1e6} {tr("USD₮0 / check", "USD₮0 / 次检查")}</small></span>
                <Toggle on={on[f.key]} flip={() => toggle(f.key)} name={f.name} />
              </div>
              {on[f.key] && f.key === "daily-cap" && <label className="mfield"><span className="m">{tr("Cap per day · USD₮0", "每日上限 · USD₮0")}</span><input aria-label={tr("Cap per day (USD₮0)", "每日上限（USD₮0）")} value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" /></label>}
              {on[f.key] && f.key === "payee-guard" && <div className="mopt-2"><label className="mfield"><span className="m">{tr("Cooling-off · h", "冷静期 · 小时")}</span><input aria-label={tr("Cooling-off (hours)", "冷静期（小时）")} value={cool} onChange={(e) => setCool(e.target.value)} inputMode="decimal" /></label><label className="mfield"><span className="m">{tr("Trial · USD₮0", "试付 · USD₮0")}</span><input aria-label={tr("Trial amount (USD₮0)", "试付额度（USD₮0）")} value={trial} onChange={(e) => setTrial(e.target.value)} inputMode="decimal" /></label></div>}
              {on[f.key] && f.key === "repeat-guard" && <label className="mfield"><span className="m">{tr("Window · h", "时间窗口 · 小时")}</span><input aria-label={tr("Repeat window (hours)", "重复检测窗口（小时）")} value={win} onChange={(e) => setWin(e.target.value)} inputMode="numeric" /></label>}
              {on[f.key] && f.key === "approval-2of3" && <label className="mfield"><span className="m">{tr("Approvals above · USD₮0", "审批阈值 · USD₮0")}</span><input aria-label={tr("Approvals above (USD₮0)", "审批阈值（USD₮0）")} value={thr} onChange={(e) => setThr(e.target.value)} inputMode="decimal" /></label>}
              {!on[f.key] && <p className="mnote">{zh ? f.sayZh : f.say}</p>}
            </div>
          ))}
          {noLimit && <p className="mnote" role="alert" style={{ color: "var(--red)" }}>{NO_LIMIT}</p>}
          <Link className="m lime" href={simLink}>{tr("Test this line on sample payments →", "用示例付款测试这条线路 →")}</Link>
        </>}
        {step === 4 && <>
          <div><div className="mtitle">{tr("Payees and approvers", "收款方和审批人")}</div><p className="mcap" style={{ marginTop: 8 }}>{on["payee-guard"] || on.breaker ? tr("Saved payees go straight through Payee Guard and the Breaker.", "已保存的收款方可以直接通过 Payee Guard 和 Breaker。") : tr("Payees you save now; you can add more later.", "现在保存的收款方；以后还可以添加更多。")}</p></div>
          <div className="mlabel m"><span>{tr("Saved payees", "已保存的收款方")}</span><span>{goodPayees.length}</span></div>
          {payees.map((p, i) => <div className="mfield-row" key={i}><label className="mfield"><span className="sr">{tr(`Saved payee ${i + 1} address`, `已保存收款方 ${i + 1} 的地址`)}</span><input aria-label={tr(`Saved payee ${i + 1} address`, `已保存收款方 ${i + 1} 的地址`)} value={p} onChange={(e) => setPayees(payees.map((x, k) => (k === i ? e.target.value : x)))} placeholder="0x…" spellCheck={false} /></label><button className="mfield-x" onClick={() => setPayees(payees.filter((_, k) => k !== i))} aria-label={tr(`Remove saved payee ${i + 1}`, `移除已保存收款方 ${i + 1}`)}>✕</button></div>)}
          <button className="btn" style={{ justifyContent: "center" }} onClick={() => setPayees([...payees, ""])}>{tr("+ Add a payee", "+ 添加收款方")}</button>
          {quick && starter.on["approval-2of3"] && <>
            <div className="mlabel m"><span>{tr("Two people for big payments · optional", "大额付款需两人同意 · 可选")}</span></div>
            <p className="mnote">{tr(`Name two more approvers and anything over ${clamp(thr)} USD₮0 needs two of the three of you. Leave empty to skip.`, `再指定两位审批人后，超过 ${clamp(thr)} USD₮0 的付款需要你们三人中的两人同意。留空即跳过。`)}</p>
            {[1, 2].map((i) => <label className="mfield" key={i}><span className="sr">{tr(`Approver ${i + 1} address`, `审批人 ${i + 1} 地址`)}</span><input aria-label={tr(`Approver ${i + 1} address`, `审批人 ${i + 1} 地址`)} value={approvers[i]} onChange={(e) => setApprovers(approvers.map((x, k) => (k === i ? e.target.value : x)))} placeholder={tr(`Approver ${i + 1} · 0x… (optional)`, `审批人 ${i + 1} · 0x…（可选）`)} spellCheck={false} /></label>)}
          </>}
          {!quick && on["approval-2of3"] && <>
            <div className="mlabel m"><span>{tr(`Approvers · two of three sign over ${clamp(thr)} USD₮0`, `审批人 · 超过 ${clamp(thr)} USD₮0 需三人中两人签名`)}</span></div>
            {approvers.map((a, i) => <label className="mfield" key={i}><span className="sr">{tr(`Approver ${i + 1} address`, `审批人 ${i + 1} 地址`)}</span><input aria-label={tr(`Approver ${i + 1} address`, `审批人 ${i + 1} 地址`)} value={a} onChange={(e) => setApprovers(approvers.map((x, k) => (k === i ? e.target.value : x)))} placeholder={tr(`Approver ${i + 1} · 0x…`, `审批人 ${i + 1} · 0x…`)} spellCheck={false} /></label>)}
          </>}
        </>}
        {step === 5 && <>
          <div><div className="mtitle">{tr("Fund it", "充值")}</div><p className="mcap" style={{ marginTop: 8 }}>{tr("Fees come from a prepaid balance; payments come from the wallet.", "费用从预付余额中扣除；付款从钱包中支出。")}</p></div>
          {bal && <div className="mstats" style={{ gridTemplateColumns: "1fr 1fr" }}><div><span className="m">{tr("You have", "你持有")}</span><b>{(Number(bal.usdt) / 1e6).toFixed(2)}<small>USD₮0</small></b></div><div><span className="m">Gas</span><b>{(Number(bal.okb) / 1e18).toFixed(4)}<small>OKB</small></b></div></div>}
          {quick ? <>
            <label className="mfield"><span className="m">{tr("Money to spend · USD₮0", "可支出金额 · USD₮0")}</span><input aria-label={tr("Money to spend (USD₮0)", "可支出金额（USD₮0）")} value={float} onChange={(e) => setFloat(e.target.value)} inputMode="decimal" /></label>
            <p className="mnote">{tr(`Also set aside: ${deposit} USD₮0 of prepaid checks and ${gas} OKB of gas for your agent.`, `另外预留：${deposit} USD₮0 的预付检查费，以及给智能体的 ${gas} OKB gas。`)} <button className="linkbtn" onClick={() => setQuick(false)}>{tr("Change these", "修改")}</button></p>
          </> : <>
          <div className="mopt-2">
            <label className="mfield"><span className="m">{tr("Fee balance · USD₮0", "费用余额 · USD₮0")}</span><input aria-label={tr("Fee balance (USD₮0)", "费用余额（USD₮0）")} value={deposit} onChange={(e) => setDeposit(e.target.value)} inputMode="decimal" /></label>
            <label className="mfield"><span className="m">{tr("Wallet float · USD₮0", "钱包资金 · USD₮0")}</span><input aria-label={tr("Wallet float (USD₮0)", "钱包资金（USD₮0）")} value={float} onChange={(e) => setFloat(e.target.value)} inputMode="decimal" /></label>
          </div>
          <label className="mfield"><span className="m">{tr(`Agent gas · OKB · ≈ ${Math.max(0, Math.floor(Number(gas || 0) / GAS_PER_PAY))} payments`, `智能体 gas · OKB · ≈ ${Math.max(0, Math.floor(Number(gas || 0) / GAS_PER_PAY))} 笔付款`)}</span><input aria-label={tr("Agent gas (OKB)", "智能体 gas（OKB）")} value={gas} onChange={(e) => setGas(e.target.value)} inputMode="decimal" /></label>
          </>}
          <div className="mcard" style={{ padding: 14 }}><div className="mkv">
            <span>{tr("Fuses", "保险丝")}</span><span>{tr(`${Object.values(on).filter(Boolean).length} · ${(Number(perDecision) / 1e6).toFixed(4)} USD₮0 a payment`, `${Object.values(on).filter(Boolean).length} · 每笔付款 ${(Number(perDecision) / 1e6).toFixed(4)} USD₮0`)}</span>
            <span>{tr("Fees cover", "费用可支付")}</span><span>{perDecision && depositUnits > 0n ? tr(`${Number(depositUnits / perDecision)} decisions`, `${Number(depositUnits / perDecision)} 次决策`) : "—"}</span>
            <span>{tr("Daily cap", "每日限额")}</span><span>{on["daily-cap"] ? `${clamp(cap)} USD₮0` : tr("off", "关闭")}</span>
            <span>{tr("Approvals over", "审批阈值")}</span><span>{on["approval-2of3"] ? `${clamp(thr)} USD₮0` : tr("off", "关闭")}</span>
            <span>{tr("Repeats", "重复付款")}</span><span>{on["repeat-guard"] ? tr(`once per ${hours(win)} h`, `每 ${hours(win)} 小时一次`) : tr("off", "关闭")}</span>
            <span>{tr("Saved payees", "已保存的收款方")}</span><span>{goodPayees.length}</span>
          </div></div>
          {q.steps.length > 0 && <ul className="txs">{q.steps.map((s) => (
            <li key={s.id} className={s.state}><span className="dot" /><span>{s.label}{s.detail ? <span className="m mute" style={{ display: "block", marginTop: 3 }}>{s.detail}</span> : null}</span>
              <span className="st">{s.hash ? <a href={`${OKLINK}/tx/${s.hash}`} target="_blank" rel="noreferrer">{s.state === "done" ? tr("Done ↗", "完成 ↗") : tr("Mining ↗", "确认中 ↗")}</a> : s.state === "sign" ? tr("Sign", "签名") : s.state === "skip" ? tr("Not needed", "无需") : s.state === "error" ? tr("Failed", "失败") : s.state === "done" ? tr("Signed", "已签名") : ""}</span>
              {s.error && <span className="e">{zh ? errZh(s.error) : s.error}</span>}</li>))}</ul>}
          {!q.running && problems.length > 0 && <p className="mnote" style={{ color: "var(--red)" }}>{problems[0]}</p>}
        </>}
        {step === 5 && !q.steps.length && <p className="m mute">{CURRENT.setup ? tr("Three taps: a free signature, one transaction that sets everything up, then make it yours.", "三步完成：一次免费签名，一笔完成全部设置的交易，然后成为所有者。") : tr("Each step is one transaction you sign.", "每一步都是一笔需要你签名的交易。")}</p>}
        <MSticky>
          {step > 0 && <button className="btn fit" onClick={() => go(step - 1)} disabled={q.running}>{tr("Back", "返回")}</button>}
          {step < STEPS.length - 1
            ? <button className="btn lime" disabled={blockNext} onClick={() => go(step + 1)}>{tr("Next", "下一步")} · {STEPS[step + 1]} <span className="k">→</span></button>
            : failed ? <button className="btn lime" onClick={retry} disabled={q.running}>{q.running ? tr("Working…", "处理中…") : tr("Retry the failed step", "重试失败的步骤")}</button>
            : <button className="btn lime" onClick={launch} disabled={q.running || problems.length > 0}>{q.running ? tr("Sign in your wallet…", "请在钱包中签名…") : tr("Wire it up", "开始搭建")} <span className="k">→</span></button>}
        </MSticky>
      </>}
      <MSheet open={describe} onClose={() => setDescribe(false)} title={tr("Describe your agent", "描述你的智能体")}>
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
        <h1 className="disp" data-a>{tr(<>Wire up a <span className="lime">[wallet]</span>.</>, <>搭建一个<span className="lime">[钱包]</span>。</>)}</h1>
        <p data-a>{tr("Your agent gets a key that can only pay through the fuses you pick. You stay the owner: you set the limits, save payees, and reset a blown fuse. Everything runs on X Layer mainnet.", "你的智能体会拿到一个密钥，只能通过你选的保险丝付款。你仍是所有者：由你设定限额、保存收款方、重置已熔断的保险丝。一切都在 X Layer 主网上运行。")}</p>
      </section>
      <section className="need-box" data-a aria-label={tr("Before you start", "开始之前")}>
        <div className="need-h m"><span className="lime">{tr("Before you start", "开始之前")}</span><span className="mute">{tr("nothing is signed until the last step", "直到最后一步才需要签名")}</span></div>
        <NeedList account={account} bal={bal} compact />
      </section>
      <h2 className="sr">{tr("Set up your wallet", "设置你的钱包")}</h2>
      <section className="wz">
        <div className="wz-main" data-a>
          {modeSwitch}
          <div className={`wz-sec${account ? "" : " off"}`}>
            <div className="ix">01</div>
            <div>
              <h3>{tr("Connect the owner", "连接所有者")}</h3>
              {account ? <p className="lead">{tr(<>Owner: <span className="m lime">{account}</span>. Only this address can change the wallet&apos;s fuses, payees and limits.</>, <>所有者：<span className="m lime">{account}</span>。只有这个地址能修改钱包的保险丝、收款方和限额。</>)}</p> : (
                <>
                  <p className="lead">{tr("The wallet you connect becomes the owner. OKX Wallet works best on X Layer.", "你连接的钱包将成为所有者。在 X Layer 上推荐使用 OKX Wallet。")}</p>
                  <ConnectChoices cta="" />
                </>
              )}
            </div>
          </div>
          <div className="wz-sec">
            <div className="ix">02</div>
            <div>
              <h3>{tr("Name the agent", "指定智能体")}</h3>
              <p className="lead">{tr(<>The address your AI agent signs with. It can do exactly one thing: ask this wallet to pay, through every fuse. It can&apos;t change a fuse, a limit or a payee.</>, <>你的 AI 智能体用来签名的地址。它只能做一件事：请求这个钱包付款，并且要经过每个保险丝。它不能修改保险丝、限额或收款方。</>)}</p>
              {keyLive ? <KeyCard k={keyLive} keep={keepKey} setKeep={setKeepKey} /> : <>
                <button className="btn lime" onClick={makeKey} style={{ marginBottom: 14 }}>{tr("Make an agent key for me", "帮我生成智能体密钥")} <span className="k">→</span></button>
                <div className="field m"><label>{tr(<>Or paste your agent&apos;s address</>, <>或粘贴你的智能体地址</>)}</label><input aria-label={tr("Agent address", "智能体地址")} value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x…" spellCheck={false} /></div>
              </>}
              {keyLive && <button className="linkbtn m" style={{ marginTop: 10 }} onClick={() => { setGenKey(null); savePendingKey(null); setAgent(""); }}>{tr("Use my own agent address instead", "改用我自己的智能体地址")}</button>}
            </div>
          </div>
          <div className="wz-sec">
            <div className="ix">03</div>
            <div>
              {quick ? <>
              <h3>{tr("What does your agent do?", "你的智能体做什么？")}</h3>
              <p className="lead">{tr("Pick the closest. Each one is a set of fuses with limits that fit; you can change any of it under Every setting.", "选最接近的一项。每项都是一组配好合适限额的保险丝；你可以在“全部设置”里修改其中任何一项。")}</p>
              <div className="starters" role="group" aria-label={tr("What your agent does", "智能体的用途")}>
                {STARTERS.map((x) => (
                  <div key={x.id} className={`starter${starterId === x.id ? " on" : ""}`}>
                    <button onClick={() => applyStarter(x)} aria-pressed={starterId === x.id}>
                      <b>{zh ? x.nameZh : x.name}</b>
                      <span className="m mute">{FUSES.filter((y) => x.on[y.key]).map((y) => y.name).join(" · ")}</span>
                      <span className="starter-why">{zh ? x.whyZh : x.why}</span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="fopt"><span /><div>
                <h4>{tr("Who does it pay?", "它付款给谁？")}</h4>
                <p>{tr("Addresses your agent pays without a second look. You can add more later.", "智能体可以直接付款、无需再次确认的地址。以后还可以添加更多。")}</p>
                <div className="addr-list m">
                  {payees.map((p, i) => <div className="ar field" key={i}><input aria-label={tr(`Saved payee ${i + 1} address`, `已保存收款方 ${i + 1} 的地址`)} value={p} onChange={(e) => setPayees(payees.map((x, k) => (k === i ? e.target.value : x)))} placeholder="0x…" spellCheck={false} /></div>)}
                  <button className="linkbtn" onClick={() => setPayees([...payees, ""])}>{tr("+ Add a payee", "+ 添加收款方")}</button>
                </div>
              </div></div>
              {on["daily-cap"] && <div className="fopt"><span /><div><h4>{tr("How much a day, at most?", "每天最多付多少？")}</h4><p>{tr("The Daily Cap stops anything past this in one UTC day, however the agent is asked.", "无论智能体被怎么要求，Daily Cap 都会拦截一个 UTC 日内超出这个数的付款。")}</p><div className="prow"><Field label={tr("Cap per day", "每日上限")} suffix="USD₮0" v={cap} set={setCap} /></div></div></div>}
              {starter.on["approval-2of3"] && <div className="fopt"><span /><div><h4>{tr("Two people for big payments", "大额付款需两人同意")} <small>{tr("optional", "可选")}</small></h4><p>{tr(`Name two more approvers and anything over ${clamp(thr)} USD₮0 needs two of the three of you to sign. Leave it empty to skip; you can add them later.`, `再指定两位审批人后，超过 ${clamp(thr)} USD₮0 的付款需要你们三人中的两人签名。留空即跳过；以后也可以添加。`)}</p>{quickApprovers}</div></div>}
              </> : <>
              <h3>{tr("Pick the fuses", "选择保险丝")}</h3>
              <p className="lead">{tr(<>Each fuse is a TapeOut circuit on X Layer. A payment needs a yes from every fuse you splice in, and each check pays the fuse&apos;s designer.</>, <>每个保险丝都是 X Layer 上的一个 TapeOut 电路。一笔付款需要你接入的每个保险丝都说“是”，每次检查都会向保险丝的设计者付费。</>)}</p>
              <GuardrailsCard onApply={(g) => {
                setOn((o) => ({ ...o, "daily-cap": g.line.dailyCap.on, "payee-guard": g.line.payeeGuard.on, breaker: g.line.breaker.on, "approval-2of3": g.line.twoOfThree.on }));
                setCap(String(g.line.dailyCap.cap)); setCool(String(g.line.payeeGuard.coolingHours)); setTrial(String(g.line.payeeGuard.trial)); setThr(String(g.line.twoOfThree.threshold));
                if (g.payees.length) setPayees(g.payees);
                if (g.approvers.length) setApprovers((cur) => [0, 1, 2].map((i) => g.approvers[i] ?? cur[i]));
              }} />
              <div className="starters" role="group" aria-label={tr("Start from a line", "从一条线路开始")}>
                {STARTERS.map((x) => {
                  const active = FUSES.every((f) => on[f.key] === x.on[f.key]) && (!x.on["daily-cap"] || cap === x.cap) && (!x.on["payee-guard"] || (cool === x.cool && trial === x.trial)) && (!x.on["approval-2of3"] || thr === x.thr) && (!x.on["repeat-guard"] || win === x.win);
                  const f = FUSES.filter((y) => x.on[y.key]).map((y) => (y.key === "daily-cap" ? `${y.id}:${x.cap}` : y.key === "payee-guard" ? `${y.id}:${x.cool}:${x.trial}` : y.key === "approval-2of3" ? `${y.id}:${x.thr}` : y.key === "repeat-guard" ? `${y.id}:${x.win}` : `${y.id}`)).join(",");
                  return (
                    <div key={x.id} className={`starter${active ? " on" : ""}`}>
                      <button onClick={() => { setOn(x.on); setWin(x.win); setCap(x.cap); setCool(x.cool); setTrial(x.trial); setThr(x.thr); }} aria-pressed={active}>
                        <b>{zh ? x.nameZh : x.name}</b>
                        <span className="m mute">{FUSES.filter((y) => x.on[y.key]).map((y) => y.name).join(" · ")}</span>
                        <span className="starter-why">{zh ? x.whyZh : x.why}</span>
                      </button>
                      <Link className="m lime" href={`/app/simulate?f=${f}`}>{tr("Test it →", "测试 →")}</Link>
                    </div>
                  );
                })}
              </div>
              {noLimit && <div className="wz-nolimit" role="alert">{NO_LIMIT}</div>}
              {FUSES.map((f) => (
                <div className="fopt" key={f.key}>
                  <Toggle on={on[f.key]} flip={() => toggle(f.key)} name={f.name} />
                  <div>
                    <h4>{f.name}<small>{Number(feeOf(f)) / 1e6} {tr("USD₮0 / check", "USD₮0 / 次检查")}</small></h4>
                    <p>{zh ? f.sayZh : f.say}</p>
                    {on[f.key] && f.key === "daily-cap" && <div className="prow"><Field label={tr("Cap per day", "每日上限")} suffix="USD₮0" v={cap} set={setCap} /></div>}
                    {on[f.key] && f.key === "payee-guard" && <div className="prow"><Field label={tr("Cooling-off", "冷静期")} suffix={tr("hours", "小时")} v={cool} set={setCool} /><Field label={tr("Trial amount", "试付额度")} suffix="USD₮0" v={trial} set={setTrial} /></div>}
                    {on[f.key] && f.key === "repeat-guard" && <div className="prow"><Field label={tr("Window", "时间窗口")} suffix={tr("hours", "小时")} v={win} set={setWin} /></div>}
                    {on[f.key] && f.key === "approval-2of3" && (
                      <>
                        <div className="prow"><Field label={tr("Approvals above", "审批阈值")} suffix="USD₮0" v={thr} set={setThr} /></div>
                        <div className="addr-list m" style={{ marginTop: 12 }}>
                          {approvers.map((a, i) => <div className="ar field" key={i}><input aria-label={tr(`Approver ${i + 1} address`, `审批人 ${i + 1} 地址`)} value={a} onChange={(e) => setApprovers(approvers.map((x, k) => (k === i ? e.target.value : x)))} placeholder={tr(`Approver ${i + 1} · 0x…`, `审批人 ${i + 1} · 0x…`)} spellCheck={false} /></div>)}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div className="fopt">
                <span />
                <div>
                  <h4>{tr("Saved payees", "已保存的收款方")}</h4>
                  <p>{tr("Who Payee Guard and the Breaker treat as known. You can add more later.", "Payee Guard 和 Breaker 视为已知的地址。以后还可以添加更多。")}</p>
                  <div className="addr-list m">
                    {payees.map((p, i) => <div className="ar field" key={i}><input aria-label={tr(`Saved payee ${i + 1} address`, `已保存收款方 ${i + 1} 的地址`)} value={p} onChange={(e) => setPayees(payees.map((x, k) => (k === i ? e.target.value : x)))} placeholder="0x…" spellCheck={false} /><button onClick={() => setPayees(payees.filter((_, k) => k !== i))} aria-label={tr(`Remove saved payee ${i + 1}`, `移除已保存收款方 ${i + 1}`)}>✕</button></div>)}
                    <button className="linkbtn" onClick={() => setPayees([...payees, ""])}>{tr("+ Add a payee", "+ 添加收款方")}</button>
                  </div>
                </div>
              </div>
              </>}
            </div>
          </div>
          <div className="wz-sec">
            <div className="ix">04</div>
            <div>
              <h3>{tr("Fund it", "充值")}</h3>
              {quick ? <>
              <p className="lead">{tr("The money your agent can spend goes into the wallet.", "智能体可以花的钱会存入钱包。")} {bal ? tr(<>You have <span className="m lime">{(Number(bal.usdt) / 1e6).toFixed(4)} USD₮0</span>.</>, <>你持有 <span className="m lime">{(Number(bal.usdt) / 1e6).toFixed(4)} USD₮0</span>。</>) : null}</p>
              <div className="prow"><Field label={tr("Money to spend", "可支出金额")} suffix="USD₮0" v={float} set={setFloat} /></div>
              <p className="m mute" style={{ marginTop: 8, lineHeight: 1.6 }}>{tr(`Also set aside: ${deposit} USD₮0 of prepaid checks (about ${perDecision && depositUnits > 0n ? Number(depositUnits / perDecision) : 0} payments) and ${gas} OKB of gas for your agent.`, `另外预留：${deposit} USD₮0 的预付检查费（约 ${perDecision && depositUnits > 0n ? Number(depositUnits / perDecision) : 0} 笔付款），以及给智能体的 ${gas} OKB gas。`)} <button className="linkbtn" onClick={() => setQuick(false)}>{tr("Change these", "修改")}</button></p>
              </> : <>
              <p className="lead">{tr("Fees come from a prepaid USD₮0 balance in the registry; the payments themselves come from the wallet.", "费用从注册表中预付的 USD₮0 余额扣除；付款本身从钱包支出。")} {bal ? tr(<>You have <span className="m lime">{(Number(bal.usdt) / 1e6).toFixed(4)} USD₮0</span> and <span className="m lime">{(Number(bal.okb) / 1e18).toFixed(5)} OKB</span>.</>, <>你持有 <span className="m lime">{(Number(bal.usdt) / 1e6).toFixed(4)} USD₮0</span> 和 <span className="m lime">{(Number(bal.okb) / 1e18).toFixed(5)} OKB</span>。</>) : null}</p>
              <div className="prow">
                <Field label={tr("Fee balance", "费用余额")} suffix="USD₮0" v={deposit} set={setDeposit} />
                <Field label={tr("Wallet float", "钱包资金")} suffix="USD₮0" v={float} set={setFloat} />
                <Field label={tr("Agent gas", "智能体 gas")} suffix="OKB" v={gas} set={setGas} />
              </div>
              <p className="m mute" style={{ marginTop: 8 }}>{tr(`Agent gas ≈ ${Math.max(0, Math.floor(Number(gas || 0) / GAS_PER_PAY))} payments. Your agent needs a little OKB to send its payments; set 0 if you fund it yourself.`, `智能体 gas ≈ ${Math.max(0, Math.floor(Number(gas || 0) / GAS_PER_PAY))} 笔付款。智能体需要一点 OKB 才能发出付款；如果你自己给它充值，填 0 即可。`)}</p>
              </>}
            </div>
          </div>
        </div>
        <div className="wz-side" data-a ref={side}>
          <div className="summary">
            <div className="sh2 m"><span className="mute">{tr("Your wallet", "你的钱包")}</span><span className="lime">{tr(`${Object.values(on).filter(Boolean).length} fuses`, `${Object.values(on).filter(Boolean).length} 个保险丝`)}</span></div>
            <div className="rows">
              <div><span>{tr("Per payment", "每笔付款")}</span><span>{(Number(perDecision) / 1e6).toFixed(4)} USD₮0</span></div>
              <div><span>{tr("Fee balance covers", "费用余额可支付")}</span><span>{perDecision && depositUnits > 0n ? tr(`${Number(depositUnits / perDecision)} decisions`, `${Number(depositUnits / perDecision)} 次决策`) : "—"}</span></div>
              <div><span>{tr("Daily cap", "每日限额")}</span><span>{on["daily-cap"] ? `${clamp(cap)} USD₮0` : tr("off", "关闭")}</span></div>
              <div><span>{tr("Approvals over", "审批阈值")}</span><span>{on["approval-2of3"] ? `${clamp(thr)} USD₮0` : tr("off", "关闭")}</span></div>
              <div><span>{tr("Repeats", "重复付款")}</span><span>{on["repeat-guard"] ? tr(`once per ${hours(win)} h`, `每 ${hours(win)} 小时一次`) : tr("off", "关闭")}</span></div>
              <div><span>{tr("Saved payees", "已保存的收款方")}</span><span>{goodPayees.length}</span></div>
            </div>
            <Link className="m lime sim-link" href={simLink}>{tr("Test this line on sample payments first →", "先用示例付款测试这条线路 →")}</Link>
            {q.steps.length > 0 && (
              <ul className="txs">
                {q.steps.map((s) => (
                  <li key={s.id} className={s.state}>
                    <span className="dot" />
                    <span>{s.label}{s.detail ? <span className="m mute" style={{ display: "block", marginTop: 3 }}>{s.detail}</span> : null}</span>
                    <span className="st">{s.hash ? <a href={`${OKLINK}/tx/${s.hash}`} target="_blank" rel="noreferrer">{s.state === "done" ? tr("Done ↗", "完成 ↗") : tr("Mining ↗", "确认中 ↗")}</a> : s.state === "sign" ? tr("Sign", "签名") : s.state === "skip" ? tr("Not needed", "无需") : s.state === "error" ? tr("Failed", "失败") : s.state === "done" ? tr("Signed", "已签名") : ""}</span>
                    {s.error && <span className="e">{zh ? errZh(s.error) : s.error}</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="go">
              {made?.wallet ? (
                <div className="done-card">
                  <h4>{tr(<>It&apos;s live.</>, <>已上线。</>)}</h4>
                  <p style={{ color: "var(--soft)", fontSize: 14, lineHeight: 1.5 }}>{tr(<>Your wallet <span className="m lime">{short(made.wallet)}</span> is on X Layer with its fuses spliced in. Hand it to your agent, or make your first payment here.</>, <>你的钱包 <span className="m lime">{short(made.wallet)}</span> 已在 X Layer 上线，保险丝均已接入。把它交给你的智能体，或在这里完成第一笔付款。</>)}</p>
                  <div className="prow" style={{ marginTop: 14 }}><Link className="btn lime" href={`/app/first?wallet=${made.wallet}`} data-cursor={tr("Pay", "付款")}>{tr("Make your first payment", "完成第一笔付款")} <span className="k">→</span></Link><Link className="btn" href={`/app/w/${made.wallet}`} data-cursor={tr("Open", "打开")}>{tr("Open my wallet", "打开我的钱包")}</Link></div>
                  <h4 style={{ marginTop: 18 }}>{tr("Connect your agent", "连接你的智能体")}</h4>
                  <AgentConnect wallet={made.wallet} agentKey={keyLive?.key} />
                  <p style={{ color: "var(--soft)", fontSize: 14, lineHeight: 1.5, marginTop: 16 }}>{tr("Want a message on your phone for every payment your agent tries?", "想在手机上收到智能体每次尝试付款的消息？")} <a className="lime" href={alertsLink(made.wallet)} target="_blank" rel="noreferrer">{tr("Get alerts on Telegram ↗", "在 Telegram 上接收提醒 ↗")}</a></p>
                </div>
              ) : failed ? (
                <button className="btn lime" onClick={retry} disabled={q.running} data-cursor={tr("Retry", "重试")}>{q.running ? tr("Working…", "处理中…") : tr("Retry from the failed step", "从失败的步骤重试")}</button>
              ) : (
                <button className="btn lime" onClick={launch} disabled={q.running || problems.length > 0} data-cursor={tr("Wire it", "搭建")}>{q.running ? tr("Sign in your wallet…", "请在钱包中签名…") : <><span className="roll"><span>{tr("Wire it up", "开始搭建")}</span><span aria-hidden="true">{tr("Wire it up", "开始搭建")}</span></span> <span className="k">→</span></>}</button>
              )}
              {!q.running && !made && problems.length > 0 && <div className="warn2">{problems[0]}</div>}
              {!made && <p className="m mute" style={{ marginTop: 12, lineHeight: 1.6 }}>{CURRENT.setup ? tr("Three taps: a free signature, one transaction that sets everything up, then you accept the wallet as yours. Gas on X Layer is a tiny fraction of a cent.", "三步完成：一次免费签名，一笔完成全部设置的交易，然后由你接收这个钱包。X Layer 上的 gas 远不到一美分。") : tr("Each step is one transaction you sign. Gas on X Layer is a tiny fraction of a cent.", "每一步都是一笔需要你签名的交易。X Layer 上的 gas 远不到一美分。")}</p>}
            </div>
          </div>
        </div>
      </section>
      {/* phones: the summary is at the end of a long form, so its action rides above the dock until you reach it */}
      {!made?.wallet && !sideSeen && (
        <div className="wz-sticky">
          <div className="m"><b>{tr(`${Object.values(on).filter(Boolean).length} fuses · ${(Number(perDecision) / 1e6).toFixed(4)} USD₮0 each`, `${Object.values(on).filter(Boolean).length} 个保险丝 · 每笔 ${(Number(perDecision) / 1e6).toFixed(4)} USD₮0`)}</b>
            <span className={!q.running && problems.length ? "warn" : "mute"}>{q.running ? tr("Sign each step in your wallet…", "请在钱包中签署每一步…") : failed ? tr("A step failed: retry it below", "有一步失败了：请在下方重试") : problems[0] ?? tr("Ready to wire it up", "可以开始搭建了")}</span></div>
          <button className="btn lime" disabled={q.running} onClick={() => { side.current?.scrollIntoView({ behavior: "smooth", block: "start" }); if (failed) retry(); else if (!problems.length) launch(); }}>
            {failed ? tr("Retry", "重试") : problems.length ? tr("Review", "检查") : tr("Wire it up", "开始搭建")} <span className="k">→</span>
          </button>
        </div>
      )}
    </div>
  } />;
}
