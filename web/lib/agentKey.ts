"use client";
import { getAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/** Agent keys made or imported in this browser. A key can only ask its wallet to pay, through every fuse, so keeping
 *  one in the browser (for the Fusebox assistant) risks at most what the fuses allow. It never leaves the device. */
const k = (wallet: string) => `fusebox:agent:${wallet.toLowerCase()}`;
const PENDING = "fusebox:agent:pending";

export interface AgentKey { key: Hex; address: Address }

export function newAgentKey(): AgentKey {
  const key = generatePrivateKey();
  return { key, address: privateKeyToAccount(key).address };
}
export function keyFrom(text: string): AgentKey | null {
  const t = text.trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(t)) return null;
  const key = (t.startsWith("0x") ? t : `0x${t}`) as Hex;
  try { return { key, address: privateKeyToAccount(key).address }; } catch { return null; }
}

const read = (name: string): AgentKey | null => {
  try { const v = localStorage.getItem(name); return v ? keyFrom(JSON.parse(v).key) : null; } catch { return null; }
};
const write = (name: string, a: AgentKey | null) => {
  try { if (a) localStorage.setItem(name, JSON.stringify({ key: a.key, address: a.address, at: Date.now() })); else localStorage.removeItem(name); } catch {}
};

export const loadAgentKey = (wallet: string) => read(k(wallet));
export const saveAgentKey = (wallet: string, a: AgentKey) => write(k(wallet), a);
export const forgetAgentKey = (wallet: string) => write(k(wallet), null);
/** a key made before its wallet exists, so a reload mid-wizard doesn't lose it */
export const loadPendingKey = () => read(PENDING);
export const savePendingKey = (a: AgentKey | null) => write(PENDING, a);

/** Every wallet this browser holds an agent key for. */
export function walletsWithKeys(): Address[] {
  const out: Address[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i) ?? "";
      const m = name.match(/^fusebox:agent:(0x[0-9a-f]{40})$/);
      if (m) out.push(getAddress(m[1]));
    }
  } catch {}
  return out;
}

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const keyFile = (wallet: string | null, a: AgentKey) => [
  "Fusebox agent key",
  "",
  `Agent address: ${a.address}`,
  `Agent private key: ${a.key}`,
  wallet ? `Fusebox wallet: ${wallet}` : "Fusebox wallet: (shown after you wire it up)",
  "",
  "This key can only ask your Fusebox wallet to pay, and every payment must pass the wallet's fuses.",
  "Keep it secret anyway: anyone holding it can spend what your fuses allow. Fusebox never sees it.",
  "",
].join("\n");

/** Labels the owner gives payees, per wallet, for the assistant ("Kano Cotton" → 0x…). */
const lk = (wallet: string) => `fusebox:labels:${wallet.toLowerCase()}`;
export function loadLabels(wallet: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(lk(wallet)) || "{}"); } catch { return {}; }
}
export function saveLabel(wallet: string, address: string, label: string) {
  const all = loadLabels(wallet);
  if (label.trim()) all[address.toLowerCase()] = label.trim().slice(0, 40); else delete all[address.toLowerCase()];
  try { localStorage.setItem(lk(wallet), JSON.stringify(all)); } catch {}
  return all;
}
