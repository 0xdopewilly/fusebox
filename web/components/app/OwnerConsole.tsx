"use client";
import { useEffect, useRef, useState } from "react";
import { growOpen, shrinkClosed, usePresence } from "@/lib/motion";
import { encodeAbiParameters, encodeFunctionData, formatUnits, getAddress, isAddress, keccak256, parseUnits, type Address, type Hash } from "viem";
import { fuseboxWalletAbi, fuseRegistryAbi } from "@/lib/abi";
import { erc20Abi } from "@/lib/erc20";
import { DEP, pub } from "@/lib/client-chain";
import { useTxQueue, type TxStep } from "@/lib/useTxQueue";
import { useMarket } from "@/lib/useMarket";
import { SOCKETS, readField, toParams, describe, fieldsFor, type ParamField } from "@/lib/sockets";
import { OKLINK, short } from "@/lib/hooks";
import type { Atlas, FuseSlot } from "@/lib/atlas";
import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";
import { SAY_ZH } from "@/lib/fuseZh";
import { useWallet } from "./WalletProvider";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const USDT0 = DEP.usdt0 as Address;
const toAddr = (s: string) => getAddress(s.trim().toLowerCase());
const okAddr = (s: string) => isAddress(s.trim(), { strict: false });
const okMoney = (s: string) => /^\d+(\.\d{1,6})?$/.test(s.trim()) && Number(s) > 0;
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

type Tab = "safety" | "fuses" | "payees" | "people" | "money" | "owner";
type One = (label: string, run: () => Promise<Hash | null>) => void;
interface P { data: Atlas; busy: boolean; one: One; many: (list: TxStep<object>[]) => void; account: Address }
/** Fuses on the Daily Cap or Two of Three socket read how much is paid for every payee; without one, nothing limits amounts. */
const limitsAmounts = (f: { socket: number }) => f.socket === 1 || f.socket === 4;

/** 简体中文 for the socket settings in lib/sockets. A designer's own labels (rival fuses) stay as written. */
const FIELD_ZH: Record<string, string> = { "Cap per UTC day": "每个 UTC 日上限", "Cooling-off": "冷静期", "Trial amount": "试付额度", "Approvals above": "审批阈值", Window: "窗口期" };
const fl = (label: string, zh: boolean) => (zh ? FIELD_ZH[label] ?? label : label);
const fs = (suffix: string, zh: boolean) => (zh && suffix === "hours" ? "小时" : suffix);
/** lib/sockets `describe` in Chinese: one line describing an install's settings. */
function describeZh(socket: number, a: number, b: number, unit = "1", labels?: { a?: string; b?: string }): string {
  const amt = (n: number) => `${+(n * Number(unit)).toFixed(6)} USD₮0`;
  if (labels) return fieldsFor(socket, labels).map((f) => `${fl(f.label, true)} ${f.money ? amt(f.k === "a" ? a : b) : `${f.k === "a" ? a : b} ${fs(f.suffix, true)}`}`).join(" · ") || "无设置";
  if (socket === 1) return `每个 UTC 日 ${amt(a)}`;
  if (socket === 2) return `${a} 小时冷静期 · ${amt(b)} 试付`;
  if (socket === 3) return "遇陌生地址即触发";
  if (socket === 4) return `超过 ${amt(a)} 需审批`;
  if (socket === 5) return `同一笔付款每 ${a} 小时一次`;
  return "";
}

/** A button that asks again before it acts; it disarms itself after a few seconds. */
function Confirm({ label, sure, disabled, onConfirm, className = "btn" }: { label: string; sure: string; disabled?: boolean; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return <button className={`${className}${armed ? " armed" : ""}`} disabled={disabled} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>{armed ? sure : label}</button>;
}

function Row({ title, say, children }: { title: string; say: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="oc-row">
      <div><h3>{title}</h3><div className="oc-say">{say}</div></div>
      <div className="oc-act">{children}</div>
    </div>
  );
}

function Fields({ fields, vals, set, unit }: { fields: ParamField[]; vals: Record<string, string>; set: (k: string, v: string) => void; unit?: string }) {
  const { zh } = useLang();
  return (
    <div className={fields.length > 1 ? "two" : ""}>
      {fields.map((f) => {
        const suffix = f.money && unit && unit !== "1" ? `× ${unit} USD₮0` : f.suffix;
        const text = zh ? `${fl(f.label, zh)}（${fs(suffix, zh)}）` : `${f.label} (${suffix})`;
        return <label key={f.k} className="oc-f m"><span>{text}</span><input aria-label={text} value={vals[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} inputMode="numeric" /></label>;
      })}
    </div>
  );
}

/** Read every field; the first problem comes back as text for the owner. */
function parse(fields: ParamField[], vals: Record<string, string>, zh = false): { a?: number; b?: number } | string {
  const out: { a?: number; b?: number } = {};
  for (const f of fields) {
    const r = readField(f, vals[f.k] ?? "");
    if ("error" in r) return !zh ? r.error : /^\d+$/.test((vals[f.k] ?? "").trim()) ? `${fl(f.label, zh)}：最多 ${f.max} ${fs(f.suffix, zh)}` : `${fl(f.label, zh)}：请输入整数（${fs(f.suffix, zh)}）`;
    out[f.k] = r.n;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ repeats
const repeatKey = (token: Address, to: Address, amount: bigint) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [token, to, amount]));

/**
 * The Repeat Guard stops the same amount to the same payee inside its window. When a repeat is real (a second order,
 * a monthly bill paid early), the owner lets exactly one more through: the clearance is used up by that payment and
 * lapses after the approval window if it isn't used.
 */
function Repeats({ data, busy, one }: Pick<P, "data" | "busy" | "one">) {
  const { write } = useWallet();
  const { t } = useLang();
  const guard = data.fuses.find((f) => f.key === "repeat-guard");
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const [to, setTo] = useState(""); const [amt, setAmt] = useState("");
  // the payments still inside the window, newest first, one row per payee and amount
  const recent = guard ? [...new Map(data.decisions.filter((d) => d.allowed && data.time - d.time < guard.a * 3600).map((d) => [`${d.to.toLowerCase()}:${d.amount}`, d] as const).reverse()).values()].reverse() : [];
  const [cleared, setCleared] = useState<Record<string, number>>({});
  const keys = recent.map((d) => repeatKey(USDT0, d.to, parseUnits(d.amount, 6)));
  useEffect(() => {
    if (!guard || !keys.length) return;
    let on = true;
    Promise.all(keys.map((k) => pub.readContract({ ...W, functionName: "repeatClearedUntil", args: [k] }).then((v) => [k, Number(v)] as const).catch(() => [k, 0] as const)))
      .then((r) => { if (on) setCleared(Object.fromEntries(r)); });
    return () => { on = false; };
  }, [guard?.a, data.block, keys.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!guard) return null;
  const clear = (who: Address, amount: string, yes: boolean) => one(yes ? t("Let it pay once more", "再放行一次") : t("Withdraw the clearance", "撤回放行"), () => write({ ...W, functionName: "clearRepeat", args: [USDT0, who, parseUnits(amount, 6), yes] }));
  const ttl = Math.round((data.approvalTtl ?? 86400) / 3600);
  return (
    <>
      <Row title={t("Repeats", "重复付款")} say={t(<>The Repeat Guard stops the same amount to the same payee within {guard.a} h, so an invoice sent twice is paid once. If a repeat is real, let it pay once more: the next payment of exactly that amount to that payee goes through, then the guard is back. Unused, it lapses after {ttl} h.</>,
        <>Repeat Guard 会在 {guard.a} 小时内拦截付给同一收款方的同一金额，同一张发票发两次只付一次。如果确实需要重复付款，可以再放行一次：下一笔付给该收款方、金额完全相同的付款会通过，之后保护恢复。未使用的话，{ttl} 小时后失效。</>)}>
        <div className="two">
          <input aria-label={t("Payee to let pay once more", "要再放行一次的收款方")} value={to} onChange={(e) => setTo(e.target.value)} placeholder={t("Payee 0x…", "收款方 0x…")} spellCheck={false} />
          <input aria-label={t("Exact amount, USD₮0", "准确金额，USD₮0")} value={amt} onChange={(e) => setAmt(e.target.value)} placeholder={t("Exact amount, USD₮0", "准确金额，USD₮0")} inputMode="decimal" />
        </div>
        <button className="btn" disabled={busy || !okAddr(to) || !okMoney(amt)} onClick={() => clear(toAddr(to), amt.trim(), true)}>{t("Let it pay once more", "再放行一次")}</button>
      </Row>
      {recent.length > 0 && (
        <ul className="oc-list">
          {recent.map((d, i) => {
            const until = cleared[keys[i]] ?? 0, live = until > data.time;
            const left = Math.max(0, Math.ceil((d.time + guard.a * 3600 - data.time) / 3600));
            const hm = new Date(until * 1000).toISOString().slice(11, 16);
            return (
              <li key={`${d.to}-${d.amount}`}>
                <span className="grow"><span>{t(`${d.amount} USD₮0 to ${short(d.to)}`, `${d.amount} USD₮0 付给 ${short(d.to)}`)}</span><small><span className={live ? "lime" : "mute"}>{live ? t(`cleared once, until ${hm} UTC`, `已放行一次，有效至 ${hm} UTC`) : t(`a repeat is stopped for ${left} h more`, `重复付款还会被拦截 ${left} 小时`)}</span><span className="mute">{t(" · paid in ", " · 见")}<a className="mute" href={`${OKLINK}/tx/${d.tx}`} target="_blank" rel="noreferrer">{t(`decision #${d.id}`, `决策 #${d.id}`)}</a></span></small></span>
                {live ? <button className="btn btn-sm" disabled={busy} onClick={() => clear(d.to, d.amount, false)}>{t("Withdraw", "撤回")}</button>
                  : <Confirm label={t("Let it pay once more", "再放行一次")} sure={t("Sure? Tap again", "确定？再点一次")} className="btn btn-sm" disabled={busy} onConfirm={() => clear(d.to, d.amount, true)} />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ safety
function Safety({ data, busy, one }: P) {
  const { write } = useWallet();
  const { t } = useLang();
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const lim = data.limits;
  const [md, setMd] = useState(String(lim?.maxDecisions ?? 100));
  const [mb, setMb] = useState(String(lim?.maxBlocked ?? 20));
  const blown = data.fuses.some((f) => f.latched);
  const hasBreaker = data.fuses.some((f) => f.key === "breaker");
  const nd = Number(md), nb = Number(mb);
  const limErr = !/^\d+$/.test(md.trim()) || !/^\d+$/.test(mb.trim()) ? t("Whole numbers only", "只能填整数") : nd < 1 ? t("Allow at least one decision a day", "每天至少允许一次决策") : nd > 100000 ? t("At most 100,000 decisions a day", "每天最多 100,000 次决策") : nb > nd ? t("Blocked attempts can't exceed decisions", "拦截次数不能超过决策次数") : null;
  return (
    <>
      <Row title={t("The line", "线路")} say={data.paused ? t("Paused: nothing pays until you lift it.", "已暂停：解除之前不会付出任何款项。") : blown ? t("A Breaker is blown. Reset it once you've checked what tripped it.", "Breaker 已熔断。查明触发原因后再重置。") : t(<>Freeze stops every payment now. Your agent and approvers can freeze too; only you can undo it.{hasBreaker ? " Freezing blows the Breaker." : ""}</>, <>冻结会立即停止所有付款。你的智能体和审批人也能冻结，但只有你能解除。{hasBreaker ? "冻结会让 Breaker 熔断。" : ""}</>)}>
        {data.paused ? <button className="btn lime" disabled={busy} onClick={() => one(t("Unpause", "取消暂停"), () => write({ ...W, functionName: "setPaused", args: [false] }))}>{t("Unpause", "取消暂停")}</button>
          : blown ? <button className="btn lime" disabled={busy} onClick={() => one(t("Reset the Breaker", "重置 Breaker"), () => write({ ...W, functionName: "unfreeze" }))}>{t("Reset the Breaker", "重置 Breaker")}</button>
          : <button className="btn danger" disabled={busy} onClick={() => one(t("Freeze", "冻结"), () => write({ ...W, functionName: "freeze" }))}>{t("Freeze now", "立即冻结")}</button>}
      </Row>
      {!data.paused && (
        <Row title={t("Kill switch", "紧急开关")} say={t("Pausing refuses every payment before any fuse runs, so nothing is recorded or charged. Only you can lift it.", "暂停后，所有付款在任何保险丝运行前就被拒绝，不会记录，也不会收费。只有你能解除。")}>
          <Confirm label={t("Pause the wallet", "暂停钱包")} sure={t("Pause it? Tap again", "确定暂停？再点一次")} className="btn danger" disabled={busy} onConfirm={() => one(t("Pause", "暂停"), () => write({ ...W, functionName: "setPaused", args: [true] }))} />
        </Row>
      )}
      <Repeats data={data} busy={busy} one={one} />
      <Row title={t("Daily budgets", "每日次数上限")} say={t(<>Today: <b>{lim?.decisionsToday ?? 0}</b> of {lim?.maxDecisions ?? "?"} decisions, <b>{lim?.blockedToday ?? 0}</b> of {lim?.maxBlocked ?? "?"} blocked. Past either budget an attempt reverts, so a looping agent can&apos;t burn your fee balance. Days are UTC.</>,
        <>今天：决策 <b>{lim?.decisionsToday ?? 0}</b> / {lim?.maxDecisions ?? "?"} 次，拦截 <b>{lim?.blockedToday ?? 0}</b> / {lim?.maxBlocked ?? "?"} 次。超过任一上限，尝试会被回滚，陷入循环的智能体也烧不掉你的费用余额。按 UTC 计日。</>)}>
        <div className="two">
          <label className="oc-f m"><span>{t("Decisions a day", "每日决策数")}</span><input aria-label={t("Decisions a day", "每日决策数")} value={md} onChange={(e) => setMd(e.target.value)} inputMode="numeric" /></label>
          <label className="oc-f m"><span>{t("Blocked a day", "每日拦截数")}</span><input aria-label={t("Blocked attempts a day", "每日拦截次数")} value={mb} onChange={(e) => setMb(e.target.value)} inputMode="numeric" /></label>
        </div>
        {limErr && <span className="oc-err">{limErr}</span>}
        <button className="btn" disabled={busy || !!limErr || (nd === lim?.maxDecisions && nb === lim?.maxBlocked)} onClick={() => one(t("Save budgets", "保存上限"), () => write({ ...W, functionName: "setDailyLimits", args: [nd, nb] }))}>{t("Save budgets", "保存上限")}</button>
      </Row>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ fuses
function FuseRow({ f, i, data, busy, one }: P & { f: FuseSlot; i: number }) {
  const { write } = useWallet();
  const { t, zh } = useLang();
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const spec = SOCKETS[f.socket];
  const fields = fieldsFor(f.socket, f.paramLabels); // a rival circuit may use the socket's settings differently
  const [open, setOpen] = useState(false);
  const edit = useRef<HTMLDivElement>(null);
  const editShown = usePresence(open && !!spec, edit, (el) => growOpen(el, 0, { rows: el.querySelectorAll(":scope > :not(.pw-wire)") }), (el, done) => shrinkClosed(el, 0, done, { rows: el.querySelectorAll(":scope > :not(.pw-wire)") }));
  const [vals, setVals] = useState<Record<string, string>>({ a: String(f.a), b: String(f.b) });
  const raised = parseUnits(f.fee, 6) > parseUnits(f.maxFee, 6);
  const parsed = spec ? parse(fields, vals, zh) : t("Unknown socket", "未知插槽");
  const changed = typeof parsed !== "string" && (parsed.a !== f.a || (parsed.b ?? 0) !== f.b);
  const lastLimit = limitsAmounts(f) && !data.fuses.some((x, j) => j !== i && limitsAmounts(x));
  return (
    <li className="oc-fuse">
      <div className="of-top">
        <div className="grow"><b>{f.name}</b><span className="m mute">{t(`Slot ${i + 1} · circuit #${f.circuitId} · `, `槽位 ${i + 1} · 电路 #${f.circuitId} · `)}{zh ? describeZh(f.socket, f.a, f.b, f.unit, f.paramLabels) : describe(f.socket, f.a, f.b, f.unit, f.paramLabels)}</span></div>
        <div className="of-btns">
          {fields.length ? <button className="btn" disabled={busy} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? t("Close", "关闭") : t("Edit", "编辑")}</button> : null}
          <Confirm label={t("Remove", "移除")} sure={lastLimit ? t("Then nothing limits how much the agent sends. Remove it?", "移除后就没有保险丝限制智能体的付款金额了。确定移除？") : t("Remove it?", "确定移除？")} className="btn danger" disabled={busy} onConfirm={() => one(t(`Remove ${f.name}`, `移除 ${f.name}`), () => write({ ...W, functionName: "removeFuse", args: [BigInt(i)] }))} />
        </div>
      </div>
      <div className="m mute of-fee">{t(`Fee ${f.fee} USD₮0 a check · you accept up to ${f.maxFee}`, `每次检查费用 ${f.fee} USD₮0 · 你接受的上限 ${f.maxFee}`)}{f.latched ? <span className="red">{t(" · blown", " · 已熔断")}</span> : null}</div>
      {raised && (
        <div className="oc-warn">
          <span>{t(<>The designer raised this fuse&apos;s fee to {f.fee} USD₮0. You keep paying {f.maxFee} until you accept the new price.</>, <>设计者已把这个保险丝的费用调到 {f.fee} USD₮0。在你接受新价格之前，仍按 {f.maxFee} 支付。</>)}</span>
          <button className="btn" disabled={busy} onClick={() => one(t(`Accept ${f.name}'s new fee`, `接受 ${f.name} 的新费用`), () => write({ ...W, functionName: "setFuseMaxFee", args: [BigInt(i), parseUnits(f.fee, 6)] }))}>{t("Accept", "接受")} {f.fee}</button>
        </div>
      )}
      {editShown && spec && (
        <div className="of-edit" ref={edit}>
          <i className="pw-wire" aria-hidden="true" />
          <Fields fields={fields} vals={vals} set={(k, v) => setVals({ ...vals, [k]: v })} unit={f.unit} />
          {typeof parsed === "string" && <span className="oc-err">{parsed}</span>}
          {f.key === "daily-cap" && f.original !== false && <span className="m mute" style={{ fontSize: 11 }}>{t(<>Today&apos;s spend so far ({Number(f.spentToday).toFixed(2)} USD₮0) still counts against the new cap.</>, <>今天已花费的 {Number(f.spentToday).toFixed(2)} USD₮0 仍计入新的限额。</>)}</span>}
          <button className="btn lime" disabled={busy || typeof parsed === "string" || !changed} onClick={() => { if (typeof parsed === "string") return; one(t(`Save ${f.name}`, `保存 ${f.name}`), () => write({ ...W, functionName: "setFuseParams", args: [BigInt(i), toParams(f.socket, parsed, f.token, parseUnits(f.unit, 6))] })); setOpen(false); }}>{t("Save", "保存")} {f.name}</button>
        </div>
      )}
    </li>
  );
}

/** Install a listed fuse on a wallet: pick it, set its parameters, accept its fee. Also used by the market. */
export function InstallFuse({ wallet, version, installed, busy, one, preset, lock }: { wallet: Address; version?: "v1" | "v2"; installed: number[]; busy: boolean; one: One; preset?: number; lock?: boolean }) {
  const { write } = useWallet();
  const { t, zh } = useLang();
  const { data: market } = useMarket();
  // the market is v2's registry; a v1 wallet installs the same circuit under its v1 id, and can't take newer fuses
  const v1 = version === "v1";
  const all = (market?.fuses ?? []).filter((f) => f.listed);
  const listed = v1 ? all.filter((f) => f.v1FuseId !== undefined) : all;
  const idOn = (f: (typeof all)[number]) => (v1 ? f.v1FuseId! : f.fuseId);
  const [id, setId] = useState<number | null>(preset ?? null);
  const pick = listed.find((f) => f.fuseId === id) ?? null;
  const v2Only = v1 && id !== null && !pick && all.some((f) => f.fuseId === id);
  const spec = pick ? SOCKETS[pick.socket] : null;
  const fields = pick ? fieldsFor(pick.socket, pick.original ? undefined : pick.meta?.params) : [];
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => { setVals(Object.fromEntries(fields.map((f) => [f.k, String(f.def)]))); }, [pick?.fuseId]); // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = spec ? parse(fields, vals, zh) : t("Pick a fuse", "请选择保险丝");
  const full = installed.length >= 8;
  const dup = pick && installed.includes(idOn(pick));
  return (
    <div className="oc-install">
      <label className="oc-f m" hidden={lock}><span>{t("Fuse", "保险丝")}</span>
        <select aria-label={t("Fuse to install", "要安装的保险丝")} value={id ?? ""} onChange={(e) => setId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{market ? t("Choose a listed fuse…", "选择已上架的保险丝…") : t("Reading the market…", "正在读取市场…")}</option>
          {listed.map((f) => <option key={f.fuseId} value={f.fuseId}>{zh
            ? `${f.meta?.name ?? f.name} · 保险丝 ${idOn(f)} · 电路 #${f.circuitId} · 每次检查 ${f.fee} USD₮0${installed.includes(idOn(f)) ? " · 已安装" : ""}`
            : `${f.meta?.name ?? f.name} · fuse ${idOn(f)} · circuit #${f.circuitId} · ${f.fee} USD₮0 a check${installed.includes(idOn(f)) ? " · installed" : ""}`}</option>)}
        </select>
      </label>
      {pick && spec && (
        <>
          <span className="m mute" style={{ fontSize: 11, lineHeight: 1.5 }}>{pick.meta?.summary ?? (pick.original ? (zh ? SAY_ZH[spec.key] ?? spec.say : spec.say) : "")} {t(`${pick.gates} gates by ${short(pick.designer)}.`, `${pick.gates} 个门，设计者 ${short(pick.designer)}。`)}</span>
          {fields.length ? <Fields fields={fields} vals={vals} set={(k, v) => setVals({ ...vals, [k]: v })} /> : null}
        </>
      )}
      {v1 && <span className="m mute" style={{ fontSize: 11, lineHeight: 1.5 }}>{t(<>{v2Only ? "This fuse needs a v2 wallet. " : ""}This wallet was made by Fusebox v1, which can install the first four fuses. The Repeat Guard and newer fuses go on wallets made since Nov 20: <a className="lime" href="/app/new">make one</a>.</>,
        <>{v2Only ? "这个保险丝需要 v2 钱包。" : ""}这个钱包由 Fusebox v1 创建，只能安装前四个保险丝。Repeat Guard 和更新的保险丝需要 11 月 20 日之后创建的钱包：<a className="lime" href="/app/new">新建一个</a>。</>)}</span>}
      {typeof parsed === "string" && pick && <span className="oc-err">{parsed}</span>}
      {dup && <span className="oc-err" style={{ color: "var(--mute)" }}>{t("Already on this wallet. A second copy checks every payment twice and charges twice.", "这个钱包已经装了它。再装一份会把每笔付款检查两次、收费两次。")}</span>}
      {full && <span className="oc-err">{t("A wallet holds at most 8 fuses. Remove one first.", "一个钱包最多装 8 个保险丝。请先移除一个。")}</span>}
      <button className="btn lime" disabled={busy || !pick || !spec || typeof parsed === "string" || full}
        onClick={() => { if (!pick || !spec || typeof parsed === "string") return; one(t(`Install ${pick.meta?.name ?? pick.name}`, `安装 ${pick.meta?.name ?? pick.name}`), () => write({ address: wallet, abi: fuseboxWalletAbi, functionName: "addFuse", args: [BigInt(idOn(pick)), toParams(pick.socket, parsed, USDT0), parseUnits(pick.fee, 6)] })); }}>
        {pick ? t(`Install ${pick.meta?.name ?? pick.name} · ${pick.fee} USD₮0 a check`, `安装 ${pick.meta?.name ?? pick.name} · 每次检查 ${pick.fee} USD₮0`) : t("Install", "安装")}
      </button>
    </div>
  );
}

function Fuses(p: P) {
  const { data, busy, one } = p;
  const { t } = useLang();
  return (
    <>
      <Row title={t(`On the line · ${data.fuses.length} of 8`, `线路上 · ${data.fuses.length} / 8`)} say={t("Every payment runs through these in order, in one call. Removing a fuse keeps the others' order; editing keeps its install and resets nothing but the setting.", "每笔付款都在一次调用中按顺序经过这些保险丝。移除一个保险丝不会打乱其他保险丝的顺序；编辑会保留安装，只改动这项设置。")}>
        {data.fuses.length ? null : <span className="oc-err">{t("No fuses: the wallet refuses every payment until you install one.", "没有保险丝：在你安装之前，钱包会拒绝所有付款。")}</span>}
        {data.fuses.length && !data.fuses.some(limitsAmounts) ? <span className="oc-err">{t("Nothing on this line limits how much the agent can send to a saved payee. Install a Daily Cap or Two of Three.", "这条线路上没有保险丝限制智能体付给已保存收款方的金额。请安装 Daily Cap 或 Two of Three。")}</span> : null}
      </Row>
      <ul className="oc-fuses">{data.fuses.map((f, i) => <FuseRow key={`${f.fuseId}-${i}`} {...p} f={f} i={i} />)}</ul>
      <Row title={t("Install a fuse", "安装保险丝")} say={t("Any fuse listed in the registry, from any designer. Its fee is charged per check from your fee balance, and you only ever pay the fee you accept here.", "注册表中上架的任何保险丝都可以，不限设计者。费用按每次检查从你的费用余额中扣除，你只会支付在这里接受的费用。")}>
        <InstallFuse wallet={data.wallet} version={data.version} installed={data.fuses.map((f) => f.fuseId)} busy={busy} one={one} />
      </Row>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ payees
function Payees({ data, busy, one }: P) {
  const { write } = useWallet();
  const { t } = useLang();
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const [payee, setPayee] = useState("");
  const guard = data.fuses.find((f) => f.key === "payee-guard");
  const known = data.payees.some((p) => same(p.address, payee.trim()));
  return (
    <>
      <Row title={t("Save a payee", "保存收款方")} say={guard ? t(`Payee Guard lets a saved payee through in full after ${guard.a} h; until then it holds them to ${guard.b} USD₮0. Anyone else is a stranger.`, `已保存的收款方满 ${guard.a} 小时后，Payee Guard 才会全额放行；在此之前，每笔最多 ${guard.b} USD₮0。其他地址都算陌生地址。`) : t("Saved payees are trusted by Payee Guard and never trip the Breaker.", "已保存的收款方受 Payee Guard 信任，也不会触发 Breaker。")}>
        <input aria-label={t("Payee address to save", "要保存的收款方地址")} value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="0x…" spellCheck={false} />
        {known && <span className="oc-err" style={{ color: "var(--mute)" }}>{t("Already saved.", "已经保存过了。")}</span>}
        <button className="btn" disabled={busy || !okAddr(payee) || known} onClick={() => one(t("Save payee", "保存收款方"), () => write({ ...W, functionName: "addPayee", args: [toAddr(payee)] }))}>{t("Save payee", "保存收款方")}</button>
      </Row>
      <ul className="oc-list">
        {data.payees.length === 0 && <li className="mute">{t("No saved payees yet.", "还没有已保存的收款方。")}</li>}
        {data.payees.map((p) => {
          const age = (data.time - p.since) / 3600;
          const trusted = !!guard && age >= guard.a;
          const st = !guard ? t("saved", "已保存") : trusted ? t("trusted", "已信任") : t(`cooling-off · ${Math.ceil(guard.a - age)} h left`, `冷静期 · 剩 ${Math.ceil(guard.a - age)} 小时`);
          return (
            <li key={p.address}>
              <span className="grow"><span>{short(p.address)}</span><small><span className={trusted ? "lime" : ""}>{st}</span><span className="mute">{t(" · saved ", " · 保存于 ")}{new Date(p.since * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span></small></span>
              <Confirm label={t("Remove", "移除")} sure={t("Remove?", "确定移除？")} className="btn danger btn-sm" disabled={busy} onConfirm={() => one(t("Remove payee", "移除收款方"), () => write({ ...W, functionName: "removePayee", args: [p.address] }))} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ people
function People({ data, busy, one }: P) {
  const { write } = useWallet();
  const { t } = useLang();
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const agents = data.agents ?? (data.agent !== ZERO ? [data.agent] : []);
  const [agent, setAgent] = useState("");
  const [seats, setSeats] = useState<string[]>(data.approvers.map((a) => (a === ZERO ? "" : a)));
  const [ttl, setTtl] = useState(String(Math.round((data.approvalTtl ?? 86400) / 3600)));
  const approverSet = data.approvers.filter((a) => a !== ZERO);
  const agentErr = !agent.trim() ? null : !okAddr(agent) ? t("Not an address", "不是有效地址") : agents.some((a) => same(a, agent.trim())) ? t("Already an agent", "已经是智能体") : approverSet.some((a) => same(a, agent.trim())) ? t("An approver can't also be an agent", "审批人不能同时是智能体") : null;
  const filled = seats.map((s) => s.trim()).filter(Boolean);
  const seatErr = filled.some((s) => !okAddr(s)) ? t("Every seat must be an address or empty", "每个席位必须填地址或留空") : new Set(filled.map((s) => s.toLowerCase())).size !== filled.length ? t("Each approver once", "每位审批人只能出现一次") : filled.some((s) => agents.some((a) => same(a, s))) ? t("An agent can't approve its own payments", "智能体不能审批自己的付款") : null;
  const seatsChanged = seats.some((s, i) => !same(s.trim() || ZERO, data.approvers[i]));
  const ttlN = Number(ttl);
  const ttlErr = !/^\d+$/.test(ttl.trim()) || ttlN < 1 || ttlN > 720 ? t("1 to 720 hours", "1 到 720 小时") : null;
  return (
    <>
      <Row title={t("Agents", "智能体")} say={t("Agent keys can call pay and freeze, nothing else. Add one per AI agent or service; remove a key the moment it's retired or leaked.", "智能体密钥只能调用付款和冻结，别的都做不了。每个 AI 智能体或服务各加一个；密钥一旦停用或泄露，立即移除。")}>
        <input aria-label={t("Agent address to add", "要添加的智能体地址")} value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x…" spellCheck={false} />
        {agentErr && <span className="oc-err">{agentErr}</span>}
        <button className="btn" disabled={busy || !agent.trim() || !!agentErr} onClick={() => one(t("Add agent", "添加智能体"), () => write({ ...W, functionName: "setAgent", args: [toAddr(agent), true] }))}>{t("Add agent", "添加智能体")}</button>
      </Row>
      <ul className="oc-list">
        {agents.length === 0 && <li className="mute">{t("No agents: nobody can pay from this wallet.", "没有智能体：没人能从这个钱包付款。")}</li>}
        {agents.map((a) => (
          <li key={a}><span className="grow">{short(a)}<small className="mute">{t("agent key", "智能体密钥")}</small></span>
            <Confirm label={t("Remove", "移除")} sure={t("Remove?", "确定移除？")} className="btn danger btn-sm" disabled={busy} onConfirm={() => one(t("Remove agent", "移除智能体"), () => write({ ...W, functionName: "setAgent", args: [a, false] }))} /></li>
        ))}
      </ul>
      <Row title={t("Approvers", "审批人")} say={t("Two of these three sign any payment over Two of Three's threshold. Changing a seat cancels every open approval.", "超过 Two of Three 阈值的付款，需要这三位中的两位签名。更换席位会取消所有未完成的审批。")}>
        {seats.map((s, i) => <input key={i} aria-label={t(`Approver seat ${i + 1}`, `审批人席位 ${i + 1}`)} value={s} onChange={(e) => setSeats(seats.map((x, k) => (k === i ? e.target.value : x)))} placeholder={t(`Seat ${i + 1} · 0x… or empty`, `席位 ${i + 1} · 0x… 或留空`)} spellCheck={false} />)}
        {seatErr && <span className="oc-err">{seatErr}</span>}
        <button className="btn" disabled={busy || !!seatErr || !seatsChanged} onClick={() => one(t("Save approvers", "保存审批人"), () => write({ ...W, functionName: "setApprovers", args: [seats.map((s) => (s.trim() ? toAddr(s) : ZERO)) as [Address, Address, Address]] }))}>{t("Save approvers", "保存审批人")}</button>
      </Row>
      <Row title={t("Approval window", "审批有效期")} say={t("How long an approval stays good after the first signature. Shorter is safer; it has to cover the time your approvers need.", "第一个签名之后，审批保持有效的时长。越短越安全，但要留够审批人需要的时间。")}>
        <label className="oc-f m"><span>{t("Hours", "小时")}</span><input aria-label={t("Approval window in hours", "审批有效期（小时）")} value={ttl} onChange={(e) => setTtl(e.target.value)} inputMode="numeric" /></label>
        {ttlErr && <span className="oc-err">{ttlErr}</span>}
        <button className="btn" disabled={busy || !!ttlErr || ttlN * 3600 === data.approvalTtl} onClick={() => one(t("Save approval window", "保存审批有效期"), () => write({ ...W, functionName: "setApprovalTtl", args: [ttlN * 3600] }))}>{t("Save window", "保存有效期")}</button>
      </Row>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ money
function Money({ data, busy, one, many, account }: P) {
  const { write } = useWallet();
  const { t: tr } = useLang();
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const [mine, setMine] = useState<bigint | null>(null);
  useEffect(() => { let on = true; pub.readContract({ address: USDT0, abi: erc20Abi, functionName: "balanceOf", args: [account] }).then((v) => on && setMine(v)).catch(() => {}); return () => { on = false; }; }, [account, data.block]);
  const [add, setAdd] = useState(""); const [out, setOut] = useState(""); const [top, setTop] = useState(""); const [back, setBack] = useState("");
  const perDecision = data.fuses.reduce((t, f) => t + Number(f.maxFee), 0);
  const covers = perDecision ? Math.floor(Number(data.feeBalance) / perDecision) : 0;
  const u = (s: string) => parseUnits(s.trim(), 6);
  const over = (s: string, have: bigint | null) => okMoney(s) && have !== null && u(s) > have;
  const bal = parseUnits(data.balance, 6), fees = parseUnits(data.feeBalance, 6);
  return (
    <>
      <Row title={tr(`Wallet · ${Number(data.balance).toFixed(4)} USD₮0`, `钱包 · ${Number(data.balance).toFixed(4)} USD₮0`)} say={tr(<>What the agent pays from. Add USD₮0 from your own wallet{mine !== null ? <> (you hold {Number(formatUnits(mine, 6)).toFixed(4)})</> : null}, or take it back: only you can move it out, the agent only through pay.</>,
        <>智能体从这里付款。可以从你自己的钱包充值 USD₮0{mine !== null ? <>（你持有 {Number(formatUnits(mine, 6)).toFixed(4)}）</> : null}，也可以取回：只有你能把钱转出，智能体只能通过付款动用它。</>)}>
        <div className="two">
          <input aria-label={tr("USD₮0 to add to the wallet", "要充值到钱包的 USD₮0")} value={add} onChange={(e) => setAdd(e.target.value)} placeholder={tr("Add, USD₮0", "充值，USD₮0")} inputMode="decimal" />
          <button className="btn" disabled={busy || !okMoney(add) || over(add, mine)} onClick={() => one(tr("Add to the wallet", "充值到钱包"), () => write({ address: USDT0, abi: erc20Abi, functionName: "transfer", args: [data.wallet, u(add)] }))}>{tr("Add", "充值")}</button>
          <input aria-label={tr("USD₮0 to withdraw from the wallet", "要从钱包提取的 USD₮0")} value={out} onChange={(e) => setOut(e.target.value)} placeholder={tr("Withdraw, USD₮0", "提取，USD₮0")} inputMode="decimal" />
          <button className="btn" disabled={busy || !okMoney(out) || over(out, bal)} onClick={() => one(tr("Withdraw from the wallet", "从钱包提取"), () => write({ ...W, functionName: "execute", args: [USDT0, 0n, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [account, u(out)] })] }))}>{tr("Withdraw", "提取")}</button>
        </div>
        {(over(add, mine) || over(out, bal)) && <span className="oc-err">{tr("More than there is.", "超出了现有余额。")}</span>}
      </Row>
      <Row title={tr(`Fee balance · ${Number(data.feeBalance).toFixed(4)} USD₮0`, `费用余额 · ${Number(data.feeBalance).toFixed(4)} USD₮0`)} say={tr(<>Prepaid fees, held by the registry for this wallet. At {perDecision.toFixed(4)} USD₮0 a decision it covers about <b>{covers}</b> more. Top it up from your wallet or take back what you don&apos;t need.</>,
        <>预付的费用，由注册表为这个钱包保管。按每次决策 {perDecision.toFixed(4)} USD₮0 计算，大约还够 <b>{covers}</b> 次。可以从你的钱包充值，也可以取回用不上的部分。</>)}>
        <div className="two">
          <input aria-label={tr("USD₮0 to prepay as fees", "要预付为费用的 USD₮0")} value={top} onChange={(e) => setTop(e.target.value)} placeholder={tr("Top up, USD₮0", "充值，USD₮0")} inputMode="decimal" />
          <button className="btn" disabled={busy || !okMoney(top) || over(top, mine)} onClick={() => many([
            { id: "approve", label: tr("Allow the registry to take the top-up", "允许注册表扣取这笔充值"), run: async () => {
              const have = await pub.readContract({ address: USDT0, abi: erc20Abi, functionName: "allowance", args: [account, data.registry] });
              return have >= u(top) ? null : write({ address: USDT0, abi: erc20Abi, functionName: "approve", args: [data.registry, u(top)] });
            } },
            // fees are held by the registry the wallet was made with (v1 for Atlas and the first wallets, v2 since)
            { id: "deposit", label: tr("Top up fees", "充值费用"), run: () => write({ address: data.registry, abi: fuseRegistryAbi, functionName: "deposit", args: [data.wallet, u(top)] }) },
          ])}>{tr("Top up", "充值")}</button>
          <input aria-label={tr("USD₮0 to withdraw", "要提取的 USD₮0")} value={back} onChange={(e) => setBack(e.target.value)} placeholder="USD₮0" inputMode="decimal" />
          <button className="btn" disabled={busy || !okMoney(back) || over(back, fees)} onClick={() => one(tr("Withdraw fees", "提取费用"), () => write({ ...W, functionName: "withdrawFeeBalance", args: [u(back), account] }))}>{tr("Withdraw", "提取")}</button>
        </div>
        {(over(top, mine) || over(back, fees)) && <span className="oc-err">{tr("More than there is.", "超出了现有余额。")}</span>}
      </Row>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ ownership
function Ownership({ data, busy, one, account }: P) {
  const { write } = useWallet();
  const { t } = useLang();
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const [to, setTo] = useState("");
  const pending = data.pendingOwner && data.pendingOwner !== ZERO ? data.pendingOwner : null;
  const err = !to.trim() ? null : !okAddr(to) ? t("Not an address", "不是有效地址") : same(to.trim(), account) ? t("That's you", "这是你自己") : same(to.trim(), data.wallet) ? t("A wallet can't own itself", "钱包不能拥有自己") : null;
  return (
    <>
      {pending && (
        <Row title={t("Handover in progress", "移交进行中")} say={t(<>{short(pending)} can accept ownership from their own wallet. Until they do, you stay the owner and can cancel.</>, <>{short(pending)} 可以用自己的钱包接受所有权。在对方接受之前，你仍是所有者，并且可以取消。</>)}>
          <button className="btn" disabled={busy} onClick={() => one(t("Cancel handover", "取消移交"), () => write({ ...W, functionName: "transferOwnership", args: [ZERO] }))}>{t("Cancel handover", "取消移交")}</button>
        </Row>
      )}
      <Row title={t("Hand the wallet over", "移交钱包")} say={t("Two steps, so a typo can't lose the wallet: you name the new owner, then they accept from that address. They get every control on this page; you keep none.", "分两步进行，输错地址也不会丢失钱包：你先指定新所有者，对方再用那个地址接受。对方将获得本页的全部控制权，你不再保留任何权限。")}>
        <input aria-label={t("New owner address", "新所有者地址")} value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" spellCheck={false} />
        {err && <span className="oc-err">{err}</span>}
        <Confirm label={t("Start the handover", "开始移交")} sure={t(`Hand it to ${okAddr(to) ? short(to.trim()) : "them"}?`, `移交给 ${okAddr(to) ? short(to.trim()) : "对方"}？`)} disabled={busy || !to.trim() || !!err} onConfirm={() => one(t("Start handover", "开始移交"), () => write({ ...W, functionName: "transferOwnership", args: [toAddr(to)] }))} />
      </Row>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ console
const TABS: { k: Tab; label: string; zh: string }[] = [
  { k: "safety", label: "Safety", zh: "安全" }, { k: "fuses", label: "Fuses", zh: "保险丝" }, { k: "payees", label: "Payees", zh: "收款方" },
  { k: "people", label: "People", zh: "成员" }, { k: "money", label: "Money", zh: "资金" }, { k: "owner", label: "Ownership", zh: "所有权" },
];
const BADGE_ZH: Record<string, string> = { paused: "已暂停", blown: "已熔断", pending: "待接受" };

/** Every owner control the wallet contract has, shown only to its owner (and an accept card to an incoming owner). */
export default function OwnerConsole({ data }: { data: Atlas }) {
  const { account, write } = useWallet();
  const { t: tr, zh } = useLang();
  const q = useTxQueue<object>();
  const [tab, setTab] = useState<Tab>("safety");
  const isOwner = same(account ?? "", data.owner);
  const isPending = !isOwner && !!data.pendingOwner && data.pendingOwner !== ZERO && same(account ?? "", data.pendingOwner);
  if (!account || (!isOwner && !isPending)) return null;

  const one: One = (label, run) => { q.start([{ id: label, label, run }], {}); };
  const many = (list: TxStep<object>[]) => { q.start(list, {}); };
  const cur = q.steps.find((s) => s.state === "sign" || s.state === "mine" || s.state === "error") ?? q.steps[q.steps.length - 1];
  const status = !cur ? "" : zh
    ? `${cur.label}：${cur.state === "done" ? "完成" : cur.state === "error" ? errZh(cur.error ?? "") : cur.state === "skip" ? "无需操作" : cur.state === "mine" ? "正在 X Layer 上确认…" : "请在钱包中签名…"}`
    : `${cur.label}: ${cur.state === "done" ? "done" : cur.state === "error" ? cur.error : cur.state === "skip" ? "not needed" : cur.state === "mine" ? "confirming on X Layer…" : "sign in your wallet…"}`;
  const props: P = { data, busy: q.running, one, many, account };
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;

  if (isPending) return (
    <section className="owner" data-b aria-label={tr("Ownership offer", "所有权移交")}>
      <h2 className="sr">{tr("Ownership offer", "所有权移交")}</h2>
      <div className="oh m"><span className="lime">{tr("Ownership offered to you", "有人要把所有权交给你")}</span><span className="mute" role="status">{status}</span></div>
      <Row title={tr("Accept this wallet", "接受这个钱包")} say={tr(<>{short(data.owner)} started handing this wallet to you. Accept to become its owner: its fuses, payees, agents and funds answer to you from then on.</>, <>{short(data.owner)} 已开始把这个钱包移交给你。接受后你就是所有者：此后它的保险丝、收款方、智能体和资金都由你掌控。</>)}>
        <button className="btn lime" disabled={q.running} onClick={() => one(tr("Accept ownership", "接受所有权"), () => write({ ...W, functionName: "acceptOwnership" }))}>{tr("Accept ownership", "接受所有权")}</button>
      </Row>
    </section>
  );

  const badge: Partial<Record<Tab, string>> = {
    safety: data.paused ? "paused" : data.fuses.some((f) => f.latched) ? "blown" : "",
    fuses: `${data.fuses.length}`, payees: `${data.payees.length}`,
    people: `${(data.agents?.length ?? 1) + data.approvers.filter((a) => a !== ZERO).length}`,
    owner: data.pendingOwner && data.pendingOwner !== ZERO ? "pending" : "",
  };
  return (
    <section className="owner" data-b aria-label={tr("Owner console", "所有者控制台")}>
      <h2 className="sr">{tr("Owner console", "所有者控制台")}</h2>
      <div className="oh m"><span className="lime">{tr("You own this wallet", "你是这个钱包的所有者")}</span><span className="mute" role="status">{status}</span></div>
      <div className="oc">
        <div className="oc-tabs m" role="tablist" aria-label={tr("Owner console", "所有者控制台")} onKeyDown={(e) => {
          // arrow keys move between tabs, as a tab list should
          const i = TABS.findIndex((t) => t.k === tab), d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
          if (!d) return; e.preventDefault();
          const next = TABS[(i + d + TABS.length) % TABS.length].k; setTab(next);
          const el = document.getElementById(`oc-${next}`); el?.focus(); el?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }}>
          {TABS.map((t) => (
            <button key={t.k} role="tab" id={`oc-${t.k}`} aria-selected={tab === t.k} aria-controls="oc-panel" tabIndex={tab === t.k ? 0 : -1} className={tab === t.k ? "on" : ""} onClick={(e) => { setTab(t.k); e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }}>
              {zh ? t.zh : t.label}{badge[t.k] ? <i className={badge[t.k] === "blown" || badge[t.k] === "paused" ? "red" : ""}>{zh ? BADGE_ZH[badge[t.k]!] ?? badge[t.k] : badge[t.k]}</i> : null}
            </button>
          ))}
        </div>
        <div className="oc-panel" role="tabpanel" id="oc-panel" aria-labelledby={`oc-${tab}`}>
          {tab === "safety" && <Safety {...props} />}
          {tab === "fuses" && <Fuses {...props} />}
          {tab === "payees" && <Payees {...props} />}
          {tab === "people" && <People {...props} />}
          {tab === "money" && <Money {...props} />}
          {tab === "owner" && <Ownership {...props} />}
        </div>
      </div>
    </section>
  );
}
