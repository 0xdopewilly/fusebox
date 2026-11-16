// Records which blocks hold Fusebox events (registry, factory, and every wallet the factory made, Atlas included),
// so the app never scans X Layer's whole history. Same event-signature filter as lib/logs.ts.
// X Layer RPCs cap eth_getLogs ranges (rpc.xlayer.tech and drpc: 100 blocks, tapeout.net: 1000). tapeout.net can sit
// behind a Cloudflare challenge (403) and rpc.xlayer.tech rate-limits bursts, so each source has its own concurrency
// and rate-limited calls are retried before falling back to the next source.
// Runs before every build (package.json "prebuild"); also by hand: node scripts/index-logs.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { keccak256, toBytes } from "viem";
const dep = JSON.parse(readFileSync(new URL("../lib/deployments/mainnet.json", import.meta.url)));
const idxUrl = new URL("../lib/deployments/mainnet-index.json", import.meta.url);
const idx = existsSync(idxUrl) ? JSON.parse(readFileSync(idxUrl)) : { blocks: [], scannedTo: dep.fromBlock - 1 };
if (idx.v !== 2) { idx.v = 2; idx.blocks = []; idx.scannedTo = dep.fromBlock - 1; idx.wallets = []; } // v2: signature filter, all wallets
const SIGS = ["Decision(uint256,address,address,address,uint256,bool,uint256[],uint8[],bytes[],bytes[],uint256,bytes32,string)", "PayeeAdded(address,uint64)", "PayeeRemoved(address)", "AgentSet(address,bool)",
  "FuseListed(uint256,address,uint256,address,uint32,uint32,uint32,uint96,bytes32,string)", "WalletCreated(address,address,address,address[])"];
const TOPICS = SIGS.map((s) => keccak256(toBytes(s)));
const CREATED = TOPICS[5];
const RPCS = [["https://tapeout.net/rpc-xlayer", 1000, 6], ["https://xlayer.drpc.org", 100, 4], ["https://rpc.xlayer.tech", 100, 2]];
const BUSY = /rate limit|too many|timeout|429|408|temporar/i;
const rpc = async (url, method, params) => {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20_000) });
      const text = await r.text();
      let j; try { j = JSON.parse(text); } catch { throw new Error(`HTTP ${r.status}, not JSON`); }
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) {
      if (i >= 4 || !BUSY.test(String(e.message))) throw e;
      await new Promise((res) => setTimeout(res, 800 * 2 ** i));
    }
  }
};
const known = new Set([dep.registry, dep.factory, dep.atlas, ...(idx.wallets ?? [])].map((a) => a.toLowerCase()));
const head = parseInt(await rpc(RPCS[1][0], "eth_blockNumber", []).catch(() => rpc(RPCS[2][0], "eth_blockNumber", [])), 16);
const blocks = new Set(idx.blocks);
let from = idx.scannedTo + 1, calls = 0;
for (const [url, step, conc] of RPCS) {
  try {
    while (from <= head) {
      const jobs = [];
      for (let k = 0; k < conc && from <= head; k++, from += step) {
        const a = from, b = Math.min(head, from + step - 1);
        jobs.push(rpc(url, "eth_getLogs", [{ topics: [TOPICS], fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16) }]).then((logs) => { calls++; return { b, logs }; }));
      }
      const done = await Promise.all(jobs);
      for (const { logs } of done) for (const l of logs) {
        const addr = l.address.toLowerCase();
        if (l.topics[0] === CREATED && addr === dep.factory.toLowerCase()) known.add(("0x" + l.topics[1].slice(26)).toLowerCase());
        if (known.has(addr)) blocks.add(parseInt(l.blockNumber, 16));
      }
      idx.scannedTo = Math.max(...done.map((d) => d.b));
    }
    break;
  } catch (e) { console.log(`${url} failed (${e.message}); falling back`); from = idx.scannedTo + 1; }
}
idx.blocks = [...blocks].sort((a, b) => a - b);
idx.wallets = [...known].filter((a) => ![dep.registry, dep.factory].map((x) => x.toLowerCase()).includes(a));
writeFileSync(idxUrl, JSON.stringify(idx, null, 1) + "\n");
console.log(`index: scanned to ${idx.scannedTo} (head ${head}) in ${calls} calls · ${idx.blocks.length} blocks with Fusebox events · ${idx.wallets.length} wallets`);
