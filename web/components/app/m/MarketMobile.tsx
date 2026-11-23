"use client";
import VerifyLinks from "../VerifyLinks";
import Link from "next/link";
import { ATLAS_PATH } from "../HomeView";
import { useState } from "react";
import { LAYERS } from "@/lib/fuses";
import { SOCKETS } from "@/lib/sockets";
import { metaSource } from "@/lib/fuseMeta";
import { OKLINK, fmt, short } from "@/lib/hooks";
import { useLang } from "@/lib/i18n";
import type { useMarket } from "@/lib/useMarket";
import Netlist from "@/components/landing/Netlist";
import ChainNetlist from "../ChainNetlist";
import MarketInstall from "../MarketInstall";
import { Glyph, type GlyphName } from "../Pixel";
import { PageChrome } from "./chrome";
import { MChips, MHero, MLabel, MRow, MSheet, MStats } from "./ui";

type Market = NonNullable<ReturnType<typeof useMarket>["data"]>;
type Fuse = Market["fuses"][number];
const GLYPH: Record<number, GlyphName> = { 1: "mine", 2: "approve", 3: "stop", 4: "x402" };
const KINDS = [["all", "All"], ["1", "Daily caps"], ["2", "Payees"], ["3", "Breakers"], ["4", "Approvals"]] as const;
const KINDS_ZH = [["all", "全部"], ["1", "每日限额"], ["2", "收款方"], ["3", "断路器"], ["4", "审批"]] as const;

/**
 * 简体中文 for the English text Fusebox itself wrote: the on-chain descriptions of its own fuses (1-9) and the socket
 * copy and pinout in lib/sockets. Display only, matched on the exact English; anything else (a designer's own words)
 * shows as written.
 */
const TEXT_ZH: Record<string, string> = {
  // fuse summaries, on-chain
  "No more than the owner's cap in a UTC day, however the agent is asked.": "无论智能体被怎么要求，一个 UTC 日内的付款都不会超过所有者设定的上限。",
  "Saved payees only, with a trial amount for new ones until their cooling-off ends.": "只付给已保存的收款方；新收款方在冷静期结束前只能收到试付额度。",
  "Trips on a payment to a stranger and stays blown until the owner resets it.": "一遇到付给陌生地址的付款就触发，并保持熔断，直到所有者重置。",
  "Above a threshold, two of three approvers must sign that exact payment.": "超过阈值时，三位审批人中必须有两位为这笔付款本身签名。",
  "The same invoice sent twice gets paid once.": "同一张发票发两次，只付一次。",
  "However many invoices arrive, no single payment can be bigger than the cap.": "无论来多少张发票，单笔付款都不能超过上限。",
  "A newly saved payee gets nothing, not even a test payment, until its cooling-off is over.": "新保存的收款方在冷静期结束前什么也收不到，连试付也没有。",
  "One odd payee is a typo; two is a pattern. The first is refused, the second blows the breaker.": "一个陌生收款方可能是笔误，两个就是规律。第一笔被拒绝，第二笔让它熔断。",
  "Above the threshold, two must sign and one of them must be seat 1.": "超过阈值时需要两人签名，且其中一人必须是席位 1。",
  // fuse descriptions, on-chain
  "Adds this payment to what the wallet has already spent today through this fuse and refuses it if the total would pass the owner's cap. An 8-bit adder feeds a no-borrow comparator; an overflow out of the adder also refuses, so no amount can wrap around the cap. Amounts are counted in whole steps of the install's unit (1 USDT0 by default), rounded up. Stateless: the wallet supplies today's spend.":
    "把这笔付款加到钱包今天经由这个保险丝已花的金额上，若总额会超过所有者的上限就拒绝。一个 8 位加法器接一个无借位比较器；加法器溢出同样拒绝，所以任何金额都无法绕回上限以内。金额按安装时的单位（默认 1 USDT0）整步计数，向上取整。无状态：今天的花费由钱包提供。",
  "Pays only addresses in the owner's payee book. A payee saved less than the cooling-off period ago can receive at most the trial amount, so a swapped bank detail or a poisoned address book can cost a test payment, never the invoice. A stranger gets nothing. Stateless: the wallet supplies the payee's age in hours.":
    "只付给所有者收款簿里的地址。保存时间短于冷静期的收款方最多只能收到试付额度，所以被替换的银行信息或被投毒的地址簿最多损失一笔试付，绝不会是整张发票。陌生地址什么也收不到。无状态：收款方已保存的小时数由钱包提供。",
  "One LATCH holds the breaker's state on X Layer. A payment attempt to an address outside the payee book trips it: that payment and every one after it is refused, even to good payees, until the owner sends a reset. The agent and the approvers can trip it on purpose (freeze); only the owner can clear it, and a freeze wins over a reset in the same beat.":
    "一个 LATCH 在 X Layer 上保存断路器的状态。向收款簿以外的地址尝试付款就会触发它：这笔付款以及之后的每一笔都会被拒绝，即使付给正常收款方也一样，直到所有者发送重置。智能体和审批人可以主动触发它（冻结）；只有所有者能清除，同一节拍里冻结优先于重置。",
  "Payments up to the owner's threshold pass. Above it, at least two of the three approver seats must have approved this exact payment (wallet, token, payee and amount) on-chain within the approval window. A majority gate over the three approval bits decides, so no single key, the agent's included, can push a large payment through.":
    "不超过所有者阈值的付款直接通过。超过阈值时，三个审批人席位中至少两个必须在审批窗口内于链上批准这笔付款本身（钱包、代币、收款方和金额）。由三个审批位上的多数门做决定，所以任何单个密钥（包括智能体的）都无法推动大额付款。",
  "The wallet remembers when each exact payment (token, payee and amount) last went out. A second one inside the owner's window is refused, so a resent invoice, a replayed request or an agent stuck in a loop can't pay twice. A real repeat goes through once the owner clears it, and the clearance is used up by that one payment. Two NAND gates; stateless: the wallet supplies the two bits.":
    "钱包记得每一笔完全相同的付款（代币、收款方和金额）上一次付出的时间。在所有者设定的窗口内再来一笔就会被拒绝，所以重发的发票、重放的请求或陷入循环的智能体都无法付两次。真正的重复付款在所有者放行后可以通过，放行只对那一笔有效。两个 NAND 门；无状态：两个位由钱包提供。",
  "Caps each payment on its own: however many invoices arrive in a day, none can be bigger than the owner's limit. It reads the same pins as Daily Cap and ignores today's spend, so pair it with Daily Cap for a per-day total too.":
    "单独限制每一笔付款：一天里无论来多少张发票，没有一笔能超过所有者的限额。它读取与 Daily Cap 相同的引脚，但忽略今天的花费；想同时限制每日总额，就和 Daily Cap 搭配使用。",
  "A payee book with no trial allowance: a newly saved address gets nothing, not even a test payment, until its cooling-off is over. For wallets that would rather wait a day than risk a swapped bank detail.":
    "没有试付额度的收款簿：新保存的地址在冷静期结束前什么也收不到，连试付也没有。适合宁愿等一天、也不愿冒银行信息被替换风险的钱包。",
  "Two LATCHes. A payment to a stranger is refused and remembered as a strike; good payments keep flowing. A second stranger blows the breaker, and then everything is refused until the owner resets it. Freeze still blows it at once.":
    "两个 LATCH。付给陌生地址的付款会被拒绝并记一次；正常付款照常进行。第二个陌生地址会让断路器熔断，之后所有付款都被拒绝，直到所有者重置。冻结仍会让它立即熔断。",
  "Above the threshold two approvals are needed, and seat 1 (say, the finance lead) must be one of them. Two junior seats together can't move a large payment.":
    "超过阈值需要两次批准，且其中一次必须来自席位 1（比如财务负责人）。两个普通席位加在一起也无法推动大额付款。",
  // lib/sockets: what each socket decides
  "No more than the cap in a UTC day, however the agent is asked.": "无论智能体被怎么要求，一个 UTC 日内的付款都不会超过上限。",
  "Saved payees only; a newly saved payee gets a trial amount until its cooling-off ends.": "只付给已保存的收款方；新保存的收款方在冷静期结束前只能收到试付额度。",
  "The same payment (payee and amount) twice inside the window is stopped, unless the owner clears it once.": "窗口期内同一笔付款（同一收款方、同一金额）第二次会被拦截，除非所有者放行一次。",
  // lib/sockets: the pinout
  "this payment in units, rounded up (255 for another token)": "本笔付款的单位数，向上取整（其他代币为 255）",
  "spent today through this slot, in units": "今天经由此插槽已花费的单位数",
  "the owner's daily cap in units (0 to 254)": "所有者的每日限额单位数（0 到 254）",
  "the payee is in the owner's payee book": "收款方在所有者的收款簿中",
  "hours since the payee was saved (0 if not)": "收款方保存至今的小时数（未保存为 0）",
  "the install's cooling-off, in hours": "本次安装的冷静期，单位为小时",
  "this payment in units (255 for another token)": "本笔付款的单位数（其他代币为 255）",
  "largest payment to a payee still cooling off": "冷静期内收款方可收的最大付款",
  "owner or agent freeze (control beats)": "所有者或智能体冻结（控制节拍）",
  "owner reset (control beats)": "所有者重置（控制节拍）",
  "1 on every payment decision": "每次付款决策时为 1",
  "the payee isn't in the payee book": "收款方不在收款簿中",
  "bit k: seat k approved this exact payment in time": "第 k 位：席位 k 已及时批准这笔付款",
  "payments up to this need no approval": "不超过此金额的付款无需审批",
  "this exact payment (token, payee, amount) already went out inside the window": "这笔完全相同的付款（代币、收款方、金额）已在窗口期内付出",
  "the owner cleared one repeat of it, not yet used or expired": "所有者已放行一次重复，尚未使用或过期",
};
/** Fusebox's own fuse and socket copy in Chinese when `zh`; any other text as it was. */
export const textZh = (s: string, zh: boolean) => (zh ? TEXT_ZH[s.trim()] ?? s : s);

/** A fuse's thumbnail: its real schematic for the four shipped fuses, its socket's mark for the rest. */
function Thumb({ f }: { f: Fuse }) {
  const layout = f.original ? LAYERS.find((l) => l.key === f.key) : undefined;
  return layout ? <span className="mr-net"><Netlist f={layout} /></span> : <Glyph name={GLYPH[f.socket] ?? "studio"} size={18} />;
}

/** The market on a phone: three numbers, a filter, one row per fuse with its price; a row opens the fuse's screen. */
export function MarketMobile({ data }: { data: Market }) {
  const { t, zh } = useLang();
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("all");
  const list = data.fuses.filter((f) => kind === "all" || String(f.socket) === kind);
  return (
    <div className="mpage">
      <PageChrome title={t("Fuse market", "保险丝市场")} sub={t("TapeOut circuits you can install", "可安装的 TapeOut 电路")}
        info={t(<>
          <p>Every fuse here is a NAND circuit taped out on TapeOut and listed in Fusebox&apos;s registry on X Layer.</p>
          <p>Wallets install fuses on their line. Each time a fuse checks a payment, the wallet pays its fee: {100 - data.protocolBps / 100}% to the fuse&apos;s designer, {data.protocolBps / 100}% to Fusebox (capped at 20%).</p>
          <p>Protocol earned so far: {Number(data.protocolEarned).toFixed(5)} USD₮0. Processor {data.fuses[0] ? short(data.fuses[0].processor) : "—"}.</p>
        </>, <>
          <p>这里的每个保险丝都是在 TapeOut 上流片、并在 X Layer 上的 Fusebox 注册表中上架的 NAND 电路。</p>
          <p>钱包把保险丝安装在自己的线路上。保险丝每检查一笔付款，钱包就支付它的费用：{100 - data.protocolBps / 100}% 给保险丝的设计者，{data.protocolBps / 100}% 给 Fusebox（上限 20%）。</p>
          <p>协议累计收益：{Number(data.protocolEarned).toFixed(5)} USD₮0。处理器 {data.fuses[0] ? short(data.fuses[0].processor) : "—"}。</p>
        </>)} />
      <MStats items={[[t("Fuses", "保险丝"), data.fuses.length], [t("Decisions", "决策"), data.totalDecisions], [t("Paid out", "已支付"), Number(data.totalEarned).toFixed(3), "USD₮0"]]} />
      <MChips label={t("Filter fuses", "筛选保险丝")} items={zh ? KINDS_ZH : KINDS} value={kind} onChange={setKind} />
      <div className="mrows">
        {list.map((f) => (
          <MRow key={f.fuseId} href={`/app/fuse/${f.fuseId}`} icon={<Thumb f={f} />} className="has-thumb"
            title={f.meta?.name ?? f.name} sub={`${(f.meta?.name ?? f.name) !== SOCKETS[f.socket]?.name ? `${SOCKETS[f.socket]?.name ?? t("Fuse", "保险丝")} · ` : ""}TapeOut #${f.circuitId}${f.onAtlas ? t(" · on Atlas", " · 在 Atlas 上") : ""}${f.listed ? "" : t(" · delisted", " · 已下架")}`}
            value={fmt(f.fee, 4)} valueSub={t("per check", "每次检查")} />
        ))}
        {!list.length && <p className="mnote" style={{ padding: "14px 0" }}>{t("No fuse of this kind is listed yet.", "这一类还没有上架的保险丝。")}</p>}
      </div>
      <MRow href="/app/studio" className="dashed" icon={<Glyph name="studio" size={18} />} title={t("Your fuse here", "你的保险丝")} sub={t("Design one, earn on every decision", "设计一个，每次决策都有收益")} />
    </div>
  );
}

/** One fuse on a phone: its price, its netlist, install; the pinout and on-chain details sit in sheets. */
export function FuseMobile({ data, f }: { data: Market; f: Fuse }) {
  const { t, zh } = useLang();
  const [sheet, setSheet] = useState<"pins" | "chain" | null>(null);
  const spec = SOCKETS[f.socket];
  const layout = f.original ? LAYERS.find((l) => l.key === f.key) : undefined;
  const meta = f.meta;
  const name = meta?.name ?? f.name;
  const src = metaSource(f.metadataURI);
  const say = textZh(meta?.summary ?? spec?.say ?? "", zh);
  return (
    <div className="mpage">
      <PageChrome title={name} sub={`${spec?.name ?? `${t("Socket", "插槽")} ${f.socket}`} · ${t("circuit", "电路")} #${f.circuitId}`} back="/app/market"
        info={<><p>{say}</p>{meta?.description && <p>{textZh(meta.description, zh)}</p>}<p>{t("The wallet derives every input from its own state. The agent's memo never reaches the circuit; one output bit decides.", "每个输入都由钱包根据自身状态得出。智能体的备注永远到不了电路；由一个输出位决定。")}</p></>} />
      <MHero label={t("Fee per check", "每次检查费用")} right={f.listed ? t("Listed", "已上架") : t("Delisted", "已下架")} value={fmt(f.fee, 4)} unit="USD₮0"
        foot={<><span>{t(`${f.decisions} decisions`, `${f.decisions} 次决策`)}</span><span>{t("Earned", "收益")} {Number(f.lifetimeEarned).toFixed(4)}</span></>} />
      <p className="mcap">{say}</p>
      <div className="mcard m-net">
        <div className="m mute" style={{ marginBottom: 8 }}>{t("Netlist · read from TapeOut", "网表 · 读取自 TapeOut")}</div>
        <div className="sch">{layout && <Netlist f={layout} />}<ChainNetlist processor={f.processor} circuitId={f.circuitId} nIn={f.nIn} pinned={f.netlistHash} draw={!layout} /></div>
      </div>
      <MStats items={[[t("Gates", "门"), f.gates, f.nState ? t(`+${f.nState} latch`, `+${f.nState} 锁存器`) : undefined], [t("Inputs", "输入"), f.nIn], [t("Listed", "上架"), f.listedAt ? new Date(f.listedAt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "—"]]} />
      {meta?.rule && <div className="mcard" style={{ padding: 12 }}><div className="m mute">{t("Rule", "规则")}</div><code className="m" style={{ display: "block", marginTop: 8, color: "var(--ink)", textTransform: "none", letterSpacing: 0, overflowWrap: "anywhere" }}>{meta.rule}</code></div>}
      {f.listed ? <MarketInstall fuseId={f.fuseId} name={name} /> : <p className="mnote" style={{ color: "var(--red)" }}>{t("Delisted: wallets already running it keep it, but it can't be installed.", "已下架：已在使用它的钱包会继续保留，但无法再安装。")}</p>}
      <MLabel>{t("More", "更多")}</MLabel>
      <div className="mrows">
        {f.listed && <MRow href={`/app/simulate?f=${f.fuseId}`} icon={<Glyph name="sim" size={16} />} title={t("Try it on payments", "用付款试试")} sub={t("In the line simulator", "在线路模拟器里")} />}
        <MRow onClick={() => setSheet("pins")} icon={<Glyph name="docs" size={16} />} title={t("Pinout", "引脚")} sub={t("What the wallet tells the circuit", "钱包告诉电路什么")} />
        <MRow onClick={() => setSheet("chain")} icon={<Glyph name="ext" size={16} />} title={t("On X Layer", "在 X Layer 上")} sub={t("Processor, designer, netlist hash, where to check it", "处理器、设计者、网表哈希，以及在哪里核验")} />
        {f.onAtlas && <MRow href={ATLAS_PATH} icon={<Glyph name="mine" size={16} />} title={t("Running on Atlas", "在 Atlas 上运行")} sub={t("See it decide live", "实时看它决策")} />}
      </div>
      <MSheet open={sheet === "pins"} onClose={() => setSheet(null)} title={t("Pinout", "引脚")}>
        <div className="mrows">{(spec?.pins ?? []).map(([p, n, d]) => <MRow key={p} title={<span className="m lime" style={{ fontSize: 13 }}>{p}</span>} sub={textZh(d, zh)} value={n} valueSub={t("bits", "位")} chev={false} />)}</div>
        <p className="mnote">{t("One output bit: 1 lets the payment through.", "一个输出位：1 表示放行这笔付款。")}</p>
      </MSheet>
      <MSheet open={sheet === "chain"} onClose={() => setSheet(null)} title={t("On X Layer", "在 X Layer 上")}>
        <div className="mkv">
          <span>{t("Processor", "处理器")}</span><span><a href={`${OKLINK}/address/${f.processor}`} target="_blank" rel="noreferrer">{short(f.processor)} ↗</a></span>
          <span>{t("Circuit", "电路")}</span><span>#{f.circuitId}</span>
          <span>{t("Designer", "设计者")}</span><span><a href={`${OKLINK}/address/${f.designer}`} target="_blank" rel="noreferrer">{short(f.designer)} ↗</a></span>
          <span>{t("Netlist hash", "网表哈希")}</span><span>{f.netlistHash.slice(0, 10)}…{f.netlistHash.slice(-6)}</span>
          <span>{t("Description", "描述")}</span><span>{src === "on-chain" ? t("stored on-chain", "存储在链上") : src === "link" ? t("linked", "外部链接") : t("none", "无")}</span>
          {meta?.source && <><span>{t("Source", "源码")}</span><span><a href={meta.source} target="_blank" rel="noreferrer">{t("code ↗", "代码 ↗")}</a></span></>}
          <span>{t("Split", "分成")}</span><span>{t(`${100 - data.protocolBps / 100}% designer · ${data.protocolBps / 100}% Fusebox`, `设计者 ${100 - data.protocolBps / 100}% · Fusebox ${data.protocolBps / 100}%`)}</span>
        </div>
        <VerifyLinks processor={f.processor} circuitId={f.circuitId} fuseId={f.fuseId} />
      </MSheet>
    </div>
  );
}
