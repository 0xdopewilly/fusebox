import "./app.css";
import AppBar from "@/components/app/AppBar";
import WalletProvider from "@/components/app/WalletProvider";
import Dock from "@/components/app/Dock";
import { ChromeProvider } from "@/components/app/m/chrome";
import Intro from "@/components/app/m/Intro";

export const metadata = {
  title: "Fusebox app · Atlas, a live agent wallet on X Layer",
  description: "Try to scam Atlas, a live AI-agent wallet on X Layer: its five TapeOut fuses decide every payment. Wire up your own wallet, approve payments, or sell a fuse.",
  openGraph: { title: "Try to scam Atlas · Fusebox", description: "A live AI-agent wallet on X Layer. Pick a scam; its five TapeOut fuses decide on mainnet.", url: "/app" },
  twitter: { title: "Try to scam Atlas · Fusebox", description: "A live AI-agent wallet on X Layer. Pick a scam; its five TapeOut fuses decide on mainnet." },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <ChromeProvider>
        <AppBar />
        <div className="wipe" aria-hidden="true" />
        <main id="main">{children}</main>
        <Dock />
        <Intro />
      </ChromeProvider>
    </WalletProvider>
  );
}
