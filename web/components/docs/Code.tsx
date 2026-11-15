"use client";
import { useState } from "react";

/** A code block with a label and a copy button. */
export default function Code({ label, children }: { label?: string; children: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="code-b">
      <div className="code-h m"><span>{label ?? "code"}</span><button onClick={() => { navigator.clipboard?.writeText(children.trim()); setOk(true); setTimeout(() => setOk(false), 1400); }}>{ok ? "Copied" : "Copy"}</button></div>
      <pre tabIndex={0} aria-label={`${label ?? "Code"}, scrollable`}><code>{children.trim()}</code></pre>
    </div>
  );
}
