"use client";
import { useEffect, useState } from "react";
import type { Status, Level } from "@/lib/status";
import { useLang } from "@/lib/i18n";
import { PageChrome } from "./m/chrome";

const WORD: Record<Level, string> = { ok: "Normal", warn: "Degraded", down: "Down" };
const BANNER: Record<Level, string> = { ok: "Everything is working.", warn: "Working, with something to watch.", down: "Something is down." };
const WORD_ZH: Record<Level, string> = { ok: "正常", warn: "降级", down: "宕机" };
const BANNER_ZH: Record<Level, string> = { ok: "一切正常。", warn: "运行中，有需要留意的地方。", down: "有部分服务宕机了。" };

// ---- 简体中文 for the rows lib/status.ts builds (English on the server), mapped at display time. Unknown text stays.
type Rule = [RegExp, (m: RegExpExecArray) => string];
const zhMap = (rules: Rule[], s: string) => { for (const [re, f] of rules) { const m = re.exec(s); if (m) return f(m); } return s; };
/** an error message carried inside a row */
const errIn = (e: string) => e.replace(/^no answer in (.+) s$/, "$1 秒内无响应").replace(/^unknown$/, "未知");
const GROUP_ZH: Record<string, string> = { Services: "服务", "Usage on mainnet": "主网使用情况" };
const NAME_ZH: Record<string, string> = {
  "Event index": "事件索引", "Processor trust": "处理器信任", "Atlas line": "Atlas 线路", "Prepaid fees": "预付费用",
  "Rob the agent": "智能体 Rob", "x402 sellers": "x402 卖家", "Approver alerts": "审批人提醒", "Telegram alerts": "Telegram 提醒",
  "Fusebox wallets": "Fusebox 钱包", "Payments checked": "已检查的付款", "Paid to circuit designers": "支付给电路设计者", "On-chain alerts": "链上提醒",
};
const VALUE_ZH: Rule[] = [
  [/^no answer$/, () => "无响应"],
  [/^unknown$/, () => "未知"],
  [/^(.+) blocks to catch up$/, (m) => `还差 ${m[1]} 个区块`],
  [/^trusted$/, () => "已信任"],
  [/^untrusted$/, () => "未信任"],
  [/^paused$/, () => "已暂停"],
  [/^(.+) blown$/, (m) => `${m[1]} 已熔断`],
  [/^(\d+) fuses closed$/, (m) => `${m[1]} 个保险丝闭合`],
  [/^scripted agent$/, () => "脚本智能体"],
  [/^issuing offers$/, () => "正在发出报价"],
  [/^not issuing$/, () => "未发出报价"],
  [/^store unreachable$/, () => "存储不可达"],
  [/^not configured$/, () => "未配置"],
  [/^(\d+) approvers? subscribed$/, (m) => `${m[1]} 位审批人已订阅`],
  [/^(@\S+) · (.+) wallets? followed$/, (m) => `${m[1]} · 关注了 ${m[2]} 个钱包`],
  [/^bot unreachable$/, () => "机器人不可达"],
  [/^(\d+) · (\d+) outside$/, (m) => `${m[1]} · ${m[2]} 个外部`],
  [/^(\d+) posted$/, (m) => `已发布 ${m[1]} 条`],
];
const DETAIL_ZH: Rule[] = [
  [/^(.+); reads fall back to the other RPCs$/, (m) => `${errIn(m[1])}；读取会回退到其他 RPC`],
  [/^block ([\d,]+), (\d+) behind$/, (m) => `区块 ${m[1]}，落后 ${m[2]} 个`],
  [/^block ([\d,]+)$/, (m) => `区块 ${m[1]}`],
  [/^Blocks since the committed index was built \(each deploy refreshes it\); the app reads the rest live, in cached windows\.$/, () => "自已提交的索引构建以来新增的区块（每次部署都会刷新）；其余部分由应用按缓存窗口实时读取。"],
  [/^TapeOut's processor runs the code Fusebox pinned, so every fuse evaluates\.$/, () => "TapeOut 的处理器运行的是 Fusebox 锁定的代码，所以每个保险丝都能正常求值。"],
  [/^couldn't read it: (.+)$/, (m) => `无法读取：${errIn(m[1])}`],
  [/^TapeOut's processor code changed: every fuse fails closed and charges nothing until it's re-attested\.$/, () => "TapeOut 的处理器代码已变更：在重新确认之前，每个保险丝都按安全原则拒绝，且不收费。"],
  [/^(\d+) decisions on mainnet; the last (.+)\.$/, (m) => `主网上共 ${m[1]} 次决策；最近一次：${m[2] === "none yet" ? "暂无" : m[2]}。`],
  [/^Covers about (\d+) more decisions at (.+) USD₮0 each\.$/, (m) => `还够大约 ${m[1]} 次决策，每次 ${m[2]} USD₮0。`],
  [/^couldn't read Atlas: (.+)$/, (m) => `无法读取 Atlas：${errIn(m[1])}`],
  [/^The model answers, within per-visitor and per-server caps\.$/, () => "由模型回答，受每位访客和每台服务器的限额约束。"],
  [/^The model is off or cooling down, so the scripted agent answers\.$/, () => "模型已关闭或在冷却中，由脚本智能体回答。"],
  [/^Hosts the model behind Rob the agent and plain-English guardrails\.$/, () => "托管智能体 Rob 和自然语言护栏背后的模型。"],
  [/^The demo price sheet answers 402 with a signed Fusebox offer\.$/, () => "演示价目表以 402 响应，并附上一份签名的 Fusebox 报价。"],
  [/^couldn't sign an offer: (.+)$/, (m) => `无法签发报价：${errIn(m[1])}`],
  [/^Web push \(VAPID\) with subscriptions in (.+); swept hourly\.$/, (m) => `Web 推送（VAPID），订阅存放在${m[1] === "a private Vercel Blob store" ? "私有的 Vercel Blob 存储" : m[1] === "the local file store" ? "本地文件存储" : m[1]}中；每小时扫描一次。`],
  [/^A Telegram message for every payment a followed wallet's agent tries: announced at once after app, SDK and MCP payments, swept every 10 minutes\.$/, () => "被关注钱包的智能体每尝试一笔付款，就发一条 Telegram 消息：应用、SDK 和 MCP 发起的付款立即通知，其余每 10 分钟扫描一次。"],
  [/^Every wallet the two factories made, read from X Layer; "outside" means an owner other than the Fusebox deployer\.$/, () => "两个工厂创建的每个钱包，读取自 X Layer；“外部”指所有者不是 Fusebox 部署者。"],
  [/^couldn't read: (.+)$/, (m) => `无法读取：${errIn(m[1])}`],
  [/^(\d+) TapeOut circuit evaluations in total: every fuse on a wallet's line checks every payment, paid or stopped\.$/, (m) => `共 ${m[1]} 次 TapeOut 电路求值：钱包线路上的每个保险丝都会检查每一笔付款，无论付出还是被拦截。`],
  [/^Lifetime check fees the registries owe or paid to fuse designers \(90% of every fee\), across all fuses\.$/, () => "所有保险丝累计的检查费用中，注册表已付或应付给保险丝设计者的部分（每笔费用的 90%）。"],
  [/^Stopped payments posted to wallets' TapeSend inboxes by circuit #15's container \(FuseboxHerald\)\.$/, () => "由电路 #15 的容器（FuseboxHerald）发布到各钱包 TapeSend 收件箱的被拦截付款。"],
  [/^no answer in (.+) s$/, (m) => `${m[1]} 秒内无响应`],
];

/** Every part Fusebox depends on, checked live (the server caches each round for 30 s). */
export default function StatusView({ initial }: { initial: Status }) {
  const { t, zh } = useLang();
  const [s, setS] = useState(initial);
  const [ago, setAgo] = useState(0);
  useEffect(() => {
    const pull = () => fetch("/api/status", { cache: "no-store" }).then((r) => r.json()).then((j: Status) => j?.checks && setS(j)).catch(() => {});
    const a = setInterval(pull, 30_000), b = setInterval(() => setAgo(Math.round((Date.now() - s.at) / 1000)), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [s.at]);
  const groups = [...new Set(s.checks.map((c) => c.group))];
  const group = (g: string) => (zh ? GROUP_ZH[g] ?? g : g);
  const intro = t("Every part Fusebox depends on, checked live: X Layer's RPCs, TapeOut's processor, Atlas's fuses and prepaid fees, the AI agent, the x402 sellers and approver alerts.", "Fusebox 依赖的每个部分都在实时检查：X Layer 的 RPC、TapeOut 的处理器、Atlas 的保险丝和预付费用、AI 智能体、x402 卖家以及审批人提醒。");
  return (
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <PageChrome title={t("Status", "状态")} sub={t("Every part, checked live", "每个部分，实时检查")} info={<p>{intro}</p>} />
      <section className="try-head m-hide">
        <h1 className="disp" data-a>{t(<>System <span className="lime">[status]</span>.</>, <>系统<span className="lime">[状态]</span>。</>)}</h1>
        <p data-a>{intro}</p>
      </section>
      <div className={`sx-banner ${s.level}`} role="status" data-a>
        <span className={`sx-dot ${s.level}`} aria-hidden="true" />
        <b>{zh ? BANNER_ZH[s.level] : BANNER[s.level]}</b>
        <span className="m mute">{t(`checked ${ago < 5 ? "just now" : `${ago} s ago`} · refreshes every 30 s`, `${ago < 5 ? "刚刚" : `${ago} 秒前`}检查 · 每 30 秒刷新`)}</span>
      </div>
      {groups.map((g) => (
        <section className="sx-group" key={g} data-a aria-label={group(g)}>
          <h2 className="m">{group(g)}</h2>
          <ul>
            {s.checks.filter((c) => c.group === g).map((c) => (
              <li key={c.key} className="sx-row">
                <span className={`sx-dot ${c.level}`} aria-hidden="true" />
                <span className="sx-name">{zh ? NAME_ZH[c.name] ?? c.name : c.name}</span>
                <span className={`sx-level m ${c.level}`}>{zh ? WORD_ZH[c.level] : WORD[c.level]}</span>
                <span className="sx-val m">{zh ? zhMap(VALUE_ZH, c.value) : c.value}</span>
                <span className="sx-detail">{zh ? zhMap(DETAIL_ZH, c.detail) : c.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="proof m">{t(<>Also as JSON at <a className="lime" href="/api/status">/api/status</a>.</>, <>也可以通过 <a className="lime" href="/api/status">/api/status</a> 获取 JSON。</>)}</p>
    </div>
  );
}
