"use client";
import { useEffect, useState } from "react";
import { OKLINK, short } from "@/lib/hooks";
import { Glyph } from "./Pixel";
import { MLabel, MRow, MSheet } from "./m/ui";
import { useLang } from "@/lib/i18n";

interface Alert { index: number; fromFusebox: boolean; from: string; time: number; subject: string; body: string; tx: string; verified: boolean }
interface Inbox { count: number; alerts: Alert[]; herald: { address: string; container: string; circuitId: number; hub: string } | null }

const when = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
/** "Fusebox stopped payment #4 (Payee Guard, Breaker)" → "Payment #4 · stopped by Payee Guard, Breaker" (付款 #4 · 被 Payee Guard, Breaker 拦截) */
const title = (s: string, zh = false) => { const m = /^Fusebox stopped payment (#\d+) \((.*)\)$/.exec(s); return m ? (zh ? `付款 ${m[1]} · 被 ${m[2]} 拦截` : `Payment ${m[1]} · stopped by ${m[2]}`) : s; };

/** Reads the wallet's TapeSend inbox on X Layer (through /api/tapesend/inbox) and refreshes when a new stop lands. */
function useInbox(wallet: string, refreshKey: number) {
  const [data, setData] = useState<Inbox | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () => fetch(`/api/tapesend/inbox?wallet=${wallet}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j: Inbox) => { if (live) { setData(j); setFailed(false); } }).catch(() => { if (live) setFailed(true); });
    load();
    // a stop is posted a few seconds after it happens (or by the 10-minute sweep): look again shortly after
    const t = setTimeout(load, 20_000);
    return () => { live = false; clearTimeout(t); };
  }, [wallet, refreshKey]);
  return { data, failed };
}

const ABOUT = "Every payment this wallet's fuses stop is posted here once, on X Layer, by Fusebox's TapeOut circuit #15 through TapeSend, TapeOut's on-chain messaging. This page reads the inbox straight from the DeWEB hub and checks each message against its on-chain fingerprint.";
const ABOUT_ZH = "这个钱包的保险丝每拦截一笔付款，Fusebox 的 TapeOut 电路 #15 就会通过 TapeSend（TapeOut 的链上消息）在 X Layer 上把它发到这里，每笔只发一次。本页直接从 DeWEB hub 读取收件箱，并用链上指纹核对每条消息。";

/** Desktop: the wallet's on-chain alerts under its decisions. */
export function ChainAlerts({ wallet, refreshKey }: { wallet: string; refreshKey: number }) {
  const { data, failed } = useInbox(wallet, refreshKey);
  const { t, zh } = useLang();
  const ours = data?.alerts.filter((a) => a.fromFusebox && a.verified) ?? [];
  const others = (data?.alerts.length ?? 0) - ours.length;
  return (
    <>
      <div className="blockhead" data-b><h2 className="disp">{t("On-chain alerts", "链上提醒")}</h2><span className="m mute">{t(<>TapeSend inbox on X Layer · posted by TapeOut circuit #{data?.herald?.circuitId ?? 15}</>, <>X Layer 上的 TapeSend 收件箱 · 由 TapeOut 电路 #{data?.herald?.circuitId ?? 15} 发布</>)}</span></div>
      <div className="tsbox" data-b>
        <p className="tsnote">{zh ? ABOUT_ZH : ABOUT}</p>
        {!data && !failed && <p className="m mute" role="status"><span className="live" />{t("Reading the inbox from X Layer…", "正在从 X Layer 读取收件箱…")}</p>}
        {failed && !data && <p className="m mute">{t("Couldn't reach X Layer just now; the alerts are still on-chain.", "暂时连不上 X Layer；提醒仍然保存在链上。")}</p>}
        {data && !ours.length && <p className="m mute">{t("No stops posted yet. The first time a fuse says no, the alert lands here.", "还没有发布任何拦截。保险丝第一次说“否”时，提醒就会出现在这里。")}</p>}
        {ours.map((a) => (
          <details key={a.index} className="tsmsg">
            <summary>
              <span className="res no">{t("Stopped", "已拦截")}</span>
              <span className="tssub">{title(a.subject, zh)}</span>
              <span className="m mute">{when(a.time)}</span>
            </summary>
            <pre className="tsbody">{a.body}</pre>
            <div className="m tsfoot"><span className="lime">{t("Checked against the hub", "已与 hub 核对")}</span><a href={`${OKLINK}/tx/${a.tx}`} target="_blank" rel="noreferrer">{t("Posted on X Layer ↗", "发布于 X Layer ↗")}</a></div>
          </details>
        ))}
        {others > 0 && <p className="m mute tsnote">{t(<>{others} message{others === 1 ? "" : "s"} from other senders not shown: only Fusebox&apos;s own circuit speaks here.</>, <>未显示其他发送方的 {others} 条消息：这里只显示 Fusebox 自己的电路发出的消息。</>)}</p>}
        {data?.herald && <p className="m mute tsmeta">{t(<>Inbox {short(wallet)} on hub <a href={`${OKLINK}/address/${data.herald.hub}`} target="_blank" rel="noreferrer">{short(data.herald.hub)} ↗</a> · sender: circuit #{data.herald.circuitId}&apos;s container, held by <a href={`https://repo.sourcify.dev/196/${data.herald.address}`} target="_blank" rel="noreferrer">FuseboxHerald ↗</a></>, <>收件箱 {short(wallet)}，位于 hub <a href={`${OKLINK}/address/${data.herald.hub}`} target="_blank" rel="noreferrer">{short(data.herald.hub)} ↗</a> · 发送方：电路 #{data.herald.circuitId} 的容器，由 <a href={`https://repo.sourcify.dev/196/${data.herald.address}`} target="_blank" rel="noreferrer">FuseboxHerald ↗</a> 持有</>)}</p>}
      </div>
    </>
  );
}

/** Phones: the same alerts as rows; tapping one opens the full message. */
export function ChainAlertsMobile({ wallet, refreshKey }: { wallet: string; refreshKey: number }) {
  const { data } = useInbox(wallet, refreshKey);
  const { t, zh } = useLang();
  const [open, setOpen] = useState<Alert | null>(null);
  const ours = data?.alerts.filter((a) => a.fromFusebox && a.verified) ?? [];
  return (
    <>
      <MLabel right="TapeSend · X Layer">{t("On-chain alerts", "链上提醒")}</MLabel>
      <p className="mnote">{t("Each stop is posted to this wallet's TapeSend inbox by Fusebox's TapeOut circuit #15, and read back from the chain.", "每次拦截都会由 Fusebox 的 TapeOut 电路 #15 发到这个钱包的 TapeSend 收件箱，再从链上读回。")}</p>
      <div className="mrows">
        {ours.slice(0, 5).map((a) => (
          <MRow key={a.index} onClick={() => setOpen(a)} icon={<Glyph name="stop" size={16} color="var(--red)" />}
            title={title(a.subject, zh)} sub={`${when(a.time)} · ${t("checked on-chain", "已链上核对")}`} chev />
        ))}
      </div>
      {data && !ours.length && <p className="mnote">{t("No stops posted yet.", "还没有发布任何拦截。")}</p>}
      <MSheet open={!!open} onClose={() => setOpen(null)} title={open ? title(open.subject, zh).split(" · ")[0] : undefined}>
        {open && <>
          <pre className="tsbody">{open.body}</pre>
          <a className="btn" style={{ justifyContent: "center" }} href={`${OKLINK}/tx/${open.tx}`} target="_blank" rel="noreferrer">{t("Posted on X Layer ↗", "发布于 X Layer ↗")}</a>
        </>}
      </MSheet>
    </>
  );
}
