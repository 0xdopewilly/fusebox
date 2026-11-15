import type { Metadata } from "next";
import SimulateView from "@/components/app/SimulateView";

export const metadata: Metadata = {
  title: "Line simulator · Fusebox",
  description: "Pick fuses and limits, line up the payments an agent might make, and run them through TapeOut's real circuits on X Layer. Free, no wallet, nothing moves.",
};

export default function SimulatePage() {
  return <SimulateView />;
}
