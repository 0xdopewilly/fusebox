"use client";
import { useEffect, useState } from "react";
import { encodeFunctionData, formatUnits, getAddress, isAddress, parseUnits, type Address, type Hash } from "viem";
import { fuseboxWalletAbi, fuseRegistryAbi } from "@/lib/abi";
import { erc20Abi } from "@/lib/erc20";
import { DEP, pub } from "@/lib/client-chain";
import { useTxQueue, type TxStep } from "@/lib/useTxQueue";
import { useMarket } from "@/lib/useMarket";
import { SOCKETS, readField, toParams, describe, fieldsFor, type ParamField } from "@/lib/sockets";
import { short } from "@/lib/hooks";
import type { Atlas, FuseSlot } from "@/lib/atlas";
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
  return (
    <div className={fields.length > 1 ? "two" : ""}>
      {fields.map((f) => {
        const suffix = f.money && unit && unit !== "1" ? `× ${unit} USDT0` : f.suffix;
        return <label key={f.k} className="oc-f m"><span>{f.label} ({suffix})</span><input aria-label={`${f.label} (${suffix})`} value={vals[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} inputMode="numeric" /></label>;
      })}
    </div>
  );
}

/** Read every field; the first problem comes back as text for the owner. */
function parse(fields: ParamField[], vals: Record<string, string>): { a?: number; b?: number } | string {
  const out: { a?: number; b?: number } = {};
  for (const f of fields) { const r = readField(f, vals[f.k] ?? ""); if ("error" in r) return r.error; out[f.k] = r.n; }
  return out;
}

// ------------------------------------------------------------------------------------------------ safety
function Safety({ data, busy, one }: P) {
  const { write } = useWallet();
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const lim = data.limits;
  const [md, setMd] = useState(String(lim?.maxDecisions ?? 100));
  const [mb, setMb] = useState(String(lim?.maxBlocked ?? 20));
  const blown = data.fuses.some((f) => f.latched);
  const hasBreaker = data.fuses.some((f) => f.key === "breaker");
  const nd = Number(md), nb = Number(mb);
  const limErr = !/^\d+$/.test(md.trim()) || !/^\d+$/.test(mb.trim()) ? "Whole numbers only" : nd < 1 ? "Allow at least one decision a day" : nd > 100000 ? "At most 100,000 decisions a day" : nb > nd ? "Blocked attempts can't exceed decisions" : null;
  return (
    <>
      <Row title="The line" say={data.paused ? "Paused: nothing pays until you lift it." : blown ? "A Breaker is blown. Reset it once you've checked what tripped it." : <>Freeze stops every payment now. Your agent and approvers can freeze too; only you can undo it.{hasBreaker ? " Freezing blows the Breaker." : ""}</>}>
        {data.paused ? <button className="btn lime" disabled={busy} onClick={() => one("Unpause", () => write({ ...W, functionName: "setPaused", args: [false] }))}>Unpause</button>
          : blown ? <button className="btn lime" disabled={busy} onClick={() => one("Reset the Breaker", () => write({ ...W, functionName: "unfreeze" }))}>Reset the Breaker</button>
          : <button className="btn danger" disabled={busy} onClick={() => one("Freeze", () => write({ ...W, functionName: "freeze" }))}>Freeze now</button>}
      </Row>
      {!data.paused && (
        <Row title="Kill switch" say="Pausing refuses every payment before any fuse runs, so nothing is recorded or charged. Only you can lift it.">
          <Confirm label="Pause the wallet" sure="Pause it? Tap again" className="btn danger" disabled={busy} onConfirm={() => one("Pause", () => write({ ...W, functionName: "setPaused", args: [true] }))} />
        </Row>
      )}
      <Row title="Daily budgets" say={<>Today: <b>{lim?.decisionsToday ?? 0}</b> of {lim?.maxDecisions ?? "?"} decisions, <b>{lim?.blockedToday ?? 0}</b> of {lim?.maxBlocked ?? "?"} blocked. Past either budget an attempt reverts, so a looping agent can&apos;t burn your fee balance. Days are UTC.</>}>
        <div className="two">
          <label className="oc-f m"><span>Decisions a day</span><input aria-label="Decisions a day" value={md} onChange={(e) => setMd(e.target.value)} inputMode="numeric" /></label>
          <label className="oc-f m"><span>Blocked a day</span><input aria-label="Blocked attempts a day" value={mb} onChange={(e) => setMb(e.target.value)} inputMode="numeric" /></label>
        </div>
        {limErr && <span className="oc-err">{limErr}</span>}
        <button className="btn" disabled={busy || !!limErr || (nd === lim?.maxDecisions && nb === lim?.maxBlocked)} onClick={() => one("Save budgets", () => write({ ...W, functionName: "setDailyLimits", args: [nd, nb] }))}>Save budgets</button>
      </Row>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ fuses
function FuseRow({ f, i, data, busy, one }: P & { f: FuseSlot; i: number }) {
  const { write } = useWallet();
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const spec = SOCKETS[f.socket];
  const fields = fieldsFor(f.socket, f.paramLabels); // a rival circuit may use the socket's settings differently
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({ a: String(f.a), b: String(f.b) });
  const raised = parseUnits(f.fee, 6) > parseUnits(f.maxFee, 6);
  const parsed = spec ? parse(fields, vals) : "Unknown socket";
  const changed = typeof parsed !== "string" && (parsed.a !== f.a || (parsed.b ?? 0) !== f.b);
  return (
    <li className="oc-fuse">
      <div className="of-top">
        <div className="grow"><b>{f.name}</b><span className="m mute">Slot {i + 1} · circuit #{f.circuitId} · {describe(f.socket, f.a, f.b, f.unit, f.paramLabels)}</span></div>
        <div className="of-btns">
          {fields.length ? <button className="btn" disabled={busy} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close" : "Edit"}</button> : null}
          <Confirm label="Remove" sure="Remove it?" className="btn danger" disabled={busy} onConfirm={() => one(`Remove ${f.name}`, () => write({ ...W, functionName: "removeFuse", args: [BigInt(i)] }))} />
        </div>
      </div>
      <div className="m mute of-fee">Fee {f.fee} USDT0 a check · you accept up to {f.maxFee}{f.latched ? <span className="red"> · blown</span> : null}</div>
      {raised && (
        <div className="oc-warn">
          <span>The designer raised this fuse&apos;s fee to {f.fee} USDT0. You keep paying {f.maxFee} until you accept the new price.</span>
          <button className="btn" disabled={busy} onClick={() => one(`Accept ${f.name}'s new fee`, () => write({ ...W, functionName: "setFuseMaxFee", args: [BigInt(i), parseUnits(f.fee, 6)] }))}>Accept {f.fee}</button>
        </div>
      )}
      {open && spec && (
        <div className="of-edit">
          <Fields fields={fields} vals={vals} set={(k, v) => setVals({ ...vals, [k]: v })} unit={f.unit} />
          {typeof parsed === "string" && <span className="oc-err">{parsed}</span>}
          {f.key === "daily-cap" && f.original !== false && <span className="m mute" style={{ fontSize: 11 }}>Today&apos;s spend so far ({Number(f.spentToday).toFixed(2)} USDT0) still counts against the new cap.</span>}
          <button className="btn lime" disabled={busy || typeof parsed === "string" || !changed} onClick={() => { if (typeof parsed === "string") return; one(`Save ${f.name}`, () => write({ ...W, functionName: "setFuseParams", args: [BigInt(i), toParams(f.socket, parsed, f.token, parseUnits(f.unit, 6))] })); setOpen(false); }}>Save {f.name}</button>
        </div>
      )}
    </li>
  );
}

/** Install a listed fuse on a wallet: pick it, set its parameters, accept its fee. Also used by the market. */
export function InstallFuse({ wallet, installed, busy, one, preset, lock }: { wallet: Address; installed: number[]; busy: boolean; one: One; preset?: number; lock?: boolean }) {
  const { write } = useWallet();
  const { data: market } = useMarket();
  const listed = (market?.fuses ?? []).filter((f) => f.listed);
  const [id, setId] = useState<number | null>(preset ?? null);
  const pick = listed.find((f) => f.fuseId === id) ?? null;
  const spec = pick ? SOCKETS[pick.socket] : null;
  const fields = pick ? fieldsFor(pick.socket, pick.original ? undefined : pick.meta?.params) : [];
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => { setVals(Object.fromEntries(fields.map((f) => [f.k, String(f.def)]))); }, [pick?.fuseId]); // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = spec ? parse(fields, vals) : "Pick a fuse";
  const full = installed.length >= 8;
  const dup = pick && installed.includes(pick.fuseId);
  return (
    <div className="oc-install">
      <label className="oc-f m" hidden={lock}><span>Fuse</span>
        <select aria-label="Fuse to install" value={id ?? ""} onChange={(e) => setId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{market ? "Choose a listed fuse…" : "Reading the market…"}</option>
          {listed.map((f) => <option key={f.fuseId} value={f.fuseId}>{f.meta?.name ?? f.name} · fuse {f.fuseId} · circuit #{f.circuitId} · {f.fee} USDT0 a check{installed.includes(f.fuseId) ? " · installed" : ""}</option>)}
        </select>
      </label>
      {pick && spec && (
        <>
          <span className="m mute" style={{ fontSize: 11, lineHeight: 1.5 }}>{pick.meta?.summary ?? (pick.original ? spec.say : "")} {pick.gates} gates by {short(pick.designer)}.</span>
          {fields.length ? <Fields fields={fields} vals={vals} set={(k, v) => setVals({ ...vals, [k]: v })} /> : null}
        </>
      )}
      {typeof parsed === "string" && pick && <span className="oc-err">{parsed}</span>}
      {dup && <span className="oc-err" style={{ color: "var(--mute)" }}>Already on this wallet. A second copy checks every payment twice and charges twice.</span>}
      {full && <span className="oc-err">A wallet holds at most 8 fuses. Remove one first.</span>}
      <button className="btn lime" disabled={busy || !pick || !spec || typeof parsed === "string" || full}
        onClick={() => { if (!pick || !spec || typeof parsed === "string") return; one(`Install ${pick.meta?.name ?? pick.name}`, () => write({ address: wallet, abi: fuseboxWalletAbi, functionName: "addFuse", args: [BigInt(pick.fuseId), toParams(pick.socket, parsed, USDT0), parseUnits(pick.fee, 6)] })); }}>
        {pick ? `Install ${pick.meta?.name ?? pick.name} · ${pick.fee} USDT0 a check` : "Install"}
      </button>
    </div>
  );
}

function Fuses(p: P) {
  const { data, busy, one } = p;
  return (
    <>
      <Row title={`On the line · ${data.fuses.length} of 8`} say="Every payment runs through these in order, in one call. Removing a fuse keeps the others' order; editing keeps its install and resets nothing but the setting.">
        {data.fuses.length ? null : <span className="oc-err">No fuses: the wallet refuses every payment until you install one.</span>}
      </Row>
      <ul className="oc-fuses">{data.fuses.map((f, i) => <FuseRow key={`${f.fuseId}-${i}`} {...p} f={f} i={i} />)}</ul>
      <Row title="Install a fuse" say="Any fuse listed in the registry, from any designer. Its fee is charged per check from your fee balance, and you only ever pay the fee you accept here.">
        <InstallFuse wallet={data.wallet} installed={data.fuses.map((f) => f.fuseId)} busy={busy} one={one} />
      </Row>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ payees
function Payees({ data, busy, one }: P) {
  const { write } = useWallet();
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const [payee, setPayee] = useState("");
  const guard = data.fuses.find((f) => f.key === "payee-guard");
  const known = data.payees.some((p) => same(p.address, payee.trim()));
  return (
    <>
      <Row title="Save a payee" say={guard ? `Payee Guard lets a saved payee through in full after ${guard.a} h; until then it holds them to ${guard.b} USDT0. Anyone else is a stranger.` : "Saved payees are trusted by Payee Guard and never trip the Breaker."}>
        <input aria-label="Payee address to save" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="0x…" spellCheck={false} />
        {known && <span className="oc-err" style={{ color: "var(--mute)" }}>Already saved.</span>}
        <button className="btn" disabled={busy || !okAddr(payee) || known} onClick={() => one("Save payee", () => write({ ...W, functionName: "addPayee", args: [toAddr(payee)] }))}>Save payee</button>
      </Row>
      <ul className="oc-list">
        {data.payees.length === 0 && <li className="mute">No saved payees yet.</li>}
        {data.payees.map((p) => {
          const age = (data.time - p.since) / 3600;
          const st = !guard ? "saved" : age >= guard.a ? "trusted" : `cooling-off · ${Math.ceil(guard.a - age)} h left`;
          return (
            <li key={p.address}>
              <span className="grow"><span>{short(p.address)}</span><small><span className={st === "trusted" ? "lime" : ""}>{st}</span><span className="mute"> · saved {new Date(p.since * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span></small></span>
              <Confirm label="Remove" sure="Remove?" className="btn danger btn-sm" disabled={busy} onConfirm={() => one("Remove payee", () => write({ ...W, functionName: "removePayee", args: [p.address] }))} />
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
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const agents = data.agents ?? (data.agent !== ZERO ? [data.agent] : []);
  const [agent, setAgent] = useState("");
  const [seats, setSeats] = useState<string[]>(data.approvers.map((a) => (a === ZERO ? "" : a)));
  const [ttl, setTtl] = useState(String(Math.round((data.approvalTtl ?? 86400) / 3600)));
  const approverSet = data.approvers.filter((a) => a !== ZERO);
  const agentErr = !agent.trim() ? null : !okAddr(agent) ? "Not an address" : agents.some((a) => same(a, agent.trim())) ? "Already an agent" : approverSet.some((a) => same(a, agent.trim())) ? "An approver can't also be an agent" : null;
  const filled = seats.map((s) => s.trim()).filter(Boolean);
  const seatErr = filled.some((s) => !okAddr(s)) ? "Every seat must be an address or empty" : new Set(filled.map((s) => s.toLowerCase())).size !== filled.length ? "Each approver once" : filled.some((s) => agents.some((a) => same(a, s))) ? "An agent can't approve its own payments" : null;
  const seatsChanged = seats.some((s, i) => !same(s.trim() || ZERO, data.approvers[i]));
  const ttlN = Number(ttl);
  const ttlErr = !/^\d+$/.test(ttl.trim()) || ttlN < 1 || ttlN > 720 ? "1 to 720 hours" : null;
  return (
    <>
      <Row title="Agents" say="Agent keys can call pay and freeze, nothing else. Add one per AI agent or service; remove a key the moment it's retired or leaked.">
        <input aria-label="Agent address to add" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x…" spellCheck={false} />
        {agentErr && <span className="oc-err">{agentErr}</span>}
        <button className="btn" disabled={busy || !agent.trim() || !!agentErr} onClick={() => one("Add agent", () => write({ ...W, functionName: "setAgent", args: [toAddr(agent), true] }))}>Add agent</button>
      </Row>
      <ul className="oc-list">
        {agents.length === 0 && <li className="mute">No agents: nobody can pay from this wallet.</li>}
        {agents.map((a) => (
          <li key={a}><span className="grow">{short(a)}<small className="mute">agent key</small></span>
            <Confirm label="Remove" sure="Remove?" className="btn danger btn-sm" disabled={busy} onConfirm={() => one("Remove agent", () => write({ ...W, functionName: "setAgent", args: [a, false] }))} /></li>
        ))}
      </ul>
      <Row title="Approvers" say="Two of these three sign any payment over Two of Three's threshold. Changing a seat cancels every open approval.">
        {seats.map((s, i) => <input key={i} aria-label={`Approver seat ${i + 1}`} value={s} onChange={(e) => setSeats(seats.map((x, k) => (k === i ? e.target.value : x)))} placeholder={`Seat ${i + 1} · 0x… or empty`} spellCheck={false} />)}
        {seatErr && <span className="oc-err">{seatErr}</span>}
        <button className="btn" disabled={busy || !!seatErr || !seatsChanged} onClick={() => one("Save approvers", () => write({ ...W, functionName: "setApprovers", args: [seats.map((s) => (s.trim() ? toAddr(s) : ZERO)) as [Address, Address, Address]] }))}>Save approvers</button>
      </Row>
      <Row title="Approval window" say="How long an approval stays good after the first signature. Shorter is safer; it has to cover the time your approvers need.">
        <label className="oc-f m"><span>Hours</span><input aria-label="Approval window in hours" value={ttl} onChange={(e) => setTtl(e.target.value)} inputMode="numeric" /></label>
        {ttlErr && <span className="oc-err">{ttlErr}</span>}
        <button className="btn" disabled={busy || !!ttlErr || ttlN * 3600 === data.approvalTtl} onClick={() => one("Save approval window", () => write({ ...W, functionName: "setApprovalTtl", args: [ttlN * 3600] }))}>Save window</button>
      </Row>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ money
function Money({ data, busy, one, many, account }: P) {
  const { write } = useWallet();
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
      <Row title={`Wallet · ${Number(data.balance).toFixed(4)} USDT0`} say={<>What the agent pays from. Add USDT0 from your own wallet{mine !== null ? <> (you hold {Number(formatUnits(mine, 6)).toFixed(4)})</> : null}, or take it back: only you can move it out, the agent only through pay.</>}>
        <div className="two">
          <input aria-label="USDT0 to add to the wallet" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add, USDT0" inputMode="decimal" />
          <button className="btn" disabled={busy || !okMoney(add) || over(add, mine)} onClick={() => one("Add to the wallet", () => write({ address: USDT0, abi: erc20Abi, functionName: "transfer", args: [data.wallet, u(add)] }))}>Add</button>
          <input aria-label="USDT0 to withdraw from the wallet" value={out} onChange={(e) => setOut(e.target.value)} placeholder="Withdraw, USDT0" inputMode="decimal" />
          <button className="btn" disabled={busy || !okMoney(out) || over(out, bal)} onClick={() => one("Withdraw from the wallet", () => write({ ...W, functionName: "execute", args: [USDT0, 0n, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [account, u(out)] })] }))}>Withdraw</button>
        </div>
        {(over(add, mine) || over(out, bal)) && <span className="oc-err">More than there is.</span>}
      </Row>
      <Row title={`Fee balance · ${Number(data.feeBalance).toFixed(4)} USDT0`} say={<>Prepaid fees, held by the registry for this wallet. At {perDecision.toFixed(4)} USDT0 a decision it covers about <b>{covers}</b> more. Top it up from your wallet or take back what you don&apos;t need.</>}>
        <div className="two">
          <input aria-label="USDT0 to prepay as fees" value={top} onChange={(e) => setTop(e.target.value)} placeholder="Top up, USDT0" inputMode="decimal" />
          <button className="btn" disabled={busy || !okMoney(top) || over(top, mine)} onClick={() => many([
            { id: "approve", label: "Allow the registry to take the top-up", run: async () => {
              const have = await pub.readContract({ address: USDT0, abi: erc20Abi, functionName: "allowance", args: [account, DEP.registry as Address] });
              return have >= u(top) ? null : write({ address: USDT0, abi: erc20Abi, functionName: "approve", args: [DEP.registry as Address, u(top)] });
            } },
            { id: "deposit", label: "Top up fees", run: () => write({ address: DEP.registry as Address, abi: fuseRegistryAbi, functionName: "deposit", args: [data.wallet, u(top)] }) },
          ])}>Top up</button>
          <input aria-label="USDT0 to withdraw" value={back} onChange={(e) => setBack(e.target.value)} placeholder="USDT0" inputMode="decimal" />
          <button className="btn" disabled={busy || !okMoney(back) || over(back, fees)} onClick={() => one("Withdraw fees", () => write({ ...W, functionName: "withdrawFeeBalance", args: [u(back), account] }))}>Withdraw</button>
        </div>
        {(over(top, mine) || over(back, fees)) && <span className="oc-err">More than there is.</span>}
      </Row>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ ownership
function Ownership({ data, busy, one, account }: P) {
  const { write } = useWallet();
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;
  const [to, setTo] = useState("");
  const pending = data.pendingOwner && data.pendingOwner !== ZERO ? data.pendingOwner : null;
  const err = !to.trim() ? null : !okAddr(to) ? "Not an address" : same(to.trim(), account) ? "That's you" : same(to.trim(), data.wallet) ? "A wallet can't own itself" : null;
  return (
    <>
      {pending && (
        <Row title="Handover in progress" say={<>{short(pending)} can accept ownership from their own wallet. Until they do, you stay the owner and can cancel.</>}>
          <button className="btn" disabled={busy} onClick={() => one("Cancel handover", () => write({ ...W, functionName: "transferOwnership", args: [ZERO] }))}>Cancel handover</button>
        </Row>
      )}
      <Row title="Hand the wallet over" say="Two steps, so a typo can't lose the wallet: you name the new owner, then they accept from that address. They get every control on this page; you keep none.">
        <input aria-label="New owner address" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" spellCheck={false} />
        {err && <span className="oc-err">{err}</span>}
        <Confirm label="Start the handover" sure={`Hand it to ${okAddr(to) ? short(to.trim()) : "them"}?`} disabled={busy || !to.trim() || !!err} onConfirm={() => one("Start handover", () => write({ ...W, functionName: "transferOwnership", args: [toAddr(to)] }))} />
      </Row>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ console
const TABS: { k: Tab; label: string }[] = [
  { k: "safety", label: "Safety" }, { k: "fuses", label: "Fuses" }, { k: "payees", label: "Payees" },
  { k: "people", label: "People" }, { k: "money", label: "Money" }, { k: "owner", label: "Ownership" },
];

/** Every owner control the wallet contract has, shown only to its owner (and an accept card to an incoming owner). */
export default function OwnerConsole({ data }: { data: Atlas }) {
  const { account, write } = useWallet();
  const q = useTxQueue<object>();
  const [tab, setTab] = useState<Tab>("safety");
  const isOwner = same(account ?? "", data.owner);
  const isPending = !isOwner && !!data.pendingOwner && data.pendingOwner !== ZERO && same(account ?? "", data.pendingOwner);
  if (!account || (!isOwner && !isPending)) return null;

  const one: One = (label, run) => { q.start([{ id: label, label, run }], {}); };
  const many = (list: TxStep<object>[]) => { q.start(list, {}); };
  const cur = q.steps.find((s) => s.state === "sign" || s.state === "mine" || s.state === "error") ?? q.steps[q.steps.length - 1];
  const status = cur ? `${cur.label}: ${cur.state === "done" ? "done" : cur.state === "error" ? cur.error : cur.state === "skip" ? "not needed" : cur.state === "mine" ? "confirming on X Layer…" : "sign in your wallet…"}` : "";
  const props: P = { data, busy: q.running, one, many, account };
  const W = { address: data.wallet, abi: fuseboxWalletAbi } as const;

  if (isPending) return (
    <section className="owner" data-b aria-label="Ownership offer">
      <h2 className="sr">Ownership offer</h2>
      <div className="oh m"><span className="lime">Ownership offered to you</span><span className="mute" role="status">{status}</span></div>
      <Row title="Accept this wallet" say={<>{short(data.owner)} started handing this wallet to you. Accept to become its owner: its fuses, payees, agents and funds answer to you from then on.</>}>
        <button className="btn lime" disabled={q.running} onClick={() => one("Accept ownership", () => write({ ...W, functionName: "acceptOwnership" }))}>Accept ownership</button>
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
    <section className="owner" data-b aria-label="Owner console">
      <h2 className="sr">Owner console</h2>
      <div className="oh m"><span className="lime">You own this wallet</span><span className="mute" role="status">{status}</span></div>
      <div className="oc">
        <div className="oc-tabs m" role="tablist" aria-label="Owner console" onKeyDown={(e) => {
          // arrow keys move between tabs, as a tab list should
          const i = TABS.findIndex((t) => t.k === tab), d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
          if (!d) return; e.preventDefault();
          const next = TABS[(i + d + TABS.length) % TABS.length].k; setTab(next);
          const el = document.getElementById(`oc-${next}`); el?.focus(); el?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }}>
          {TABS.map((t) => (
            <button key={t.k} role="tab" id={`oc-${t.k}`} aria-selected={tab === t.k} aria-controls="oc-panel" tabIndex={tab === t.k ? 0 : -1} className={tab === t.k ? "on" : ""} onClick={(e) => { setTab(t.k); e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }}>
              {t.label}{badge[t.k] ? <i className={badge[t.k] === "blown" || badge[t.k] === "paused" ? "red" : ""}>{badge[t.k]}</i> : null}
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
