"use client";
import { createContext, useContext, useEffect, useState } from "react";

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
  useEffect(() => { set({ title, sub, back, info }); return () => set(null); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, sub, back, set]);
  return null;
}
