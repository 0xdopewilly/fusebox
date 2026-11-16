// A tiny x402 seller for the tests: Kano Cotton's price sheet for 0.01 USDT0, gated by fusebox-sdk/x402's requirePayment
// and verified against whatever chain `rpc` points at (mainnet for the read-only tests, the fork for the paying one).
import { createServer } from "node:http";
import { createPublicClient, http, defineChain } from "viem";
import { requirePayment } from "fusebox-sdk/x402";

export const SUPPLIER = "0x69dB89385E8a69278a49335C432d0c70ec86A6C4";

export async function startSeller({ rpc = "https://rpc.xlayer.tech", price = "0.01", payTo = SUPPLIER } = {}) {
  const chain = defineChain({ id: 196, name: "X Layer", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  const client = createPublicClient({ chain, transport: http(rpc) });
  let port = 0;
  const server = createServer(async (req, res) => {
    try {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const gate = await requirePayment(new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers }), { payTo, price, secret: "test-secret-not-for-production", client, description: "Kano Cotton price sheet" });
      if (!gate.paid) {
        res.writeHead(gate.response.status, Object.fromEntries(gate.response.headers));
        res.end(await gate.response.text());
        return;
      }
      res.writeHead(200, { "content-type": "application/json", ...gate.headers });
      res.end(JSON.stringify({ supplier: "Kano Cotton", currency: "USDT0", items: [{ sku: "KC-20", name: "Combed cotton yarn 20s", unit: "kg", price: "2.10" }], paidBy: gate.payer, decision: gate.decisionId }));
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" }); res.end(String(e?.message ?? e));
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  return { url: `http://127.0.0.1:${port}/prices`, close: () => new Promise((r) => server.close(r)) };
}
