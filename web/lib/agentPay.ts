"use client";
import { BaseError, ContractFunctionRevertedError, createWalletClient, decodeEventLog, http, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fuseboxWalletAbi } from "./abi";
import { BROWSER_RPC, DEP, XLAYER, pub } from "./client-chain";

const USDT0 = DEP.usdt0 as Address;
export const STATUS = ["pass", "blew", "failed", "untrusted"] as const;
export interface PayResult { hash: Hex; allowed: boolean; decisionId: number; status: (typeof STATUS)[number][] }
export interface CheckView { allowed: boolean; status: (typeof STATUS)[number][] }

/** OKB an agent must hold to send one payment: the wallet reserves gas for every fuse up front (about 3M gas with four
 *  fuses, 3.5M with five), priced at today's gas price with headroom. The real cost is far lower (about a third); this
 *  is what the network checks. */
export async function gasNeeded(fuses = 4): Promise<bigint> {
  const price = await pub.getGasPrice().catch(() => 25_000_000n);
  return ((fuses > 4 ? 3_500_000n : 3_000_000n) * price * 13n) / 10n;
}

/** What the wallet's fuses would say about a payment right now: its real check(), read-only and free. */
export async function checkFor(wallet: Address, to: Address, amount: string): Promise<CheckView> {
  const [allowed, status] = await pub.readContract({ address: wallet, abi: fuseboxWalletAbi, functionName: "check", args: [USDT0, to, parseUnits(amount, 6)] });
  return { allowed, status: status.map((s) => STATUS[s] ?? "failed") };
}

/** Pay as the agent, signed in this browser with its key; the fuses decide on X Layer in the same transaction. */
export async function agentPay(key: Hex, wallet: Address, to: Address, amount: string, memo: string): Promise<PayResult> {
  const account = privateKeyToAccount(key);
  const args = [USDT0, to, parseUnits(amount, 6), memo.slice(0, 200)] as const;
  try {
    await pub.simulateContract({ account, address: wallet, abi: fuseboxWalletAbi, functionName: "pay", args });
  } catch (e) {
    const rev = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null : null;
    const name = rev?.data?.errorName;
    throw new Error(name === "NotAgent" ? "This key isn't an agent of that wallet." : name === "IsPaused" ? "The wallet is frozen. The owner can unfreeze it." : name === "DecisionLimitReached" ? "The wallet's daily decision limit is reached." : name === "BlockedLimitReached" ? "Too many stopped payments today: the wallet stopped taking more." : name ? `The wallet refused: ${name}.` : /insufficient funds|gas/i.test(String((e as Error).message)) ? "The agent has no OKB for gas. Send it a little first." : (e as Error).message.split("\n")[0]);
  }
  const wc = createWalletClient({ account, chain: XLAYER, transport: http(BROWSER_RPC) });
  let hash: Hex;
  try { hash = await wc.writeContract({ address: wallet, abi: fuseboxWalletAbi, functionName: "pay", args, chain: XLAYER, account }); }
  catch (e) {
    const m = String((e as Error).message);
    if (/exceeds the balance|insufficient funds|gas required exceeds/i.test(m)) {
      const [have, n] = await Promise.all([pub.getBalance({ address: account.address }), pub.readContract({ address: wallet, abi: fuseboxWalletAbi, functionName: "fuseCount" }).catch(() => 4n)]);
      const need = await gasNeeded(Number(n));
      throw new Error(`Your agent needs a little more OKB for gas: it holds ${(Number(have) / 1e18).toFixed(5)}, a payment needs about ${(Number(need) / 1e18).toFixed(5)} up front.`);
    }
    throw new Error(m.split("\n")[0]);
  }
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
  for (const l of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: fuseboxWalletAbi, data: l.data, topics: l.topics });
      if (ev.eventName === "Decision") return { hash, allowed: ev.args.allowed, decisionId: Number(ev.args.decisionId), status: ev.args.status.map((s) => STATUS[s] ?? "failed") };
    } catch { /* another contract's log */ }
  }
  throw new Error("The transaction landed but recorded no decision.");
}
