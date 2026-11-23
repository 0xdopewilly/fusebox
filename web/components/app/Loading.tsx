"use client";
import { useLang } from "@/lib/i18n";

/** Loading and error state for anything read from X Layer: a fuse with current running through its filament.
 *  On an error the filament goes red; the hooks behind these pages poll, so it retries on its own. */
export default function Loading({ label, error }: { label: string; error?: string | null }) {
  const { t } = useLang();
  return (
    <div className={`ld${error ? " bad" : ""}`} role="status" aria-live="polite">
      <div className="ld-fuse" aria-hidden="true"><i /><span><b /></span><i /></div>
      <p className="m">{error ? t("Can't reach X Layer right now", "暂时连不上 X Layer") : label}</p>
      {error && <p className="ld-err">{t(`${error}. Retrying on its own; nothing needs doing.`, `${error}。正在自动重试，无需任何操作。`)}</p>}
    </div>
  );
}
