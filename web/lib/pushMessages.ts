import { getAddress } from "viem";

/** The texts signed for alerts, shared by the browser and the server so they match byte for byte. */
export function subscribeMessage(approver: string, device: string, issued: number) {
  return `Fusebox approvals\nSend this device alerts for payments waiting on ${getAddress(approver)}.\nDevice: ${device}\nIssued: ${issued}`;
}
/** What an agent signs to ask its wallet's approvers for a payment the fuses held for approval. */
export function requestMessage(wallet: string, to: string, amount: string, memo: string, issued: number) {
  return `Fusebox approval request\nWallet: ${getAddress(wallet)}\nTo: ${getAddress(to)}\nAmount: ${amount} USDT0\nMemo: ${memo}\nIssued: ${issued}`;
}
