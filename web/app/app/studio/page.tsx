import type { Metadata } from "next";
import StudioView from "@/components/app/StudioView";

export const metadata: Metadata = {
  title: "Fuse Studio · Fusebox",
  description: "Build a fuse from rules, prove it against every input, and tape it out on TapeOut from your own wallet. It lists in Fusebox's market and earns its designer a fee on every check.",
};

export default function StudioPage() {
  return <StudioView />;
}
