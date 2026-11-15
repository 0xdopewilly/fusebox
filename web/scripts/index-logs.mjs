// Records which blocks hold Fusebox events (Atlas + registry) so the app never has to scan X Layer's whole history.
// X Layer RPCs cap eth_getLogs ranges (rpc.xlayer.tech: 100 blocks, tapeout.net: 1000). Run after new on-chain activity:
//   node scripts/index-logs.mjs            (updates lib/deployments/mainnet-index.json)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const dep = JSON.parse(readFileSync(new URL("../lib/deployments/mainnet.json", import.meta.url)));
const idxUrl = new URL("../lib/deployments/mainnet-index.json", import.meta.url);
const idx = existsSync(idxUrl) ? JSON.parse(readFileSync(idxUrl)) : { blocks: [], scannedTo: dep.fromBlock - 1 };
const RPCS = [["https://tapeout.net/rpc-xlayer", 1000], ["https://rpc.xlayer.tech", 100]];
const rpc = async (url, method, params) => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
};
const head = parseInt(await rpc(RPCS[1][0], "eth_blockNumber", []), 16);
const blocks = new Set(idx.blocks);
let from = idx.scannedTo + 1, calls = 0;
for (const [url, step] of RPCS) {
  try {
    while (from <= head) {
      const jobs = [];
      for (let k = 0; k < 6 && from <= head; k++, from += step) {
        const a = from, b = Math.min(head, from + step - 1);
        jobs.push(rpc(url, "eth_getLogs", [{ address: [dep.atlas, dep.registry], fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16) }]).then((logs) => { calls++; logs.forEach((l) => blocks.add(parseInt(l.blockNumber, 16))); return b; }));
      }
      const ends = await Promise.all(jobs);
      idx.scannedTo = Math.max(...ends);
    }
    break;
  } catch (e) { console.log(`${url} failed (${e.message}); falling back`); from = idx.scannedTo + 1; }
}
idx.blocks = [...blocks].sort((a, b) => a - b);
writeFileSync(idxUrl, JSON.stringify(idx, null, 1) + "\n");
console.log(`indexed to ${idx.scannedTo} (head ${head}) with ${calls} calls · ${idx.blocks.length} blocks hold Fusebox events: ${idx.blocks.join(", ")}`);
