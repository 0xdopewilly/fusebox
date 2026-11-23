"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";

/** What a phone screen puts in the app bar: its title, a one-line subtitle, a back link, and the "i" sheet that holds
 *  the explanations the screen itself leaves out. */
export interface Chrome { title?: string; sub?: string; back?: string; info?: React.ReactNode }
const Ctx = createContext<{ chrome: Chrome | null; set: (c: Chrome | null) => void }>({ chrome: null, set: () => {} });

export function ChromeProvider({ children }: { children: React.ReactNode }) {
  const [chrome, set] = useState<Chrome | null>(null);
  return <Ctx.Provider value={{ chrome, set }}>{children}</Ctx.Provider>;
}
export const useChrome = () => useContext(Ctx).chrome;

/** Render once per phone screen. */
export function PageChrome({ title, sub, back, info }: Chrome) {
  const { set } = useContext(Ctx);
  const { lang } = useLang(); // a language switch refreshes the "i" sheet too
  useEffect(() => { set({ title, sub, back, info }); return () => set(null); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, sub, back, set, lang]);
  return null;
}
