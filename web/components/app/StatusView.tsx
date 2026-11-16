"use client";
import { useEffect, useState } from "react";
import type { Status, Level } from "@/lib/status";
import { PageChrome } from "./m/chrome";

const WORD: Record<Level, string> = { ok: "Normal", warn: "Degraded", down: "Down" };
const BANNER: Record<Level, string> = { ok: "Everything is working.", warn: "Working, with something to watch.", down: "Something is down." };

/** Every part Fusebox depends on, checked live (the server caches each round for 30 s). */
export default function StatusView({ initial }: { initial: Status }) {
  const [s, setS] = useState(initial);
  const [ago, setAgo] = useState(0);
  useEffect(() => {
    const pull = () => fetch("/api/status", { cache: "no-store" }).then((r) => r.json()).then((j: Status) => j?.checks && setS(j)).catch(() => {});
    const a = setInterval(pull, 30_000), b = setInterval(() => setAgo(Math.round((Date.now() - s.at) / 1000)), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [s.at]);
  const groups = [...new Set(s.checks.map((c) => c.group))];
  return (
    <div className="page">
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <PageChrome title="Status" sub="Every part, checked live" info={<p>Every part Fusebox depends on, checked live: X Layer&apos;s RPCs, TapeOut&apos;s processor, Atlas&apos;s fuses and prepaid fees, the AI agent, the x402 sellers and approver alerts.</p>} />
      <section className="try-head m-hide">
        <h1 className="disp" data-a>System <span className="lime">[status]</span>.</h1>
        <p data-a>Every part Fusebox depends on, checked live: X Layer&apos;s RPCs, TapeOut&apos;s processor, Atlas&apos;s fuses and prepaid fees, the AI agent, the x402 sellers and approver alerts.</p>
      </section>
      <div className={`sx-banner ${s.level}`} role="status" data-a>
        <span className={`sx-dot ${s.level}`} aria-hidden="true" />
        <b>{BANNER[s.level]}</b>
        <span className="m mute">checked {ago < 5 ? "just now" : `${ago} s ago`} · refreshes every 30 s</span>
      </div>
      {groups.map((g) => (
        <section className="sx-group" key={g} data-a aria-label={g}>
          <h2 className="m">{g}</h2>
          <ul>
            {s.checks.filter((c) => c.group === g).map((c) => (
              <li key={c.key} className="sx-row">
                <span className={`sx-dot ${c.level}`} aria-hidden="true" />
                <span className="sx-name">{c.name}</span>
                <span className={`sx-level m ${c.level}`}>{WORD[c.level]}</span>
                <span className="sx-val m">{c.value}</span>
                <span className="sx-detail">{c.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="proof m">Also as JSON at <a className="lime" href="/api/status">/api/status</a>.</p>
    </div>
  );
}
