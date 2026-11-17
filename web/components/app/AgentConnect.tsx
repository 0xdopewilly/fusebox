"use client";
import { useState } from "react";
import { setups } from "@/lib/agentConfig";
import { download } from "@/lib/agentKey";

/** Hand your agent its wallet: the fusebox-mcp server for Claude Code, Claude Desktop or Cursor, or the SDK in your
 *  own code, filled in with this wallet (and the agent key, when it was made in this browser). */
export default function AgentConnect({ wallet, agentKey }: { wallet: string; agentKey?: string }) {
  const all = setups(wallet, agentKey);
  const [id, setId] = useState(all[0].id);
  const [copied, setCopied] = useState(false);
  const s = all.find((x) => x.id === id)!;
  return (
    <div className="ac">
      <div className="ac-tabs m" role="tablist" aria-label="Where your agent runs">
        {all.map((x) => <button key={x.id} role="tab" aria-selected={x.id === id} className={x.id === id ? "on" : ""} onClick={() => { setId(x.id); setCopied(false); }}>{x.name}</button>)}
      </div>
      <p className="ac-where">{s.where}</p>
      <pre className="ac-code m" tabIndex={0} aria-label={`${s.name} setup`}><code>{s.text}</code></pre>
      <div className="ac-act m">
        <button className="btn lime" onClick={() => { navigator.clipboard?.writeText(s.text); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? "Copied ✓" : "Copy"}</button>
        {s.file && <button className="btn" onClick={() => download(s.file!, s.text)}>Download {s.file}</button>}
      </div>
      {!agentKey && <p className="ac-note">Replace <span className="m">0xYOUR_AGENT_PRIVATE_KEY</span> with your agent&apos;s key. It stays on your machine; Fusebox never sees it.</p>}
      <p className="ac-note">Then ask your agent: <i>&ldquo;Pay my saved payee 0.01 USD₮0.&rdquo;</i> It checks the fuses first and tells you what they said.</p>
    </div>
  );
}
