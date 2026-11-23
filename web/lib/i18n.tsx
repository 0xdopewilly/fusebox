"use client";
/**
 * English / 简体中文 for the site. TapeOut's community and many of the judges read Chinese, so the pages they see first
 * come in both. A visitor's choice is remembered; `?lang=zh` or `?lang=en` in a link picks one; otherwise a Chinese
 * browser gets Chinese. Text lives next to the English it translates: `t("Your agent pays.", "你的智能体付款。")`.
 * The server always renders English; the client switches after mount, and anything keyed with <LangKeyed> remounts so
 * its text animations (SplitText) rebuild on the new words.
 */
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "en" | "zh";
const KEY = "fusebox:lang";

function preferred(): Lang {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "zh" || q === "en") return q;
    const s = localStorage.getItem(KEY);
    if (s === "zh" || s === "en") return s;
  } catch { /* storage blocked */ }
  return /^zh/i.test(navigator.language || "") ? "zh" : "en";
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setL] = useState<Lang>("en");
  useEffect(() => { setL(preferred()); }, []);
  useEffect(() => { document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"; }, [lang]);
  const setLang = useCallback((l: Lang) => { setL(l); try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ } }, []);
  const v = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

/** `t(en, zh)` picks the visitor's language; works for strings and JSX alike. */
export function useLang() {
  const { lang, setLang } = useContext(Ctx);
  const t = useCallback(<T,>(en: T, zh: T): T => (lang === "zh" ? zh : en), [lang]);
  return { lang, setLang, t, zh: lang === "zh" };
}

/** Remounts its children when the language changes (fresh DOM for SplitText and scroll animations). */
export function LangKeyed({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  return <Fragment key={lang}>{children}</Fragment>;
}

/** For server-rendered pages (docs): both versions are rendered on the server, the visitor's language is shown.
 *  `<T en={<p>Hello</p>} zh={<p>你好</p>} />` */
export function T({ en, zh }: { en: React.ReactNode; zh: React.ReactNode }) {
  const { lang } = useLang();
  return <>{lang === "zh" ? zh : en}</>;
}

/** EN / 中文 */
export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`langsw m ${className}`} role="group" aria-label="Language / 语言">
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">EN</button>
      <span aria-hidden="true">/</span>
      <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")} lang="zh-CN">中文</button>
    </div>
  );
}
