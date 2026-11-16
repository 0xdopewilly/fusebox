import type { Metadata } from "next";
import RobView from "@/components/app/RobView";
import { agentMode } from "@/lib/robAgent";

export const metadata: Metadata = {
  title: "Rob the agent · Fusebox",
  description: "Write the scam. An AI payables agent reads it and decides; whatever it tries to pay goes through Atlas's real fuses on X Layer. Read-only, nothing moves.",
};

// which agent answers is decided at runtime (a key may be added without a rebuild)
export const dynamic = "force-dynamic";

export default function RobPage() {
  return <RobView mode={agentMode()} />;
}
