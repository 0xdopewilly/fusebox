"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Atlas } from "./atlas";

export function useBlock(ms = 2500) {
  const [block, setBlock] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const pull = async () => { try { const j = await (await fetch("/api/block", { cache: "no-store" })).json(); if (alive && typeof j.block === "number") setBlock(j.block); } catch {} };
    pull(); const id = setInterval(pull, ms);
    return () => { alive = false; clearInterval(id); };
  }, [ms]);
  return block;
}

/** The Atlas snapshot, polled. `fresh` holds decision ids that arrived since the first load. */
export function useAtlas(ms = 4000, url = "/api/atlas") {
  const [data, setData] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const seen = useRef<Set<number> | null>(null);
  const pullNow = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) { setError(j.error || "unreachable"); return; }
        setError(null);
        const ids = new Set<number>((j as Atlas).decisions.map((d) => d.id));
        if (seen.current) { const n = [...ids].filter((i) => !seen.current!.has(i)); if (n.length) setFresh(new Set(n)); }
        seen.current = ids;
        setData(j);
      } catch { if (alive) setError("unreachable"); }
    };
    pullNow.current = pull;
    pull(); const id = setInterval(pull, ms);
    return () => { alive = false; clearInterval(id); };
  }, [ms, url]);
  /** Pull now instead of waiting for the next tick (after a payment lands, say). */
  const reload = useCallback(() => pullNow.current(), []);
  return { data, error, fresh, reload };
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const fmt = (v: string | number, d = 6) => Number(v).toFixed(d);
export const OKLINK = "https://www.oklink.com/xlayer";
