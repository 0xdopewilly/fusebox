"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gsap, reduced } from "@/lib/gsap";
import { Glyph, type GlyphName } from "../Pixel";

/* The phone app's building blocks: sheets, segmented tabs, list rows, the lime hero card, quick actions, chips,
   stat strips and the pinned action bar. Styles live in app.css under "phone app". */

/** A bottom sheet: drag the grab bar or tap outside to close; Escape closes; the page behind stops scrolling. */
export function MSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Parents re-render often (the app bar on every block) and pass a fresh onClose each time. Keeping it in a ref keeps
  // `close` stable, so the open effect below runs once per opening instead of replaying the slide-in on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closing = useRef(false);
  const close = useCallback(() => {
    if (closing.current) return;
    if (!sheet.current || reduced()) { onCloseRef.current(); return; }
    closing.current = true;
    gsap.killTweensOf([sheet.current, shade.current]);
    gsap.to(sheet.current, { yPercent: 100, duration: 0.3, ease: "power3.in" });
    gsap.to(shade.current, { autoAlpha: 0, duration: 0.28, onComplete: () => { closing.current = false; onCloseRef.current(); } });
  }, []);
  useEffect(() => {
    if (!open) return;
    closing.current = false;
    document.documentElement.classList.add("panel-open");
    sheet.current?.focus({ preventScroll: true });
    if (!reduced() && sheet.current) {
      gsap.killTweensOf([sheet.current, shade.current]);
      gsap.fromTo(shade.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 });
      gsap.fromTo(sheet.current, { yPercent: 100 }, { yPercent: 0, duration: 0.5, ease: "expo.out" });
    }
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => { document.documentElement.classList.remove("panel-open"); window.removeEventListener("keydown", esc); };
  }, [open, close]);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { drag.current = { y: e.clientY, dy: 0 }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { if (!drag.current || !sheet.current) return; drag.current.dy = Math.max(0, e.clientY - drag.current.y); sheet.current.style.transform = `translateY(${drag.current.dy}px)`; };
  const onUp = () => { if (!drag.current || !sheet.current) return; const far = drag.current.dy > 90; drag.current = null; if (far) close(); else gsap.to(sheet.current, { y: 0, duration: 0.3, clearProps: "transform" }); };
  if (!open || !mounted) return null;
  return createPortal(
    <div className="ms-shade" ref={shade} onClick={close}>
      <div className="ms" ref={sheet} role="dialog" aria-modal="true" aria-label={title ?? "Details"} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="ms-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}><i /></div>
        {title && <div className="ms-h"><b>{title}</b><button className="ms-x m" onClick={close} aria-label="Close">Close</button></div>}
        <div className="ms-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Segmented tabs: one view of a screen at a time. */
export function MSeg<T extends string>({ items, value, onChange, label }: { items: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="mseg m" role="tablist" aria-label={label}>
      {items.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

type RowProps = { icon?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; value?: React.ReactNode; valueSub?: React.ReactNode; href?: string; ext?: boolean; onClick?: () => void; className?: string; chev?: boolean };
/** A list row: icon, title over a one-line caption, a value on the right; a link, a button or plain. */
export function MRow({ icon, title, sub, value, valueSub, href, ext, onClick, className = "", chev }: RowProps) {
  const body = (
    <>
      {icon !== undefined && <span className="mr-ico">{icon}</span>}
      <span className="mr-t"><b>{title}</b>{sub !== undefined && <small className="m">{sub}</small>}</span>
      {(value !== undefined || valueSub !== undefined) && <span className="mr-v"><b>{value}</b>{valueSub !== undefined && <small className="m">{valueSub}</small>}</span>}
      {(chev ?? !!(href || onClick)) && <span className="mr-chev" aria-hidden="true">{ext ? "↗" : "›"}</span>}
    </>
  );
  const cls = `mrow ${className}`;
  if (href && ext) return <a className={cls} href={href} target="_blank" rel="noreferrer">{body}</a>;
  if (href) return <Link className={cls} href={href}>{body}</Link>;
  if (onClick) return <button className={cls} onClick={onClick}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

/** The lime key card that opens a screen: one big number and what it means. */
export function MHero({ label, right, value, unit, foot, tone }: { label: React.ReactNode; right?: React.ReactNode; value: React.ReactNode; unit?: React.ReactNode; foot?: React.ReactNode; tone?: "bad" }) {
  return (
    <div className={`mhero${tone === "bad" ? " bad" : ""}`}>
      <div className="mh-top m"><span>{label}</span>{right && <span>{right}</span>}</div>
      <div className="mh-big">{value}{unit && <small>{unit}</small>}</div>
      {foot && <><div className="mh-dots" aria-hidden="true" /><div className="mh-foot m">{foot}</div></>}
    </div>
  );
}

export type Action = { icon: GlyphName; label: string; href?: string; ext?: boolean; onClick?: () => void; tone?: "bad" };
/** The few things a screen is for, right under its hero. */
export function MActions({ items }: { items: Action[] }) {
  return (
    <div className="macts m" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((a) => {
        const inner = <><Glyph name={a.icon} size={18} color={a.tone === "bad" ? "var(--red)" : "var(--lime)"} />{a.label}</>;
        const cls = a.tone === "bad" ? "bad" : "";
        if (a.href && a.ext) return <a key={a.label} className={cls} href={a.href} target="_blank" rel="noreferrer">{inner}</a>;
        if (a.href) return <Link key={a.label} className={cls} href={a.href}>{inner}</Link>;
        return <button key={a.label} className={cls} onClick={a.onClick}>{inner}</button>;
      })}
    </div>
  );
}

/** Horizontally scrolling choices. */
export function MChips<T extends string>({ items, value, onChange, label }: { items: readonly (readonly [T, string])[]; value: T | null; onChange: (v: T) => void; label: string }) {
  return (
    <div className="mchips" role="group" aria-label={label}>
      {items.map(([k, l]) => <button key={k} className={value === k ? "on" : ""} aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

/** Two to four numbers in a strip. */
export function MStats({ items }: { items: [React.ReactNode, React.ReactNode, string?][] }) {
  return (
    <div className="mstats" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map(([l, v, u], i) => <div key={i}><span className="m">{l}</span><b>{v}{u && <small>{u}</small>}</b></div>)}
    </div>
  );
}

/** The screen's main action, pinned above the dock; the spacer keeps the last content clear of it. */
export function MSticky({ children }: { children: React.ReactNode }) {
  return <><div className="msticky-space" aria-hidden="true" /><div className="msticky">{children}</div></>;
}

/** A section label inside a phone screen. */
export function MLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="mlabel m"><span>{children}</span>{right !== undefined && <span>{right}</span>}</div>;
}
