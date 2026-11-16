// Copies the x402 core (sdk/src/x402.ts: offers, nonces, on-chain verification) into web/lib/x402core.ts, so the
// hosted demo sellers and verifier run the same code the SDK ships. Edit the original, then run this.
import { readFileSync, writeFileSync } from "node:fs";
const body = readFileSync(new URL("../../sdk/src/x402.ts", import.meta.url), "utf8");
writeFileSync(new URL("../lib/x402core.ts", import.meta.url), `// Copied from sdk/src/x402.ts by web/scripts/sync-x402.mjs. Edit the original.\n${body}`);
console.log("synced x402.ts");
