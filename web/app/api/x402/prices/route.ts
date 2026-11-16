import { DEMO_APIS } from "@/lib/x402";
import { paidRoute } from "@/lib/x402route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// today's prices drift a little from day to day, so a paid call returns something worth a cent
const day = () => Math.floor(Date.now() / 86_400_000);
const drift = (base: number, k: number) => Number((base * (1 + 0.03 * Math.sin(day() * 0.7 + k))).toFixed(4));

const r = paidRoute(DEMO_APIS[0], () => ({
  seller: "Kano Cotton", currency: "USDT0", date: new Date(day() * 86_400_000).toISOString().slice(0, 10),
  items: [
    { sku: "KC-LINT-A", name: "Raw cotton lint, grade A", unit: "kg", price: drift(1.84, 1) },
    { sku: "KC-YARN-30", name: "Combed cotton yarn, 30s", unit: "kg", price: drift(3.12, 2) },
    { sku: "KC-GREY-60", name: "Grey fabric, 60 in", unit: "m", price: drift(0.96, 3) },
  ],
  note: "A demo seller on Fusebox: the agent paid for this response through its wallet's fuses on X Layer.",
}));
export const GET = r.GET, OPTIONS = r.OPTIONS;
