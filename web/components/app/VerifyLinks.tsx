"use client";
import { useEffect, useState } from "react";
import { OKLINK, short } from "@/lib/hooks";
import { DEP } from "@/lib/client-chain";
import { useLang } from "@/lib/i18n";

const REGISTRY = (DEP.v2 as { registry: string }).registry;
const ORDER_GUARD = "0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355";

/**
 * "Check it yourself": where anyone can confirm a fuse on X Layer without trusting Fusebox's pages. TapeOut's own app
 * keeps its routes in memory (a link to a circuit opens its home page), so for TapeOut this gives the click path.
 */
export default function VerifyLinks({ processor, circuitId, fuseId }: { processor: string; circuitId: number; fuseId: number }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const id = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(id); }, [copied]);
  const procName = processor.toLowerCase() === ORDER_GUARD.toLowerCase() ? "OrderGuard" : short(processor);
  const rows: [string, string, string][] = [
    [t("Circuit NFTs on OKLink", "OKLink 上的电路 NFT"), `${OKLINK}/token/${processor}`, t(`The processor's collection. #${circuitId} is this fuse; its holder is the designer.`, `处理器的 NFT 合集。#${circuitId} 就是这个保险丝，持有者即设计者。`)],
    [t("Fuse registry on Sourcify", "Sourcify 上的保险丝注册表"), `https://repo.sourcify.dev/196/${REGISTRY}`, t(`Verified source of the registry where fuse ${fuseId} is listed, with its netlist hash pinned.`, `保险丝 ${fuseId} 上架所在注册表的已验证源码，网表哈希在此锁定。`)],
  ];
  return (
    <div className="vfy">
      <h2 className="m fv-h">{t("Check it yourself", "自己核验")}</h2>
      <ul className="vfy-list">
        {rows.map(([k, href, sub]) => (
          <li key={href}><a href={href} target="_blank" rel="noreferrer"><b className="m">{k} ↗</b><span>{sub}</span></a></li>
        ))}
        <li>
          <a href="https://tapeout.net" target="_blank" rel="noreferrer"><b className="m">{t("On TapeOut ↗", "在 TapeOut 上 ↗")}</b>
            <span>{t(<>tapeout.net → X Layer → Processors → {procName} → circuit #{circuitId}</>, <>tapeout.net → X Layer → Processors → {procName} → 电路 #{circuitId}</>)}</span></a>
          <button type="button" className="vfy-copy m" onClick={() => { navigator.clipboard?.writeText(processor); setCopied(true); }}>{copied ? t("Copied", "已复制") : t("Copy processor address", "复制处理器地址")}</button>
        </li>
      </ul>
    </div>
  );
}
