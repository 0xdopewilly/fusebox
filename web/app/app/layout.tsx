import "./app.css";
import AppBar from "@/components/app/AppBar";
import WalletProvider from "@/components/app/WalletProvider";

export const metadata = { title: "Fusebox app · Atlas, a live agent wallet on X Layer" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <AppBar />
      <div className="wipe" aria-hidden="true" />
      {children}
    </WalletProvider>
  );
}
