import type { Metadata } from "next";
import WalletView from "@/components/app/WalletView";

type Props = { params: Promise<{ address: string }>; searchParams: Promise<{ from?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const short = /^0x[0-9a-fA-F]{40}$/.test(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : "wallet";
  const title = `Wallet ${short} · Fusebox`;
  const description = `A Fusebox wallet on X Layer: every payment its AI agent makes has to pass the fuses its owner chose. Live balance, fuses and decisions.`;
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

export default async function WalletPage({ params, searchParams }: Props) {
  const { address } = await params;
  const { from } = await searchParams;
  return <WalletView address={address} from={from ? Number(from) : undefined} />;
}
