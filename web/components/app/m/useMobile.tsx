"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

/** Phones and small tablets get the app layout: the same width where the dock replaces the top tabs. */
export const MOBILE_Q = "(max-width: 900px)";

const subscribe = (cb: () => void) => { const m = window.matchMedia(MOBILE_Q); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
export function useMobile() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_Q).matches, () => false);
}

function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => { setH(true); }, []);
  return h;
}

/** Desktop or phone layout. Until hydration both are in the HTML and CSS shows the right one (no flash on a phone);
 *  after it, only the matching one stays mounted. */
export function Responsive({ desktop, mobile }: { desktop: React.ReactNode; mobile: React.ReactNode }) {
  const m = useMobile();
  const hydrated = useHydrated();
  return (
    <>
      <div className="only-d">{(!hydrated || !m) && desktop}</div>
      <div className="only-m">{(!hydrated || m) && mobile}</div>
    </>
  );
}
