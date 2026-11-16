import { DEMO_APIS } from "@/lib/x402";
import { paidRoute } from "@/lib/x402route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The fuses on a sensible wallet never let this through. If a wallet without them pays, it gets told what happened.
const r = paidRoute(DEMO_APIS[1], () => ({
  lesson: "This was Fusebox's scam demo, and your agent paid it. A wallet with Payee Guard and a Breaker would have refused before anything moved.",
  refund: "The payment went to Fusebox's deployer, not a scammer. Open an issue at github.com/0xdopewilly/fusebox with the transaction and it goes back.",
}));
export const GET = r.GET, OPTIONS = r.OPTIONS;
