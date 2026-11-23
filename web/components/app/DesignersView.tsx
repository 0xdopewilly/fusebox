"use client";
import Link from "next/link";
import { useMarket } from "@/lib/useMarket";
import { short, fmt, OKLINK } from "@/lib/hooks";
import DesignerTools from "./DesignerTools";
import Loading from "./Loading";
import { Responsive } from "./m/useMobile";
import SellMobile from "./m/SellMobile";
import { useLang } from "@/lib/i18n";

const STEPS = [
  ["Design the circuit", "Write it as NAND gates (plus LATCH bits if it needs memory) with the Fusebox toolchain, which builds, simulates and exhaustively tests TAP-02 netlists. It reads one socket: the payment's inputs, laid out bit by bit."],
  ["Tape it out on TapeOut", "Mint one transistor per gate on an X Layer processor and call tapeout(). You get the circuit NFT. Our four fuses cost about 0.03 OKB in total."],
  ["List it in the registry", "registry.list(processor, circuitId, socket, netlistHash, fee, uri). The registry checks the processor's code, the gate budget and the netlist hash, then wallets can install it."],
  ["Earn on every decision", "Each time a wallet's payment runs through your fuse, you earn your fee in USD₮0, the no's included. Claim with claim(fuseId, to). Sell the NFT and the income moves with it."],
];
const STEPS_ZH = [
  ["设计电路", "用 NAND 门写出它（需要记忆时再加 LATCH 位），借助 Fusebox 工具链：它可以构建、模拟并穷举测试 TAP-02 网表。电路读取一个插槽：付款的各项输入，逐位排列。"],
  ["在 TapeOut 上流片", "在 X Layer 的处理器上为每个门铸造一个晶体管，然后调用 tapeout()。你会得到电路 NFT。我们的四个保险丝总共花了约 0.03 OKB。"],
  ["在注册表中上架", "registry.list(processor, circuitId, socket, netlistHash, fee, uri)。注册表会检查处理器的代码、门数预算和网表哈希，之后钱包就可以安装它。"],
  ["每次决策都有收益", "每当钱包的付款经过你的保险丝，你就以 USD₮0 赚取费用，拒绝的也算。用 claim(fuseId, to) 领取。卖掉 NFT，收入也随之转移。"],
];

export default function DesignersView() {
  const { data, error } = useMarket();
  const { t, zh } = useLang();
  const byDesigner = new Map<string, { fuses: number; decisions: number; life: number; earned: number }>();
  data?.fuses.forEach((f) => { const d = byDesigner.get(f.designer) ?? { fuses: 0, decisions: 0, life: 0, earned: 0 }; d.fuses++; d.decisions += f.decisions; d.life += Number(f.lifetimeEarned); d.earned += Number(f.earned); byDesigner.set(f.designer, d); });
  return <Responsive mobile={data ? <SellMobile market={data} /> : <div className="page"><Loading label={t("Reading the fuse registry", "正在读取保险丝注册表")} error={error} /></div>} desktop={
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <section className="try-head">
        <h1 className="disp" data-a>{t(<>Sell a <span className="lime">[fuse]</span>.</>, <>出售<span className="lime">[保险丝]</span>。</>)}</h1>
        <p data-a>{t(<>A fuse is a product. Tape out a circuit once, list it, and it pays you {data ? `${100 - data.protocolBps / 100}%` : "90%"} of its fee every time a wallet runs a payment through it. No toolchain needed: <Link className="lime" href="/app/studio">build, prove and tape one out in Fuse Studio →</Link></>, <>保险丝是一件产品。电路流片一次、上架之后，每当钱包有付款经过它，你就能拿到其费用的 {data ? `${100 - data.protocolBps / 100}%` : "90%"}。无需工具链：<Link className="lime" href="/app/studio">在 Fuse Studio 中构建、证明并流片 →</Link></>)}</p>
      </section>
      <h2 className="sr">{t("How to sell a fuse", "如何出售保险丝")}</h2>
      <section data-a>
        {(zh ? STEPS_ZH : STEPS).map(([h, p], i) => (
          <div className="fz" key={i} style={{ minHeight: 0 }}>
            <div><div className="ix">0{i + 1}</div></div>
            <div style={{ gridColumn: "2 / 4" }}><h3>{h}</h3></div>
            <div style={{ gridColumn: "4 / 7" }}><p className="say" style={{ maxWidth: 560 }}>{p}</p></div>
          </div>
        ))}
      </section>
      <div className="blockhead" data-a><h2 className="disp">{t("Earnings", "收益")}</h2><span className="m mute">{t("read from the registry", "读取自注册表")} · {data ? t(`protocol keeps ${data.protocolBps / 100}%, earned ${fmt(data.protocolEarned)} USD₮0`, `协议保留 ${data.protocolBps / 100}%，已赚 ${fmt(data.protocolEarned)} USD₮0`) : ""}</span></div>
      {!data ? <Loading label={t("Reading the fuse registry", "正在读取保险丝注册表")} error={error} /> : (
        <div style={{ overflowX: "auto" }} data-a tabIndex={0} role="region" aria-label={t("Earnings table", "收益表")}>
          <table className="tbl">
            <thead><tr><th>{t("Designer", "设计者")}</th><th style={{ textAlign: "right" }}>{t("Fuses", "保险丝")}</th><th style={{ textAlign: "right" }}>{t("Decisions", "决策")}</th><th style={{ textAlign: "right" }}>{t("Lifetime earned", "累计收益")}</th><th style={{ textAlign: "right" }}>{t("Claimable now", "当前可领取")}</th></tr></thead>
            <tbody>
              {[...byDesigner].map(([d, v]) => (
                <tr key={d}>
                  <td className="num" style={{ textAlign: "left" }}><a className="tx" href={`${OKLINK}/address/${d}`} target="_blank" rel="noreferrer">{short(d)} ↗</a></td>
                  <td className="num">{v.fuses}</td><td className="num">{v.decisions}</td>
                  <td className="num lime">{v.life.toFixed(6)}</td><td className="num">{v.earned.toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="proof m">{t("Every row is the registry's own ledger: fees are charged in the same call as each decision, so earnings move the moment a wallet uses a fuse.", "每一行都来自注册表自己的账本：费用在每次决策的同一笔调用中收取，所以钱包一用保险丝，收益就立刻到账。")}</p>
        </div>
      )}
      <DesignerTools market={data} />
    </div>
  } />;
}
