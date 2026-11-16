import type { Metadata } from "next";
import { headers } from "next/headers";
import { DEMO_APIS, gate } from "@/lib/x402";
import { decodeHeader, type PaymentRequired } from "@/lib/x402core";
import X402View, { type Offer } from "@/components/app/X402View";

export const metadata: Metadata = {
  title: "Pay per call (x402) · Fusebox",
  description: "Agents paying for APIs over HTTP 402, where the price goes through the wallet's fuses first. Two live sellers on X Layer: an honest price sheet and a scam.",
};
export const dynamic = "force-dynamic";

export default async function X402Page() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  // the same offers an agent gets from GET <path>: freshly signed, a new nonce each time
  const offers: Offer[] = await Promise.all(DEMO_APIS.map(async (api) => {
    try {
      const g = await gate(new Request(origin + api.path), api);
      const raw = !g.paid ? g.response.headers.get("PAYMENT-REQUIRED") : null;
      return { ...api, url: origin + api.path, offer: raw ? decodeHeader<PaymentRequired>(raw) : null };
    } catch { return { ...api, url: origin + api.path, offer: null }; }
  }));
  return <X402View offers={offers} origin={origin} />;
}
