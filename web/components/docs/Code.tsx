"use client";
import { useState } from "react";
import { useLang } from "@/lib/i18n";

/** A code block with a label and a copy button. `labelZh` is the label in Chinese (defaults to `label`). */
export default function Code({ label, labelZh, children }: { label?: string; labelZh?: string; children: string }) {
  const [ok, setOk] = useState(false);
  const { t, zh } = useLang();
  const name = zh ? labelZh ?? label : label;
  return (
    <div className="code-b">
      <div className="code-h m"><span>{name ?? t("code", "代码")}</span><button onClick={() => { navigator.clipboard?.writeText(children.trim()); setOk(true); setTimeout(() => setOk(false), 1400); }}>{ok ? t("Copied", "已复制") : t("Copy", "复制")}</button></div>
      <pre tabIndex={0} aria-label={zh ? `${name ?? "代码"}，可滚动` : `${label ?? "Code"}, scrollable`}><code>{children.trim()}</code></pre>
    </div>
  );
}
