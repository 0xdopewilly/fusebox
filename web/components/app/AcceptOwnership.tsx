"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { getAddress, type Address } from "viem";
import { fuseboxWalletAbi } from "@/lib/abi";
import { pub } from "@/lib/client-chain";
import { short } from "@/lib/hooks";
import { txError } from "@/lib/txError";
import { useWallet } from "./WalletProvider";

/** Wallets this browser set up (Wire up keeps a list), to look for a handover still waiting. */
const setUpHere = (): Address[] => {
  try {
    const list = JSON.parse(localStorage.getItem("fusebox:mine") || "[]") as { address?: string }[];
    return [...new Set(list.map((x) => x.address).filter((a): a is string => !!a).map((a) => getAddress(a.toLowerCase())))];
  } catch { return []; }
};

/**
 * One-transaction setup hands a new wallet over in two steps: the helper starts the handover, the new owner accepts.
 * If someone stopped after the setup transaction, this shows the wallet waiting for them and finishes it in one tap.
 * Renders nothing unless the connected address is a wallet's pending owner.
 */
export default function AcceptOwnership({ wallet, onDone, style }: { wallet?: string; onDone?: () => void; style?: CSSProperties }) {
  const { account, write } = useWallet();
  const [waiting, setWaiting] = useState<Address[]>([]);
  const [busy, setBusy] = useState<Address | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!account) { setWaiting([]); return; }
    const list = wallet ? [getAddress(wallet.toLowerCase())] : setUpHere();
    let alive = true;
    Promise.all(list.map(async (w) => {
      const p = await pub.readContract({ address: w, abi: fuseboxWalletAbi, functionName: "pendingOwner" }).catch(() => null);
      return p && p.toLowerCase() === account.toLowerCase() ? w : null;
    })).then((r) => { if (alive) setWaiting(r.filter((x): x is Address => !!x)); });
    return () => { alive = false; };
  }, [account, wallet, nonce]);
  if (!waiting.length) return null;
  const accept = async (w: Address) => {
    setBusy(w); setErr(null);
    try {
      const hash = await write({ address: w, abi: fuseboxWalletAbi, functionName: "acceptOwnership" });
      await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
      setNonce((n) => n + 1); onDone?.();
    } catch (e) { setErr(txError(e)); } finally { setBusy(null); }
  };
  return (
    <div className="handover" role="status" style={style}>
      {waiting.map((w) => (
        <div key={w} className="handover-row">
          <div>
            <div className="m lime">Waiting for you</div>
            <p>Wallet <span className="m">{short(w)}</span> is being handed to you. It becomes yours, and only yours, once you accept it.</p>
          </div>
          <button className="btn lime" disabled={!!busy} onClick={() => accept(w)}>{busy === w ? "Accepting…" : "Make it yours"} <span className="k">→</span></button>
        </div>
      ))}
      {err && <p className="m red" style={{ marginTop: 8 }}>{err}</p>}
    </div>
  );
}
