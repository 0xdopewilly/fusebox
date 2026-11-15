import WalletView from "@/components/app/WalletView";

export const metadata = { title: "Fusebox wallet · X Layer" };

export default async function WalletPage({ params, searchParams }: { params: Promise<{ address: string }>; searchParams: Promise<{ from?: string }> }) {
  const { address } = await params;
  const { from } = await searchParams;
  return <WalletView address={address} from={from ? Number(from) : undefined} />;
}
