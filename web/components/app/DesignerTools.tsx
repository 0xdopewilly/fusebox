"use client";
import { useEffect, useState } from "react";
import { getAddress, isAddress, keccak256, parseUnits, type Address, type Hex } from "viem";
import { fuseRegistryAbi, tapeoutProcessorAbi } from "@/lib/abi";
import { CURRENT, DEP, pub, V1 } from "@/lib/client-chain";
import { short, fmt, OKLINK } from "@/lib/hooks";
import { useTxQueue } from "@/lib/useTxQueue";
import type { Market } from "@/lib/market";
import Link from "next/link";
import { encodeMeta, metaSource } from "@/lib/fuseMeta";
import { useWallet } from "./WalletProvider";
import ConnectChoices from "./ConnectChoices";
import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";

const SOCKETS: Record<number, [number, string]> = { 24: [1, "Daily Cap"], 33: [2, "Payee Guard"], 4: [3, "Breaker"], 19: [4, "Two of Three"], 2: [5, "Repeat Guard"] };
interface Info { owner: Address; nIn: number; nOut: number; nState: number; gates: number; hash: Hex }

/**
 * One claim per registry that holds earnings for these fuses: v2 (the market), and v1 for fuses 1-4, whose Atlas
 * decisions were paid there. Each claim sends that registry's balance to `to`.
 */
export function claimSteps(fuses: Market["fuses"], to: Address, write: ReturnType<typeof useWallet>["write"], zh = false) {
  return fuses.flatMap((f) => f.claims.filter((c) => Number(c.earned) > 0).map((c) => {
    const v1 = c.registry.toLowerCase() === V1.registry.toLowerCase();
    return { id: `c${v1 ? "v1-" : ""}${c.fuseId}`, label: zh ? `领取保险丝 #${f.fuseId}${v1 ? "（v1，Atlas）" : ""}` : `Claim fuse #${f.fuseId}${v1 ? " (v1, Atlas)" : ""}`, run: () => write({ address: c.registry, abi: fuseRegistryAbi, functionName: "claim", args: [BigInt(c.fuseId), to] }) };
  }));
}

/** Price, listing and description link for one fuse you own. A fee rise only reaches wallets that accept it. */
export function ManageFuse({ f, busy, run }: { f: Market["fuses"][number]; busy: boolean; run: (label: string, fn: () => Promise<Hex>) => void }) {
  const { write } = useWallet();
  const { t } = useLang();
  const R = { address: CURRENT.registry, abi: fuseRegistryAbi } as const; // price, listing and description live on v2
  const [fee, setFee] = useState(f.fee);
  const [sum, setSum] = useState(f.meta?.summary ?? ""); const [desc, setDesc] = useState(f.meta?.description ?? ""); const [rule, setRule] = useState(f.meta?.rule ?? "");
  const [uri, setUri] = useState(metaSource(f.metadataURI) === "link" ? f.metadataURI : "");
  const feeOk = /^\d+(\.\d{1,6})?$/.test(fee.trim()) && Number(fee) <= 1;
  const up = feeOk && Number(fee) > Number(f.fee);
  // the description is written on X Layer itself, as a fusebox-fuse/1 data URI the market and the fuse page read
  const doc = encodeMeta({ name: f.meta?.name ?? f.name, summary: sum.trim(), description: desc.trim(), rule: rule.trim(), designer: f.meta?.designer, source: f.meta?.source, external_url: `https://fusebox-xlayer.vercel.app/app/fuse/${f.fuseId}` });
  const docErr = !sum.trim() ? t("Add a one-line summary", "请添加一句话简介") : sum.length > 200 ? t("Summary: 200 characters at most", "简介：最多 200 个字符") : desc.length > 1200 ? t("Description: 1,200 characters at most", "描述：最多 1,200 个字符") : rule.length > 160 ? t("Rule: 160 characters at most", "规则：最多 160 个字符") : null;
  const same = doc === f.metadataURI || (sum.trim() === (f.meta?.summary ?? "") && desc.trim() === (f.meta?.description ?? "") && rule.trim() === (f.meta?.rule ?? "") && metaSource(f.metadataURI) === "on-chain");
  return (
    <div className="mf">
      <div className="mf-top"><b>#{f.fuseId} {f.name}</b><span className={f.listed ? "lime" : "red"}>{f.listed ? t("Listed", "已上架") : t("Delisted", "已下架")}</span></div>
      <div className="mf-grid">
        <label className="field"><span>{t("Fee per check (USD₮0)", "每次检查的费用（USD₮0）")}</span><input aria-label={t(`Fee per check for fuse ${f.fuseId}`, `保险丝 ${f.fuseId} 每次检查的费用`)} value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" /></label>
        <button className="btn" disabled={busy || !feeOk || Number(fee) === Number(f.fee)} onClick={() => run(t(`Set fuse #${f.fuseId}'s fee`, `设置保险丝 #${f.fuseId} 的费用`), () => write({ ...R, functionName: "setFee", args: [BigInt(f.fuseId), parseUnits(fee.trim(), 6)] }))}>{t("Set fee", "设置费用")}</button>
      </div>
      {!feeOk && <p className="m red" style={{ fontSize: 11 }}>{t("A fee from 0 to 1 USD₮0, up to 6 decimals.", "费用需在 0 到 1 USD₮0 之间，最多 6 位小数。")}</p>}
      {up && <p className="m mute" style={{ fontSize: 11 }}>{t(`A higher fee applies to new installs at once; wallets already running this fuse keep paying their accepted ${f.fee} until their owner accepts the new price. A lower fee applies to everyone straight away.`, `调高的费用立即对新安装生效；已在使用这个保险丝的钱包会继续按已接受的 ${f.fee} 支付，直到其所有者接受新价格。调低的费用立即对所有人生效。`)}</p>}
      <div className="mf-desc">
        <label className="field"><span>{t("Summary · one line on the market card", "简介 · 市场卡片上的一句话")}</span><input aria-label={t(`Summary for fuse ${f.fuseId}`, `保险丝 ${f.fuseId} 的简介`)} value={sum} onChange={(e) => setSum(e.target.value)} maxLength={200} /></label>
        <label className="field"><span>{t("Description · the fuse's own page", "描述 · 保险丝自己的页面")}</span><textarea aria-label={t(`Description for fuse ${f.fuseId}`, `保险丝 ${f.fuseId} 的描述`)} value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} maxLength={1200} /></label>
        <label className="field"><span>{t("Rule · in plain terms (optional)", "规则 · 用通俗的话写（可选）")}</span><input aria-label={t(`Rule for fuse ${f.fuseId}`, `保险丝 ${f.fuseId} 的规则`)} value={rule} onChange={(e) => setRule(e.target.value)} maxLength={160} placeholder="allow iff …" /></label>
        <div className="mf-row">
          <span className="m mute" style={{ fontSize: 11 }}>{docErr ?? t(`Stored on X Layer: ${doc.length.toLocaleString()} bytes, no host to keep alive.`, `存储在 X Layer 上：${doc.length.toLocaleString()} 字节，无需维护任何服务器。`)}</span>
          <button className="btn" disabled={busy || !!docErr || same} onClick={() => run(t(`Describe fuse #${f.fuseId}`, `更新保险丝 #${f.fuseId} 的描述`), () => write({ ...R, functionName: "setMetadataURI", args: [BigInt(f.fuseId), doc] }))}>{t("Save description", "保存描述")}</button>
        </div>
        <details className="mf-adv m"><summary>{t("Or point to your own JSON", "或指向你自己的 JSON")}</summary>
          <div className="mf-grid">
            <label className="field"><span>{t("Metadata URL (https://…)", "元数据 URL（https://…）")}</span><input aria-label={t(`Metadata URL for fuse ${f.fuseId}`, `保险丝 ${f.fuseId} 的元数据 URL`)} value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…/fuse.json" spellCheck={false} /></label>
            <button className="btn" disabled={busy || !/^https:\/\/\S+$/.test(uri.trim()) || uri.trim() === f.metadataURI || uri.length > 300} onClick={() => run(t(`Set fuse #${f.fuseId}'s link`, `设置保险丝 #${f.fuseId} 的链接`), () => write({ ...R, functionName: "setMetadataURI", args: [BigInt(f.fuseId), uri.trim()] }))}>{t("Save link", "保存链接")}</button>
          </div>
        </details>
      </div>
      <div className="mf-row" style={{ marginTop: 12 }}>
        <Link className="m lime" href={`/app/fuse/${f.fuseId}`} style={{ fontSize: 11 }}>{t("Its page →", "详情页 →")}</Link>
        <button className={`btn${f.listed ? " danger" : ""}`} disabled={busy} onClick={() => run(f.listed ? t(`Delist fuse #${f.fuseId}`, `下架保险丝 #${f.fuseId}`) : t(`Relist fuse #${f.fuseId}`, `重新上架保险丝 #${f.fuseId}`), () => write({ ...R, functionName: "setListed", args: [BigInt(f.fuseId), !f.listed] }))}>{f.listed ? t("Delist (existing installs keep working)", "下架（已有安装继续有效）") : t("List it again", "重新上架")}</button>
      </div>
    </div>
  );
}

/** Listing a taped-out circuit: the form's state, what's wrong with it (or null), and the registry call it signs. */
export function useListCircuit(market: Market | null) {
  const { account, write } = useWallet();
  const { t } = useLang();
  const [proc, setProc] = useState<string>(DEP.processor); const [cid, setCid] = useState(""); const [fee, setFee] = useState("0.001"); const [fname, setFname] = useState(""); const [fsum, setFsum] = useState("");
  const [info, setInfo] = useState<Info | null>(null); const [infoErr, setInfoErr] = useState<string | null>(null);
  useEffect(() => {
    setInfo(null); setInfoErr(null);
    if (!isAddress(proc, { strict: false }) || !/^\d+$/.test(cid)) return;
    const P = { address: getAddress(proc.toLowerCase()), abi: tapeoutProcessorAbi } as const;
    const id = BigInt(cid);
    Promise.all([pub.readContract({ ...P, functionName: "ownerOf", args: [id] }), pub.readContract({ ...P, functionName: "circuitInfo", args: [id] }), pub.readContract({ ...P, functionName: "netlist", args: [id] })])
      .then(([owner, ci, nl]) => setInfo({ owner, nIn: Number(ci[0]), nOut: Number(ci[1]), nState: Number(ci[2]), gates: Number(ci[3]), hash: keccak256(nl) }))
      .catch(() => setInfoErr("no-circuit"));
  }, [proc, cid]);

  const socket = info ? SOCKETS[info.nIn] : undefined;
  const listed = info && market?.fuses.find((f) => f.processor.toLowerCase() === proc.toLowerCase() && f.circuitId === Number(cid));
  const problem = !account ? t("Connect the wallet that owns the circuit NFT.", "连接持有该电路 NFT 的钱包。") : !info ? (infoErr ? t("No circuit with that id on this processor.", "这个处理器上没有该编号的电路。") : t("Enter a processor and circuit id.", "请输入处理器和电路编号。")) : listed ? t(`Already listed as fuse #${listed.fuseId}.`, `已作为保险丝 #${listed.fuseId} 上架。`)
    : info.owner.toLowerCase() !== account.toLowerCase() ? t(`The circuit belongs to ${short(info.owner)}, not your connected wallet.`, `该电路属于 ${short(info.owner)}，不是你连接的钱包。`) : !socket ? t(`${info.nIn} inputs doesn't match a Fusebox socket (24, 33, 4, 19 or 2).`, `${info.nIn} 个输入与 Fusebox 插槽不匹配（应为 24、33、4、19 或 2）。`) : info.nOut !== 1 ? t("Fuses answer with exactly one output.", "保险丝只能有一个输出。") : info.gates > 512 ? t("Over the 512-gate budget.", "超出 512 个门的预算。") : !(Number(fee) >= 0) ? t("Enter a fee.", "请输入费用。") : null;
  const submit = () => write({ address: CURRENT.registry, abi: fuseRegistryAbi, functionName: "list", args: [getAddress(proc.toLowerCase()), BigInt(cid), socket![0], info!.hash, parseUnits(fee || "0", 6), fname.trim() || fsum.trim() ? encodeMeta({ name: fname.trim() || undefined, summary: fsum.trim() || undefined, designer: short(account!) }) : ""] });
  return { proc, setProc, cid, setCid, fee, setFee, fname, setFname, fsum, setFsum, info, socket, problem, submit };
}

/** For designers: claim what your fuses earned, manage their price and listing, and list a circuit you've taped out. */
export default function DesignerTools({ market }: { market: Market | null }) {
  const { account, write } = useWallet();
  const { t, zh } = useLang();
  const q = useTxQueue<object>();
  const { proc, setProc, cid, setCid, fee, setFee, fname, setFname, fsum, setFsum, info, socket, problem, submit } = useListCircuit(market);
  const mine = market && account ? market.fuses.filter((f) => f.designer.toLowerCase() === account.toLowerCase()) : [];
  const claimable = mine.filter((f) => Number(f.earned) > 0);
  const last = q.steps[q.steps.length - 1];

  return (
    <section className="wz" style={{ marginTop: 56 }}>
      <div className="wz-main">
        <div className="wz-sec">
          <div className="ix">↓</div>
          <div>
            <h3>{t("Claim your earnings", "领取你的收益")}</h3>
            {!account ? <><p className="lead">{t("Connect the wallet that owns your circuit NFTs.", "连接持有你的电路 NFT 的钱包。")}</p><ConnectChoices /></>
              : !mine.length ? <p className="lead">{t(`${short(account)} doesn't own any listed fuse yet. List one below.`, `${short(account)} 还没有已上架的保险丝。在下方上架一个吧。`)}</p>
              : (
                <>
                  <p className="lead">{t(<>Your fuses have earned <span className="m lime">{fmt(mine.reduce((a, f) => a + Number(f.lifetimeEarned), 0))} USD₮0</span> in total; <span className="m lime">{fmt(claimable.reduce((a, f) => a + Number(f.earned), 0))}</span> is ready to claim.</>, <>你的保险丝累计赚了 <span className="m lime">{fmt(mine.reduce((a, f) => a + Number(f.lifetimeEarned), 0))} USD₮0</span>，其中 <span className="m lime">{fmt(claimable.reduce((a, f) => a + Number(f.earned), 0))}</span> 可以领取。</>)}</p>
                  <div className="tricks">
                    {mine.map((f) => (
                      <div className="trick" key={f.fuseId} style={{ gridTemplateColumns: "60px 1fr auto" }}>
                        <span className="n">#{f.fuseId}</span><span>{t(`${f.name} · ${f.decisions} decisions · ${fmt(f.earned)} USD₮0 claimable`, `${f.name} · ${f.decisions} 次决策 · 可领取 ${fmt(f.earned)} USD₮0`)}</span>
                        <button className="btn" style={{ height: 34 }} disabled={q.running || Number(f.earned) <= 0} onClick={() => q.start(claimSteps([f], account, write, zh), {})}>{t("Claim", "领取")}</button>
                      </div>
                    ))}
                  </div>
                  {claimable.length > 1 && <button className="btn lime" style={{ marginTop: 14 }} disabled={q.running} onClick={() => q.start(claimSteps(claimable, account, write, zh), {})}>{t("Claim all", "全部领取")}</button>}
                </>
              )}
          </div>
        </div>
        {account && mine.length > 0 && (
          <div className="wz-sec">
            <div className="ix">⇄</div>
            <div>
              <h3>{t("Price and listing", "价格与上架")}</h3>
              <p className="lead">{t("Change what a check costs, delist a fuse from new installs, or point it at a page that explains it. Only the circuit NFT's owner can.", "修改每次检查的价格、下架保险丝不再接受新安装，或给它指向一个说明页面。只有电路 NFT 的持有者可以操作。")}</p>
              {mine.map((f) => <ManageFuse key={f.fuseId} f={f} busy={q.running} run={(label, fn) => q.start([{ id: label, label, run: fn }], {})} />)}
            </div>
          </div>
        )}
        <div className="wz-sec">
          <div className="ix">+</div>
          <div>
            <h3>{t("List a circuit you've taped out", "上架你已流片的电路")}</h3>
            <p className="lead">{t("Enter the processor and circuit id. Fusebox reads the circuit from TapeOut, matches it to a socket by its inputs, and lists it with your fee. Wallets can install it straight away.", "输入处理器和电路编号。Fusebox 会从 TapeOut 读取电路，按输入匹配插槽，并以你设定的费用上架。钱包可以立即安装。")}</p>
            <div className="fields m" style={{ marginTop: 0 }}>
              <div className="prow">
                <div className="field" style={{ flex: 2 }}><label>{t("Processor", "处理器")}</label><input aria-label={t("Processor", "处理器")} value={proc} onChange={(e) => setProc(e.target.value)} spellCheck={false} /></div>
                <div className="field"><label>{t("Circuit id", "电路编号")}</label><input aria-label={t("Circuit id", "电路编号")} value={cid} onChange={(e) => setCid(e.target.value)} inputMode="numeric" placeholder={t("e.g. 19", "例如 19")} /></div>
              </div>
              {info && <div className="hint2">{t(<>Owner {short(info.owner)} · {info.nIn} inputs · {info.gates} gates{info.nState ? ` · ${info.nState} state bits` : ""} · {socket ? `fits the ${socket[1]} socket` : "no matching socket"} · netlist {info.hash.slice(0, 10)}…</>, <>所有者 {short(info.owner)} · {info.nIn} 个输入 · {info.gates} 个门{info.nState ? ` · ${info.nState} 个状态位` : ""} · {socket ? `匹配 ${socket[1]} 插槽` : "没有匹配的插槽"} · 网表 {info.hash.slice(0, 10)}…</>)}</div>}
              <div className="prow">
                <div className="field"><label>{t("Fee per check, USD₮0", "每次检查的费用，USD₮0")}</label><input aria-label={t("Fee per check, USD₮0", "每次检查的费用，USD₮0")} value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" /></div>
                <div className="field" style={{ flex: 2 }}><label>{t("Name", "名称")}</label><input aria-label={t("Fuse name", "保险丝名称")} value={fname} onChange={(e) => setFname(e.target.value)} maxLength={60} placeholder={socket ? t(`e.g. Strict ${socket[1]}`, `例如 Strict ${socket[1]}`) : t("e.g. Per-payment cap", "例如 Per-payment cap")} /></div>
              </div>
              <div className="field"><label>{t("One-line summary · stored on X Layer with the listing", "一句话简介 · 随上架一起存储在 X Layer 上")}</label><input aria-label={t("One-line summary", "一句话简介")} value={fsum} onChange={(e) => setFsum(e.target.value)} maxLength={200} placeholder={t("What it lets through, in a sentence", "用一句话说明它放行什么")} /></div>
            </div>
          </div>
        </div>
      </div>
      <div className="wz-side">
        <div className="summary">
          <div className="sh2 m"><span className="mute">{t("Designer", "设计者")}</span><span className="lime">{account ? short(account) : t("not connected", "未连接")}</span></div>
          <div className="go">
            <button className="btn lime" disabled={q.running || !!problem} onClick={() => q.start([{ id: "list", label: t("List the circuit", "上架电路"), run: submit }], {})}>{t("List it as a fuse", "作为保险丝上架")} <span className="k">→</span></button>
            {problem && <div className="warn2">{problem}</div>}
            {last && <p className="m mute" style={{ marginTop: 10 }}>{last.label}{t(": ", "：")}{last.state === "done" ? t("done", "完成") : last.state === "error" ? (zh && last.error ? errZh(last.error) : last.error) : last.state === "skip" ? t("not needed", "无需操作") : t("sign in your wallet…", "请在钱包中签名…")}{last.hash ? <> · <a className="lime" href={`${OKLINK}/tx/${last.hash}`} target="_blank" rel="noreferrer">tx ↗</a></> : null}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
