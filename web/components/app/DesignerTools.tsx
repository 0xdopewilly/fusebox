"use client";
import { useEffect, useState } from "react";
import { getAddress, isAddress, keccak256, parseUnits, type Address, type Hex } from "viem";
import { fuseRegistryAbi, tapeoutProcessorAbi } from "@/lib/abi";
import { DEP, pub } from "@/lib/client-chain";
import { short, fmt, OKLINK } from "@/lib/hooks";
import { useTxQueue } from "@/lib/useTxQueue";
import type { Market } from "@/lib/market";
import Link from "next/link";
import { encodeMeta, metaSource } from "@/lib/fuseMeta";
import { useWallet } from "./WalletProvider";
import ConnectChoices from "./ConnectChoices";

const SOCKETS: Record<number, [number, string]> = { 24: [1, "Daily Cap"], 33: [2, "Payee Guard"], 4: [3, "Breaker"], 19: [4, "Two of Three"] };
interface Info { owner: Address; nIn: number; nOut: number; nState: number; gates: number; hash: Hex }

/** Price, listing and description link for one fuse you own. A fee rise only reaches wallets that accept it. */
export function ManageFuse({ f, busy, run }: { f: Market["fuses"][number]; busy: boolean; run: (label: string, fn: () => Promise<Hex>) => void }) {
  const { write } = useWallet();
  const R = { address: DEP.registry as Address, abi: fuseRegistryAbi } as const;
  const [fee, setFee] = useState(f.fee);
  const [sum, setSum] = useState(f.meta?.summary ?? ""); const [desc, setDesc] = useState(f.meta?.description ?? ""); const [rule, setRule] = useState(f.meta?.rule ?? "");
  const [uri, setUri] = useState(metaSource(f.metadataURI) === "link" ? f.metadataURI : "");
  const feeOk = /^\d+(\.\d{1,6})?$/.test(fee.trim()) && Number(fee) <= 1;
  const up = feeOk && Number(fee) > Number(f.fee);
  // the description is written on X Layer itself, as a fusebox-fuse/1 data URI the market and the fuse page read
  const doc = encodeMeta({ name: f.meta?.name ?? f.name, summary: sum.trim(), description: desc.trim(), rule: rule.trim(), designer: f.meta?.designer, source: f.meta?.source, external_url: `https://fusebox-xlayer.vercel.app/app/fuse/${f.fuseId}` });
  const docErr = !sum.trim() ? "Add a one-line summary" : sum.length > 200 ? "Summary: 200 characters at most" : desc.length > 1200 ? "Description: 1,200 characters at most" : rule.length > 160 ? "Rule: 160 characters at most" : null;
  const same = doc === f.metadataURI || (sum.trim() === (f.meta?.summary ?? "") && desc.trim() === (f.meta?.description ?? "") && rule.trim() === (f.meta?.rule ?? "") && metaSource(f.metadataURI) === "on-chain");
  return (
    <div className="mf">
      <div className="mf-top"><b>#{f.fuseId} {f.name}</b><span className={f.listed ? "lime" : "red"}>{f.listed ? "Listed" : "Delisted"}</span></div>
      <div className="mf-grid">
        <label className="field"><span>Fee per check (USD₮0)</span><input aria-label={`Fee per check for fuse ${f.fuseId}`} value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" /></label>
        <button className="btn" disabled={busy || !feeOk || Number(fee) === Number(f.fee)} onClick={() => run(`Set fuse #${f.fuseId}'s fee`, () => write({ ...R, functionName: "setFee", args: [BigInt(f.fuseId), parseUnits(fee.trim(), 6)] }))}>Set fee</button>
      </div>
      {!feeOk && <p className="m red" style={{ fontSize: 11 }}>A fee from 0 to 1 USD₮0, up to 6 decimals.</p>}
      {up && <p className="m mute" style={{ fontSize: 11 }}>A higher fee applies to new installs at once; wallets already running this fuse keep paying their accepted {f.fee} until their owner accepts the new price. A lower fee applies to everyone straight away.</p>}
      <div className="mf-desc">
        <label className="field"><span>Summary · one line on the market card</span><input aria-label={`Summary for fuse ${f.fuseId}`} value={sum} onChange={(e) => setSum(e.target.value)} maxLength={200} /></label>
        <label className="field"><span>Description · the fuse&apos;s own page</span><textarea aria-label={`Description for fuse ${f.fuseId}`} value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} maxLength={1200} /></label>
        <label className="field"><span>Rule · in plain terms (optional)</span><input aria-label={`Rule for fuse ${f.fuseId}`} value={rule} onChange={(e) => setRule(e.target.value)} maxLength={160} placeholder="allow iff …" /></label>
        <div className="mf-row">
          <span className="m mute" style={{ fontSize: 11 }}>{docErr ?? `Stored on X Layer: ${doc.length.toLocaleString()} bytes, no host to keep alive.`}</span>
          <button className="btn" disabled={busy || !!docErr || same} onClick={() => run(`Describe fuse #${f.fuseId}`, () => write({ ...R, functionName: "setMetadataURI", args: [BigInt(f.fuseId), doc] }))}>Save description</button>
        </div>
        <details className="mf-adv m"><summary>Or point to your own JSON</summary>
          <div className="mf-grid">
            <label className="field"><span>Metadata URL (https://…)</span><input aria-label={`Metadata URL for fuse ${f.fuseId}`} value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…/fuse.json" spellCheck={false} /></label>
            <button className="btn" disabled={busy || !/^https:\/\/\S+$/.test(uri.trim()) || uri.trim() === f.metadataURI || uri.length > 300} onClick={() => run(`Set fuse #${f.fuseId}'s link`, () => write({ ...R, functionName: "setMetadataURI", args: [BigInt(f.fuseId), uri.trim()] }))}>Save link</button>
          </div>
        </details>
      </div>
      <div className="mf-row" style={{ marginTop: 12 }}>
        <Link className="m lime" href={`/app/fuse/${f.fuseId}`} style={{ fontSize: 11 }}>Its page →</Link>
        <button className={`btn${f.listed ? " danger" : ""}`} disabled={busy} onClick={() => run(f.listed ? `Delist fuse #${f.fuseId}` : `Relist fuse #${f.fuseId}`, () => write({ ...R, functionName: "setListed", args: [BigInt(f.fuseId), !f.listed] }))}>{f.listed ? "Delist (existing installs keep working)" : "List it again"}</button>
      </div>
    </div>
  );
}

/** Listing a taped-out circuit: the form's state, what's wrong with it (or null), and the registry call it signs. */
export function useListCircuit(market: Market | null) {
  const { account, write } = useWallet();
  const [proc, setProc] = useState<string>(DEP.processor); const [cid, setCid] = useState(""); const [fee, setFee] = useState("0.001"); const [fname, setFname] = useState(""); const [fsum, setFsum] = useState("");
  const [info, setInfo] = useState<Info | null>(null); const [infoErr, setInfoErr] = useState<string | null>(null);
  useEffect(() => {
    setInfo(null); setInfoErr(null);
    if (!isAddress(proc, { strict: false }) || !/^\d+$/.test(cid)) return;
    const P = { address: getAddress(proc.toLowerCase()), abi: tapeoutProcessorAbi } as const;
    const id = BigInt(cid);
    Promise.all([pub.readContract({ ...P, functionName: "ownerOf", args: [id] }), pub.readContract({ ...P, functionName: "circuitInfo", args: [id] }), pub.readContract({ ...P, functionName: "netlist", args: [id] })])
      .then(([owner, ci, nl]) => setInfo({ owner, nIn: Number(ci[0]), nOut: Number(ci[1]), nState: Number(ci[2]), gates: Number(ci[3]), hash: keccak256(nl) }))
      .catch(() => setInfoErr("No circuit with that id on this processor."));
  }, [proc, cid]);

  const socket = info ? SOCKETS[info.nIn] : undefined;
  const listed = info && market?.fuses.find((f) => f.processor.toLowerCase() === proc.toLowerCase() && f.circuitId === Number(cid));
  const problem = !account ? "Connect the wallet that owns the circuit NFT." : !info ? (infoErr ?? "Enter a processor and circuit id.") : listed ? `Already listed as fuse #${listed.fuseId}.`
    : info.owner.toLowerCase() !== account.toLowerCase() ? `The circuit belongs to ${short(info.owner)}, not your connected wallet.` : !socket ? `${info.nIn} inputs doesn't match a Fusebox socket (24, 33, 4 or 19).` : info.nOut !== 1 ? "Fuses answer with exactly one output." : info.gates > 512 ? "Over the 512-gate budget." : !(Number(fee) >= 0) ? "Enter a fee." : null;
  const submit = () => write({ address: DEP.registry as Address, abi: fuseRegistryAbi, functionName: "list", args: [getAddress(proc.toLowerCase()), BigInt(cid), socket![0], info!.hash, parseUnits(fee || "0", 6), fname.trim() || fsum.trim() ? encodeMeta({ name: fname.trim() || undefined, summary: fsum.trim() || undefined, designer: short(account!) }) : ""] });
  return { proc, setProc, cid, setCid, fee, setFee, fname, setFname, fsum, setFsum, info, socket, problem, submit };
}

/** For designers: claim what your fuses earned, manage their price and listing, and list a circuit you've taped out. */
export default function DesignerTools({ market }: { market: Market | null }) {
  const { account, write } = useWallet();
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
            <h3>Claim your earnings</h3>
            {!account ? <><p className="lead">Connect the wallet that owns your circuit NFTs.</p><ConnectChoices /></>
              : !mine.length ? <p className="lead">{short(account)} doesn&apos;t own any listed fuse yet. List one below.</p>
              : (
                <>
                  <p className="lead">Your fuses have earned <span className="m lime">{fmt(mine.reduce((t, f) => t + Number(f.lifetimeEarned), 0))} USD₮0</span> in total; <span className="m lime">{fmt(claimable.reduce((t, f) => t + Number(f.earned), 0))}</span> is ready to claim.</p>
                  <div className="tricks">
                    {mine.map((f) => (
                      <div className="trick" key={f.fuseId} style={{ gridTemplateColumns: "60px 1fr auto" }}>
                        <span className="n">#{f.fuseId}</span><span>{f.name} · {f.decisions} decisions · {fmt(f.earned)} USD₮0 claimable</span>
                        <button className="btn" style={{ height: 34 }} disabled={q.running || Number(f.earned) <= 0} onClick={() => q.start([{ id: `c${f.fuseId}`, label: `Claim fuse #${f.fuseId}`, run: () => write({ address: DEP.registry as Address, abi: fuseRegistryAbi, functionName: "claim", args: [BigInt(f.fuseId), account] }) }], {})}>Claim</button>
                      </div>
                    ))}
                  </div>
                  {claimable.length > 1 && <button className="btn lime" style={{ marginTop: 14 }} disabled={q.running} onClick={() => q.start(claimable.map((f) => ({ id: `c${f.fuseId}`, label: `Claim fuse #${f.fuseId}`, run: () => write({ address: DEP.registry as Address, abi: fuseRegistryAbi, functionName: "claim", args: [BigInt(f.fuseId), account] }) })), {})}>Claim all</button>}
                </>
              )}
          </div>
        </div>
        {account && mine.length > 0 && (
          <div className="wz-sec">
            <div className="ix">⇄</div>
            <div>
              <h3>Price and listing</h3>
              <p className="lead">Change what a check costs, delist a fuse from new installs, or point it at a page that explains it. Only the circuit NFT&apos;s owner can.</p>
              {mine.map((f) => <ManageFuse key={f.fuseId} f={f} busy={q.running} run={(label, fn) => q.start([{ id: label, label, run: fn }], {})} />)}
            </div>
          </div>
        )}
        <div className="wz-sec">
          <div className="ix">+</div>
          <div>
            <h3>List a circuit you&apos;ve taped out</h3>
            <p className="lead">Enter the processor and circuit id. Fusebox reads the circuit from TapeOut, matches it to a socket by its inputs, and lists it with your fee. Wallets can install it straight away.</p>
            <div className="fields m" style={{ marginTop: 0 }}>
              <div className="prow">
                <div className="field" style={{ flex: 2 }}><label>Processor</label><input aria-label="Processor" value={proc} onChange={(e) => setProc(e.target.value)} spellCheck={false} /></div>
                <div className="field"><label>Circuit id</label><input aria-label="Circuit id" value={cid} onChange={(e) => setCid(e.target.value)} inputMode="numeric" placeholder="e.g. 19" /></div>
              </div>
              {info && <div className="hint2">Owner {short(info.owner)} · {info.nIn} inputs · {info.gates} gates{info.nState ? ` · ${info.nState} state bits` : ""} · {socket ? `fits the ${socket[1]} socket` : "no matching socket"} · netlist {info.hash.slice(0, 10)}…</div>}
              <div className="prow">
                <div className="field"><label>Fee per check, USD₮0</label><input aria-label="Fee per check, USD₮0" value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" /></div>
                <div className="field" style={{ flex: 2 }}><label>Name</label><input aria-label="Fuse name" value={fname} onChange={(e) => setFname(e.target.value)} maxLength={60} placeholder={socket ? `e.g. Strict ${socket[1]}` : "e.g. Per-payment cap"} /></div>
              </div>
              <div className="field"><label>One-line summary · stored on X Layer with the listing</label><input aria-label="One-line summary" value={fsum} onChange={(e) => setFsum(e.target.value)} maxLength={200} placeholder="What it lets through, in a sentence" /></div>
            </div>
          </div>
        </div>
      </div>
      <div className="wz-side">
        <div className="summary">
          <div className="sh2 m"><span className="mute">Designer</span><span className="lime">{account ? short(account) : "not connected"}</span></div>
          <div className="go">
            <button className="btn lime" disabled={q.running || !!problem} onClick={() => q.start([{ id: "list", label: "List the circuit", run: submit }], {})}>List it as a fuse <span className="k">→</span></button>
            {problem && <div className="warn2">{problem}</div>}
            {last && <p className="m mute" style={{ marginTop: 10 }}>{last.label}: {last.state === "done" ? "done" : last.state === "error" ? last.error : last.state === "skip" ? "not needed" : "sign in your wallet…"}{last.hash ? <> · <a className="lime" href={`${OKLINK}/tx/${last.hash}`} target="_blank" rel="noreferrer">tx ↗</a></> : null}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
