"use client";
import { useState } from "react";
import { setups } from "@/lib/agentConfig";
import { download } from "@/lib/agentKey";
import { useLang } from "@/lib/i18n";

/** 简体中文 for the setup names and hints in lib/agentConfig (the setup text itself is code and stays as is). */
const WHERE_ZH: Record<string, string> = {
  "claude-code": "在终端里运行一次，然后让 Claude 给某人付款。",
  "claude-desktop": "Settings → Developer → Edit Config：粘贴到 claude_desktop_config.json（与已有的 server 合并），然后重启 Claude。",
  cursor: "粘贴到 ~/.cursor/mcp.json（或项目里的 .cursor/mcp.json），然后重新加载 Cursor。",
  sdk: "运行 npm install fusebox-sdk viem，然后：",
};
const NAME_ZH: Record<string, string> = { sdk: "你的代码" };

/** Hand your agent its wallet: the fusebox-mcp server for Claude Code, Claude Desktop or Cursor, or the SDK in your
 *  own code, filled in with this wallet (and the agent key, when it was made in this browser). */
export default function AgentConnect({ wallet, agentKey }: { wallet: string; agentKey?: string }) {
  const { t, zh } = useLang();
  const all = setups(wallet, agentKey);
  const [id, setId] = useState(all[0].id);
  const [copied, setCopied] = useState(false);
  const s = all.find((x) => x.id === id)!;
  const nameOf = (x: { id: string; name: string }) => (zh ? NAME_ZH[x.id] ?? x.name : x.name);
  return (
    <div className="ac">
      <div className="ac-tabs m" role="tablist" aria-label={t("Where your agent runs", "你的智能体在哪里运行")}>
        {all.map((x) => <button key={x.id} role="tab" aria-selected={x.id === id} className={x.id === id ? "on" : ""} onClick={() => { setId(x.id); setCopied(false); }}>{nameOf(x)}</button>)}
      </div>
      <p className="ac-where">{zh ? WHERE_ZH[s.id] ?? s.where : s.where}</p>
      <pre className="ac-code m" tabIndex={0} aria-label={t(`${s.name} setup`, `${nameOf(s)} 配置`)}><code>{s.text}</code></pre>
      <div className="ac-act m">
        <button className="btn lime" onClick={() => { navigator.clipboard?.writeText(s.text); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? t("Copied ✓", "已复制 ✓") : t("Copy", "复制")}</button>
        {s.file && <button className="btn" onClick={() => download(s.file!, s.text)}>{t("Download", "下载")} {s.file}</button>}
      </div>
      {!agentKey && <p className="ac-note">{t(<>Replace <span className="m">0xYOUR_AGENT_PRIVATE_KEY</span> with your agent&apos;s key. It stays on your machine; Fusebox never sees it.</>, <>把 <span className="m">0xYOUR_AGENT_PRIVATE_KEY</span> 换成你的智能体密钥。它只留在你的电脑上，Fusebox 永远看不到。</>)}</p>}
      <p className="ac-note">{t(<>Then ask your agent: <i>&ldquo;Pay my saved payee 0.01 USD₮0.&rdquo;</i> It checks the fuses first and tells you what they said.</>, <>然后对你的智能体说：<i>“给我已保存的收款方付 0.01 USD₮0。”</i>它会先检查保险丝，再告诉你结果。</>)}</p>
    </div>
  );
}
