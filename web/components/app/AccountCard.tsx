"use client";
import { useEffect, useState } from "react";
import { erc20Abi, formatUnits } from "viem";
import { DEP, pub } from "@/lib/client-chain";
import { OKLINK, short, useBlock } from "@/lib/hooks";
import { useWallet } from "./WalletProvider";
import { Glyph, Plate } from "./Pixel";
import { useLang } from "@/lib/i18n";

const okb = (v: string) => { const n = Number(v); return n === 0 ? "0" : n < 0.0001 ? "<0.0001" : n.toFixed(4); };
const usd = (v: string) => Number(v).toFixed(2);

/** The connected account as a lime key card: who, OKB for gas, USD₮0, the network; then OKLink and Disconnect.
 *  `compact` is the desktop account menu's size. */
export default function AccountCard({ compact = false }: { compact?: boolean }) {
  const { account, walletName, disconnect } = useWallet();
  const { t } = useLang();
  const block = useBlock();
  const [bal, setBal] = useState<{ okb: string; usd: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!account) return;
    let live = true;
    const pull = () => Promise.all([
      pub.getBalance({ address: account }),
      pub.readContract({ address: DEP.usdt0 as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
    ]).then(([o, u]) => { if (live) setBal({ okb: formatUnits(o, 18), usd: formatUnits(u, 6) }); }).catch(() => {});
    pull(); const id = setInterval(pull, 15_000);
    return () => { live = false; clearInterval(id); };
  }, [account]);
  useEffect(() => { if (!copied) return; const id = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(id); }, [copied]);

  if (!account) return null;
  return (
    <div className={`kc${compact ? " kc-sm" : ""}`}>
      <div className="kc-card">
        <div className="kc-top">
          <Plate address={account} size={compact ? 36 : 44} color="var(--lime-ink)" />
          <div className="kc-who"><span className="m">{t("Connected", "已连接")}{walletName ? ` · ${walletName}` : ""}</span><span className="kc-addr">{short(account)}</span></div>
          <button className="kc-copy" onClick={() => { navigator.clipboard?.writeText(account); setCopied(true); }} aria-label={copied ? t("Address copied", "地址已复制") : t("Copy address", "复制地址")} title={copied ? t("Copied", "已复制") : t("Copy address", "复制地址")}>
            <Glyph name={copied ? "approve" : "copy"} size={16} />
          </button>
        </div>
        <div className="kc-dots" aria-hidden="true" />
        <div className="kc-bal">
          <div><span className="m">{t("OKB · pays gas", "OKB · 支付 gas")}</span><span className="kc-num">{bal ? okb(bal.okb) : "…"}</span></div>
          <div><span className="m">USD₮0</span><span className="kc-num">{bal ? usd(bal.usd) : "…"}</span></div>
        </div>
        <div className="kc-net m"><span><i className="kc-live" />{compact ? "X Layer 196" : t("X Layer · chain 196", "X Layer · 链 196")}</span><span>{block ? t(`Block ${block.toLocaleString("en-US")}`, `区块 ${block.toLocaleString("en-US")}`) : ""}</span></div>
      </div>
      <div className="kc-acts m">
        <a href={`${OKLINK}/address/${account}`} target="_blank" rel="noreferrer">OKLink <span aria-hidden="true">↗</span></a>
        <button className="out" onClick={disconnect}>{t("Disconnect", "断开连接")}</button>
      </div>
      <span className="sr" aria-live="polite">{copied ? t("Address copied", "地址已复制") : ""}</span>
    </div>
  );
}
