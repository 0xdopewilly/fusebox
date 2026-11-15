import { walletCard, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A Fusebox wallet on X Layer: its fuses, decisions and balance";

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  return walletCard((await params).address);
}
