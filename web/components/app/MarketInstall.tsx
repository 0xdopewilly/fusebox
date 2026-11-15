"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useTxQueue } from "@/lib/useTxQueue";
import { useMyWallets } from "@/lib/useMyWallets";
import { short } from "@/lib/hooks";
import { InstallFuse } from "./OwnerConsole";
import { useWallet } from "./WalletProvider";

/** "Install on a wallet" for one market fuse: pick one of your wallets, set the fuse's limits, sign once. */
export default function MarketInstall({ fuseId, name }: { fuseId: number; name: string }) {
  const { account, wallets, connect } = useWallet();
  const q = useTxQueue<object>();
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const mine = useMyWallets(open ? account : null, nonce);
  const [w, setW] = useState("");
  useEffect(() => { if (mine?.length && !mine.some((m) => m.address === w)) setW(mine[0].address); }, [mine, w]);
  const sel = mine?.find((m) => m.address === w) ?? null;
  const cur = q.steps[q.steps.length - 1];
  const status = cur ? `${cur.label}: ${cur.state === "done" ? "done" : cur.state === "error" ? cur.error : cur.state === "mine" ? "confirming on X Layer…" : "sign in your wallet…"}` : "";
  const one = (label: string, run: () => Promise<`0x${string}` | null>) => { q.start([{ id: label, label, run }], {}).then((ok) => { if (ok) setNonce((n) => n + 1); }); };
  return (
    <div className="mk-install">
      <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close" : "Install on a wallet"}</button>
      {open && (
        <div className="mk-panel m">
          {!account ? (wallets.length
            ? <>{wallets.map((x) => <button key={x.info.rdns} className="btn lime" onClick={() => connect(x.info.rdns)}>Connect {x.info.name}</button>)}<p className="mute">Connect the wallet that owns your Fusebox wallet.</p></>
            : <p className="mute">No wallet in this browser. <a className="lime" href="https://web3.okx.com/download" target="_blank" rel="noreferrer">Get OKX Wallet ↗</a></p>)
            : mine === null ? <p className="mute">Reading your wallets from X Layer…</p>
            : mine.length === 0 ? <p className="mute">{short(account)} owns no Fusebox wallet yet. <Link className="lime" href="/app/new">Wire one up →</Link></p>
            : (
              <>
                <label className="oc-f"><span>Wallet</span>
                  <select aria-label={`Wallet to install ${name} on`} value={w} onChange={(e) => setW(e.target.value)}>
                    {mine.map((m) => <option key={m.address} value={m.address}>{short(m.address)} · {m.fuses} fuse{m.fuses === 1 ? "" : "s"}</option>)}
                  </select>
                </label>
                {sel && <InstallFuse key={sel.address} wallet={sel.address as Address} installed={sel.fuseIds} busy={q.running} one={one} preset={fuseId} lock />}
                {status && <p className={cur?.state === "error" ? "red" : "mute"} role="status">{status}{cur?.state === "done" && sel ? <> · <Link className="lime" href={`/app/w/${sel.address}`}>Open the wallet →</Link></> : null}</p>}
              </>
            )}
        </div>
      )}
    </div>
  );
}
