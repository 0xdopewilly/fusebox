"use client";
import { useEffect, useState } from "react";
import { getAddress, isAddress, keccak256, parseUnits, type Address, type Hex } from "viem";
import { fuseRegistryAbi, tapeoutProcessorAbi } from "@/lib/abi";
import { DEP, pub } from "@/lib/client-chain";
import { short, fmt, OKLINK } from "@/lib/hooks";
import { useTxQueue } from "@/lib/useTxQueue";
import type { Market } from "@/lib/market";
import { useWallet } from "./WalletProvider";

const SOCKETS: Record<number, [number, string]> = { 24: [1, "Daily Cap"], 33: [2, "Payee Guard"], 4: [3, "Breaker"], 19: [4, "Two of Three"] };
interface Info { owner: Address; nIn: number; nOut: number; nState: number; gates: number; hash: Hex }

/** For designers: claim what your fuses earned, and list a circuit you've taped out. */
export default function DesignerTools({ market }: { market: Market | null }) {
  const { account, wallets, connect, write } = useWallet();
  const q = useTxQueue<object>();
  const [proc, setProc] = useState(DEP.processor); const [cid, setCid] = useState(""); const [fee, setFee] = useState("0.001"); const [uri, setUri] = useState("");
  const [info, setInfo] = useState<Info | null>(null); const [infoErr, setInfoErr] = useState<string | null>(null);
  const mine = market && account ? market.fuses.filter((f) => f.designer.toLowerCase() === account.toLowerCase()) : [];
  const claimable = mine.filter((f) => Number(f.earned) > 0);

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
  const last = q.steps[q.steps.length - 1];

  return (
    <section className="wz" style={{ marginTop: 56 }}>
      <div className="wz-main">
        <div className="wz-sec">
          <div className="ix">↓</div>
          <div>
            <h3>Claim your earnings</h3>
            {!account ? <><p className="lead">Connect the wallet that owns your circuit NFTs.</p><div className="prow">{wallets.map((w) => <button key={w.info.rdns} className="btn lime" onClick={() => connect(w.info.rdns)}>Connect {w.info.name}</button>)}</div></>
              : !mine.length ? <p className="lead">{short(account)} doesn&apos;t own any listed fuse yet. List one below.</p>
              : (
                <>
                  <p className="lead">Your fuses have earned <span className="m lime">{fmt(mine.reduce((t, f) => t + Number(f.lifetimeEarned), 0))} USDT0</span> in total; <span className="m lime">{fmt(claimable.reduce((t, f) => t + Number(f.earned), 0))}</span> is ready to claim.</p>
                  <div className="tricks">
                    {mine.map((f) => (
                      <div className="trick" key={f.fuseId} style={{ gridTemplateColumns: "60px 1fr auto" }}>
                        <span className="n">#{f.fuseId}</span><span>{f.name} · {f.decisions} decisions · {fmt(f.earned)} USDT0 claimable</span>
                        <button className="btn" style={{ height: 34 }} disabled={q.running || Number(f.earned) <= 0} onClick={() => q.start([{ id: `c${f.fuseId}`, label: `Claim fuse #${f.fuseId}`, run: () => write({ address: DEP.registry as Address, abi: fuseRegistryAbi, functionName: "claim", args: [BigInt(f.fuseId), account] }) }], {})}>Claim</button>
                      </div>
                    ))}
                  </div>
                  {claimable.length > 1 && <button className="btn lime" style={{ marginTop: 14 }} disabled={q.running} onClick={() => q.start(claimable.map((f) => ({ id: `c${f.fuseId}`, label: `Claim fuse #${f.fuseId}`, run: () => write({ address: DEP.registry as Address, abi: fuseRegistryAbi, functionName: "claim", args: [BigInt(f.fuseId), account] }) })), {})}>Claim all</button>}
                </>
              )}
          </div>
        </div>
        <div className="wz-sec">
          <div className="ix">+</div>
          <div>
            <h3>List a circuit you&apos;ve taped out</h3>
            <p className="lead">Enter the processor and circuit id. Fusebox reads the circuit from TapeOut, matches it to a socket by its inputs, and lists it with your fee. Wallets can install it straight away.</p>
            <div className="fields m" style={{ marginTop: 0 }}>
              <div className="prow">
                <div className="field" style={{ flex: 2 }}><label>Processor</label><input value={proc} onChange={(e) => setProc(e.target.value)} spellCheck={false} /></div>
                <div className="field"><label>Circuit id</label><input value={cid} onChange={(e) => setCid(e.target.value)} inputMode="numeric" placeholder="e.g. 19" /></div>
              </div>
              {info && <div className="hint2">Owner {short(info.owner)} · {info.nIn} inputs · {info.gates} gates{info.nState ? ` · ${info.nState} state bits` : ""} · {socket ? `fits the ${socket[1]} socket` : "no matching socket"} · netlist {info.hash.slice(0, 10)}…</div>}
              <div className="prow">
                <div className="field"><label>Fee per check, USDT0</label><input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" /></div>
                <div className="field" style={{ flex: 2 }}><label>Metadata URI (optional)</label><input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="ipfs://… or https://…" /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <aside className="wz-side">
        <div className="summary">
          <div className="sh2 m"><span className="mute">Designer</span><span className="lime">{account ? short(account) : "not connected"}</span></div>
          <div className="go">
            <button className="btn lime" disabled={q.running || !!problem} onClick={() => q.start([{ id: "list", label: "List the circuit", run: () => write({ address: DEP.registry as Address, abi: fuseRegistryAbi, functionName: "list", args: [getAddress(proc.toLowerCase()), BigInt(cid), socket![0], info!.hash, parseUnits(fee || "0", 6), uri] }) }], {})}>List it as a fuse <span className="k">→</span></button>
            {problem && <div className="warn2">{problem}</div>}
            {last && <p className="m mute" style={{ marginTop: 10 }}>{last.label}: {last.state === "done" ? "done" : last.state === "error" ? last.error : last.state === "skip" ? "not needed" : "sign in your wallet…"}{last.hash ? <> · <a className="lime" href={`${OKLINK}/tx/${last.hash}`} target="_blank" rel="noreferrer">tx ↗</a></> : null}</p>}
          </div>
        </div>
      </aside>
    </section>
  );
}
