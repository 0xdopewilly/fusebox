import "server-only";
import { gate, type DemoApi } from "./x402";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "PAYMENT-SIGNATURE, X-PAYMENT, content-type", "access-control-expose-headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE" };
const withCors = (res: Response) => { for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v); return res; };

/** A paid demo endpoint: 402 with a Fusebox offer until a valid payment arrives, then `body()` with the receipt. */
export function paidRoute(api: DemoApi, body: (paid: { payer: string; decisionId?: number; transaction: string }) => object) {
  return {
    async GET(req: Request) {
      try {
        const g = await gate(req, api);
        if (!g.paid) return withCors(g.response);
        return withCors(Response.json({ ...body(g), receipt: { payer: g.payer, decision: g.decisionId, transaction: g.transaction, network: "eip155:196" } }, { headers: { ...g.headers, "cache-control": "no-store" } }));
      } catch (e) {
        console.error("x402", api.path, (e as Error).message);
        return withCors(Response.json({ error: "Couldn't check the payment on X Layer just now. Try again." }, { status: 503 }));
      }
    },
    OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
  };
}
