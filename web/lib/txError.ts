import { BaseError, ContractFunctionRevertedError } from "viem";

/** The contracts' custom errors, in words a wallet owner, approver or designer can act on. */
const NAMED: Record<string, string> = {
  NotApprover: "Your connected wallet isn't one of this wallet's approvers.",
  AgentCannotApprove: "An agent can't approve payments, including its own.",
  NotOwner: "Only the wallet's owner can do this.",
  NotAgent: "Only one of the wallet's agents can do this.",
  NotAllowedToFreeze: "Only the owner, an agent or an approver can freeze this wallet.",
  NotCircuitOwner: "Your connected wallet doesn't own that circuit NFT.",
  AlreadyListed: "That circuit is already listed as a fuse.",
  UntrustedProcessor: "Fusebox doesn't accept circuits from that processor yet.",
  PinoutMismatch: "The circuit's inputs and outputs don't match a Fusebox socket.",
  StateMismatch: "The circuit's state bits don't match what the socket expects.",
  TooManyGates: "The circuit has more gates than a fuse allows.",
  TooMuchState: "The circuit keeps more state than a fuse allows.",
  IsPaused: "The wallet is paused. Its owner can resume it.",
  ZeroAmount: "Enter an amount above zero.",
  ZeroAddress: "One of the addresses is empty.",
  InsufficientFeeBalance: "The wallet's fee balance can't cover its fuses. Top it up first.",
  DuplicateApprover: "Each approver seat needs a different address.",
  FeeAboveMax: "This fuse's fee is above the most the wallet agreed to pay.",
  TokenNotEnabled: "That token isn't enabled on this wallet.",
  FuseNotListed: "That fuse has been delisted.",
  TooManyFuses: "The wallet already has the most fuses it can hold.",
};

/** One readable line for a failed wallet transaction. */
export function txError(e: unknown): string {
  const msg = (e as { shortMessage?: string; message?: string })?.shortMessage || (e as Error)?.message || "Failed";
  if (/user rejected|denied|cancel/i.test(msg)) return "You declined it in your wallet.";
  if (e instanceof BaseError) {
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = rev?.data?.errorName;
    if (name) return NAMED[name] ?? `The contract refused it: ${name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}.`;
    if (rev?.reason) return `The contract refused it: ${rev.reason}`;
  }
  const full = `${msg} ${(e as Error)?.message ?? ""}`;
  if (/exceeds the balance|insufficient funds/i.test(full)) return "Your wallet needs a little OKB on X Layer to pay for gas.";
  return msg.split("\n")[0];
}
