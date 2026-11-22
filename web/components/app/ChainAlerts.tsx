"use client";
import { useEffect, useState } from "react";
import { OKLINK, short } from "@/lib/hooks";
import { Glyph } from "./Pixel";
import { MLabel, MRow, MSheet } from "./m/ui";

interface Alert { index: number; fromFusebox: boolean; from: string; time: number; subject: string; body: string; tx: string; verified: boolean }
interface Inbox { count: number; alerts: Alert[]; herald: { address: string; container: string; circuitId: number; hub: string } | null }

const when = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
/** "Fusebox stopped payment #4 (Payee Guard, Breaker)" → "Payment #4 · stopped by Payee Guard, Breaker" */
const title = (s: string) => { const m = /^Fusebox stopped payment (#\d+) \((.*)\)$/.exec(s); return m ? `Payment ${m[1]} · stopped by ${m[2]}` : s; };

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

/** Desktop: the wallet's on-chain alerts under its decisions. */
export function ChainAlerts({ wallet, refreshKey }: { wallet: string; refreshKey: number }) {
  const { data, failed } = useInbox(wallet, refreshKey);
  const ours = data?.alerts.filter((a) => a.fromFusebox && a.verified) ?? [];
  const others = (data?.alerts.length ?? 0) - ours.length;
  return (
    <>
      <div className="blockhead" data-b><h2 className="disp">On-chain alerts</h2><span className="m mute">TapeSend inbox on X Layer · posted by TapeOut circuit #{data?.herald?.circuitId ?? 15}</span></div>
      <div className="tsbox" data-b>
        <p className="tsnote">{ABOUT}</p>
        {!data && !failed && <p className="m mute" role="status"><span className="live" />Reading the inbox from X Layer…</p>}
        {failed && !data && <p className="m mute">Couldn&apos;t reach X Layer just now; the alerts are still on-chain.</p>}
        {data && !ours.length && <p className="m mute">No stops posted yet. The first time a fuse says no, the alert lands here.</p>}
        {ours.map((a) => (
          <details key={a.index} className="tsmsg">
            <summary>
              <span className="res no">Stopped</span>
              <span className="tssub">{title(a.subject)}</span>
              <span className="m mute">{when(a.time)}</span>
            </summary>
            <pre className="tsbody">{a.body}</pre>
            <div className="m tsfoot"><span className="lime">Checked against the hub</span><a href={`${OKLINK}/tx/${a.tx}`} target="_blank" rel="noreferrer">Posted on X Layer ↗</a></div>
          </details>
        ))}
        {others > 0 && <p className="m mute tsnote">{others} message{others === 1 ? "" : "s"} from other senders not shown: only Fusebox&apos;s own circuit speaks here.</p>}
        {data?.herald && <p className="m mute tsmeta">Inbox {short(wallet)} on hub <a href={`${OKLINK}/address/${data.herald.hub}`} target="_blank" rel="noreferrer">{short(data.herald.hub)} ↗</a> · sender: circuit #{data.herald.circuitId}&apos;s container, held by <a href={`https://repo.sourcify.dev/196/${data.herald.address}`} target="_blank" rel="noreferrer">FuseboxHerald ↗</a></p>}
      </div>
    </>
  );
}

/** Phones: the same alerts as rows; tapping one opens the full message. */
export function ChainAlertsMobile({ wallet, refreshKey }: { wallet: string; refreshKey: number }) {
  const { data } = useInbox(wallet, refreshKey);
  const [open, setOpen] = useState<Alert | null>(null);
  const ours = data?.alerts.filter((a) => a.fromFusebox && a.verified) ?? [];
  return (
    <>
      <MLabel right="TapeSend · X Layer">On-chain alerts</MLabel>
      <p className="mnote">Each stop is posted to this wallet&apos;s TapeSend inbox by Fusebox&apos;s TapeOut circuit #15, and read back from the chain.</p>
      <div className="mrows">
        {ours.slice(0, 5).map((a) => (
          <MRow key={a.index} onClick={() => setOpen(a)} icon={<Glyph name="stop" size={16} color="var(--red)" />}
            title={title(a.subject)} sub={`${when(a.time)} · checked on-chain`} chev />
        ))}
      </div>
      {data && !ours.length && <p className="mnote">No stops posted yet.</p>}
      <MSheet open={!!open} onClose={() => setOpen(null)} title={open ? title(open.subject).split(" · ")[0] : undefined}>
        {open && <>
          <pre className="tsbody">{open.body}</pre>
          <a className="btn" style={{ justifyContent: "center" }} href={`${OKLINK}/tx/${open.tx}`} target="_blank" rel="noreferrer">Posted on X Layer ↗</a>
        </>}
      </MSheet>
    </>
  );
}
