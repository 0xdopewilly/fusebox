"use client";
import Link from "next/link";
import { ATLAS_PATH } from "./HomeView";
import { useMarket } from "@/lib/useMarket";
import { LAYERS } from "@/lib/fuses";
import { SOCKETS } from "@/lib/sockets";
import { metaSource } from "@/lib/fuseMeta";
import { short, fmt, OKLINK } from "@/lib/hooks";
import Netlist from "@/components/landing/Netlist";
import ChainNetlist from "./ChainNetlist";
import MarketInstall from "./MarketInstall";
import Loading from "./Loading";
import { Responsive } from "./m/useMobile";
import { FuseMobile, textZh } from "./m/MarketMobile";
import { useLang } from "@/lib/i18n";

/** "Daily Cap" → Daily [Cap]. ; one word → [Breaker]. */
function Title({ name }: { name: string }) {
  const w = name.trim().split(/\s+/);
  const last = w.pop();
  return <h1 className="disp" data-a>{w.length ? `${w.join(" ")} ` : ""}<span className="lime">[{last}]</span>.</h1>;
}

/** One fuse's own page: what it decides, its real netlist from TapeOut, its pinout, its numbers, and an install button. */
export default function FuseView({ id }: { id: number }) {
  const { data, error } = useMarket();
  const { t, zh } = useLang();
  const grid = <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>;
  if (!data) return <div className="page">{grid}<Loading label={t("Reading the fuse registry", "正在读取保险丝注册表")} error={error} /></div>;
  const f = data.fuses.find((x) => x.fuseId === id);
  if (!f) return (
    <div className="page">{grid}
      <section className="try-head"><h1 className="disp" data-a>{t(<>No fuse <span className="red">[#{id}]</span>.</>, <>没有保险丝 <span className="red">[#{id}]</span>。</>)}</h1><p data-a>{t("The registry on X Layer has no fuse with that number.", "X Layer 上的注册表里没有这个编号的保险丝。")}</p></section>
      <div className="fv-back m"><Link className="lime" href="/app/market">{t("← The fuse market", "← 保险丝市场")}</Link></div>
    </div>
  );
  const spec = SOCKETS[f.socket];
  const layout = f.original ? LAYERS.find((l) => l.key === f.key) : undefined;
  const meta = f.meta;
  const name = meta?.name ?? f.name;
  const src = metaSource(f.metadataURI);
  const since = f.listedAt ? new Date(f.listedAt * 1000).toISOString().slice(0, 10) : "—";
  return <Responsive mobile={<FuseMobile data={data} f={f} />} desktop={
    <div className="page">
      {grid}
      <section className="try-head">
        <div className="m fv-eyebrow" data-a><span className="lime">[{t("Fuse", "保险丝")} {f.fuseId}]</span> <span className="mute">{t(<>{spec?.name ?? `Socket ${f.socket}`} socket · circuit #{f.circuitId} on TapeOut · {f.listed ? "listed" : "delisted"}</>, <>{spec?.name ?? `插槽 ${f.socket}`} 插槽 · TapeOut 上的电路 #{f.circuitId} · {f.listed ? "已上架" : "已下架"}</>)}</span></div>
        <Title name={name} />
        <p data-a>{textZh(meta?.summary ?? (f.original ? spec?.say : "") ?? "", zh)}</p>
      </section>

      <section className="stats m mute" data-a>
        <div>{t("Fee per check", "每次检查费用")}<b>{fmt(f.fee)}<small>USD₮0</small></b></div>
        <div>{t("Decisions", "决策次数")}<b>{f.decisions}</b></div>
        <div>{t("Earned", "收益")}<b>{Number(f.lifetimeEarned).toFixed(5)}<small>USD₮0</small></b></div>
        <div>{t("Gates", "门数")}<b>{f.gates}<small>{f.nState ? t(`+ ${f.nState} latch`, `+ ${f.nState} 锁存器`) : "NAND"}</small></b></div>
        <div>{t("Inputs", "输入")}<b>{f.nIn}</b></div>
        <div>{t("Listed", "上架时间")}<b style={{ fontSize: 20, marginTop: 14 }}>{since}</b></div>
      </section>

      <h2 className="sr">{t("How it decides", "它如何决策")}</h2>
      <section className="fv" data-a>
        <div className="fv-sch">
          <div className="m mute fv-k">{t("Netlist · read from TapeOut", "网表 · 读取自 TapeOut")}</div>
          <div className="sch">{layout && <Netlist f={layout} />}<ChainNetlist processor={f.processor} circuitId={f.circuitId} nIn={f.nIn} pinned={f.netlistHash} draw={!layout} /></div>
        </div>
        <div className="fv-say">
          {meta?.description && <p>{textZh(meta.description, zh)}</p>}
          {meta?.rule && <div className="fv-rule m"><span className="mute">{t("Rule", "规则")}</span><code>{meta.rule}</code></div>}
          {f.listed ? <MarketInstall fuseId={f.fuseId} name={name} /> : <p className="m red">{t("Delisted: wallets already running it keep it, but it can't be installed.", "已下架：已在使用它的钱包会继续保留，但无法再安装。")}</p>}
          {f.listed && <Link className="m lime" href={`/app/simulate?f=${f.fuseId}`}>{t("Try it on payments in the simulator →", "在模拟器里用付款试试 →")}</Link>}
        </div>
      </section>

      <section className="fv-cols" data-a>
        <div>
          <h2 className="m fv-h">{t("Pinout · what the wallet tells it", "引脚 · 钱包告诉它什么")}</h2>
          <div className="tbl-w" tabIndex={0} role="region" aria-label={t("Pinout", "引脚")}>
            <table className="tbl fv-pins">
              <thead><tr><th>{t("Pin", "引脚")}</th><th>{t("Bits", "位数")}</th><th>{t("Meaning", "含义")}</th></tr></thead>
              <tbody>{(spec?.pins ?? []).map(([p, n, d]) => <tr key={p}><td className="m lime">{p}</td><td className="m">{n}</td><td>{textZh(d, zh)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="m mute fv-note">{t("Every input is derived by the wallet from its own state. The agent's memo never reaches the circuit. One output bit: 1 lets the payment through.", "每个输入都由钱包根据自身状态得出。智能体的备注永远到不了电路。一个输出位：1 表示放行这笔付款。")}</p>
        </div>
        <div>
          <h2 className="m fv-h">{t("On X Layer", "在 X Layer 上")}</h2>
          <div className="m kv fv-kv">
            <span>{t("Processor", "处理器")}</span><span><a href={`${OKLINK}/address/${f.processor}`} target="_blank" rel="noreferrer">{short(f.processor)} ↗</a></span>
            <span>{t("Circuit", "电路")}</span><span>#{f.circuitId}</span>
            <span>{t("Designer", "设计者")}</span><span><a href={`${OKLINK}/address/${f.designer}`} target="_blank" rel="noreferrer">{short(f.designer)} ↗</a>{meta?.designer ? ` · ${meta.designer}` : ""}</span>
            <span>{t("Netlist hash", "网表哈希")}</span><span title={f.netlistHash}>{f.netlistHash.slice(0, 10)}…{f.netlistHash.slice(-6)}</span>
            <span>{t("Description", "描述")}</span><span>{src === "on-chain" ? t("stored on-chain", "存储在链上") : src === "link" ? <a href={f.metadataURI.startsWith("https") ? f.metadataURI : undefined} target="_blank" rel="noreferrer">{f.metadataURI.slice(0, 32)}…</a> : t("none", "无")}</span>
            {meta?.source && <><span>{t("Source", "源码")}</span><span><a href={meta.source} target="_blank" rel="noreferrer">{t("code ↗", "代码 ↗")}</a></span></>}
            <span>{t("Revenue split", "收入分成")}</span><span>{t(`${100 - data.protocolBps / 100}% designer · ${data.protocolBps / 100}% Fusebox`, `设计者 ${100 - data.protocolBps / 100}% · Fusebox ${data.protocolBps / 100}%`)}</span>
          </div>
        </div>
      </section>
      <div className="fv-back m"><Link className="lime" href="/app/market">{t("← Every fuse", "← 所有保险丝")}</Link>{f.onAtlas ? <> · <Link className="lime" href={ATLAS_PATH}>{t("Running on Atlas →", "在 Atlas 上运行 →")}</Link></> : null}</div>
    </div>
  } />;
}
