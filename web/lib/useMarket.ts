"use client";
import { useEffect, useState } from "react";
import type { Market } from "./market";

export function useMarket() {
  const [data, setData] = useState<Market | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const pull = async () => { try { const r = await fetch("/api/market", { cache: "no-store" }); const j = await r.json(); if (!alive) return; if (!r.ok || !j.fuses) setError(j.error || "unreachable"); else { setData(j); setError(null); } } catch { if (alive) setError("unreachable"); } };
    pull(); const id = setInterval(pull, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return { data, error };
}
