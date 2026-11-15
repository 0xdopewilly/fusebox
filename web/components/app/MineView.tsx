"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { fuseboxFactoryAbi, fuseboxWalletAbi } from "@/lib/abi";
import { DEP, pub } from "@/lib/client-chain";
import { short } from "@/lib/hooks";
import { useWallet } from "./WalletProvider";
import Loading from "./Loading";

interface Row { address: Address; fuses: number; decisions: number; paused: boolean; block?: number }

/** Every Fusebox wallet the connected address owns, read straight from the factory. */
export default function MineView() {
  const { account, wallets, connect } = useWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    if (!account) return;
    (async () => {
      const n = Number(await pub.readContract({ address: DEP.factory as Address, abi: fuseboxFactoryAbi, functionName: "walletCount" }));
      const addrs = await Promise.all(Array.from({ length: n }, (_, i) => pub.readContract({ address: DEP.factory as Address, abi: fuseboxFactoryAbi, functionName: "walletAt", args: [BigInt(i)] })));
      const owners = await Promise.all(addrs.map((a) => pub.readContract({ address: a, abi: fuseboxWalletAbi, functionName: "owner" })));
      const mine = addrs.filter((_, i) => owners[i].toLowerCase() === account.toLowerCase());
      let local: { address: string; block: number }[] = []; try { local = JSON.parse(localStorage.getItem("fusebox:mine") || "[]"); } catch {}
      setRows(await Promise.all(mine.map(async (a) => {
        const [f, d, p] = await Promise.all([
          pub.readContract({ address: a, abi: fuseboxWalletAbi, functionName: "fuseCount" }),
          pub.readContract({ address: a, abi: fuseboxWalletAbi, functionName: "decisionCount" }),
          pub.readContract({ address: a, abi: fuseboxWalletAbi, functionName: "paused" }),
        ]);
        return { address: a, fuses: Number(f), decisions: Number(d), paused: p, block: local.find((x) => x.address?.toLowerCase() === a.toLowerCase())?.block };
      })));
    })().catch(() => setRows([]));
  }, [account]);
  return (
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <section className="try-head">
        <h1 className="disp" data-a>My <span className="lime">[wallets]</span>.</h1>
        <p data-a>Every Fusebox wallet your connected address owns, read from the factory on X Layer.</p>
      </section>
      {!account ? (
        <div className="empty-card" data-a>
          <div className="m lime">Not connected</div>
          <h3>Connect the wallet that owns them</h3>
          <p>Fusebox reads every wallet the factory made for your address. Nothing is signed just to look.</p>
          {wallets.length ? <div className="prow">{wallets.map((w) => <button key={w.info.rdns} className="btn lime" onClick={() => connect(w.info.rdns)}>Connect {w.info.name} <span className="k">→</span></button>)}</div>
            : <p className="m mute">No wallet in this browser. <a className="lime" href="https://web3.okx.com/download" target="_blank" rel="noreferrer">Get OKX Wallet ↗</a> or open Fusebox in its built-in browser.</p>}
        </div>
      ) : !rows ? <Loading label="Finding your wallets in the factory" /> : (
        <div className="mine-list" data-a>
          {rows.map((r, i) => (
            <Link className="fz" key={r.address} href={`/app/w/${r.address}`} style={{ minHeight: 0 }} data-cursor="Open">
              <div><div className="ix">{String(i + 1).padStart(2, "0")}</div></div>
              <div style={{ gridColumn: "2 / 4" }}><h3>{short(r.address)}</h3><p className="say m">{r.address}</p></div>
              <div style={{ gridColumn: "4 / 7" }}><div className="chips"><span className="chip l">{r.fuses} fuses</span><span className="chip">{r.decisions} decisions</span><span className="chip">{r.paused ? "Paused" : "Live"}</span></div></div>
            </Link>
          ))}
          <div className="fz" style={{ borderStyle: "dashed", minHeight: 0 }}>
            <div><div className="ix" style={{ color: "var(--dim)" }}>+</div></div>
            <div style={{ gridColumn: "2 / 5" }}><h3 style={{ color: "var(--mute)" }}>{rows.length ? "Wire up another" : "No wallets yet"}</h3><p className="say">Give an agent its own wallet with fuses, in a few signatures.</p></div>
            <div style={{ gridColumn: "5 / 7", display: "flex", alignItems: "center" }}><Link className="btn lime" href="/app/new">Wire up a wallet <span className="k">→</span></Link></div>
          </div>
        </div>
      )}
    </div>
  );
}
