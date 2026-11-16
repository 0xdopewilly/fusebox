import type { Metadata } from "next";
import { headers } from "next/headers";
import { getStatus } from "@/lib/status";
import StatusView from "@/components/app/StatusView";

export const metadata: Metadata = {
  title: "Status · Fusebox",
  description: "Live health of every part Fusebox depends on: X Layer RPCs, TapeOut's processor, Atlas's fuses and fees, the AI agent, x402 sellers and approver alerts.",
};
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return <StatusView initial={await getStatus(origin)} />;
}
