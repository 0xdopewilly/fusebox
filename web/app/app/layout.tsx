import "./app.css";
import AppBar from "@/components/app/AppBar";

export const metadata = { title: "Fusebox app · Atlas, a live agent wallet on X Layer" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppBar />
      <div className="wipe" aria-hidden="true" />
      {children}
    </>
  );
}
