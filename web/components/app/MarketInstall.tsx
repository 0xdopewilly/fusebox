"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useTxQueue } from "@/lib/useTxQueue";
import { useMyWallets } from "@/lib/useMyWallets";
import { short } from "@/lib/hooks";
import { InstallFuse } from "./OwnerConsole";
import { useWallet } from "./WalletProvider";
import ConnectChoices from "./ConnectChoices";
import { useLang } from "@/lib/i18n";
import { errZh } from "@/lib/errZh";

/** "Install on a wallet" for one market fuse: pick one of your wallets, set the fuse's limits, sign once. */
export default function MarketInstall({ fuseId, name }: { fuseId: number; name: string }) {
  const { account } = useWallet();
  const { t, zh } = useLang();
  const q = useTxQueue<object>();
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const mine = useMyWallets(open ? account : null, nonce);
  const [w, setW] = useState("");
  useEffect(() => { if (mine?.length && !mine.some((m) => m.address === w)) setW(mine[0].address); }, [mine, w]);
  const sel = mine?.find((m) => m.address === w) ?? null;
  const cur = q.steps[q.steps.length - 1];
  const status = cur ? `${cur.label}${t(": ", "：")}${cur.state === "done" ? t("done", "完成") : cur.state === "error" ? (zh && cur.error ? errZh(cur.error) : cur.error) : cur.state === "mine" ? t("confirming on X Layer…", "正在 X Layer 上确认…") : t("sign in your wallet…", "请在钱包中签名…")}` : "";
  const one = (label: string, run: () => Promise<`0x${string}` | null>) => { q.start([{ id: label, label, run }], {}).then((ok) => { if (ok) setNonce((n) => n + 1); }); };
  return (
    <div className="mk-install">
      <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? t("Close", "关闭") : t("Install on a wallet", "安装到钱包")}</button>
      {open && (
        <div className="mk-panel m">
          {!account ? <><p className="mute">{t("Connect the wallet that owns your Fusebox wallet.", "连接持有你的 Fusebox 钱包的钱包。")}</p><ConnectChoices /></>
            : mine === null ? <p className="mute">{t("Reading your wallets from X Layer…", "正在从 X Layer 读取你的钱包…")}</p>
            : mine.length === 0 ? <p className="mute">{t(<>{short(account)} owns no Fusebox wallet yet. <Link className="lime" href="/app/new">Wire one up →</Link></>, <>{short(account)} 还没有 Fusebox 钱包。<Link className="lime" href="/app/new">搭建一个钱包 →</Link></>)}</p>
            : (
              <>
                <label className="oc-f"><span>{t("Wallet", "钱包")}</span>
                  <select aria-label={t(`Wallet to install ${name} on`, `要安装 ${name} 的钱包`)} value={w} onChange={(e) => setW(e.target.value)}>
                    {mine.map((m) => <option key={m.address} value={m.address}>{short(m.address)} · {t(`${m.fuses} fuse${m.fuses === 1 ? "" : "s"}`, `${m.fuses} 个保险丝`)}{m.version === "v1" ? " · v1" : ""}</option>)}
                  </select>
                </label>
                {sel && <InstallFuse key={sel.address} wallet={sel.address as Address} version={sel.version} installed={sel.fuseIds} busy={q.running} one={one} preset={fuseId} lock />}
                {status && <p className={cur?.state === "error" ? "red" : "mute"} role="status">{status}{cur?.state === "done" && sel ? <> · <Link className="lime" href={`/app/w/${sel.address}`}>{t("Open the wallet →", "打开钱包 →")}</Link></> : null}</p>}
              </>
            )}
        </div>
      )}
    </div>
  );
}
