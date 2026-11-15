// Emits build/rivals.json: the second-generation fuses' TAP-02 netlists, ready to tape out and list.
import { mkdirSync, writeFileSync } from "node:fs";
import { RIVALS } from "../src/rivals.ts";

const rivals = RIVALS.map((f) => {
  const n = f.build();
  return {
    key: f.key, title: f.title, story: f.story, socket: { id: f.socket.id, key: f.socket.key },
    nIn: n.nIn, nOut: n.nOut, nState: n.nState, nand: n.nand, latch: n.latch, gates: n.gates,
    bytes: n.bytes.length, keccak256: n.keccak, netlist: n.hex,
  };
});
const root = new URL("../", import.meta.url);
mkdirSync(new URL("build/", root), { recursive: true });
writeFileSync(new URL("build/rivals.json", root), JSON.stringify({ format: "fusebox-fuses/1", tap: "TAP-02", rivals }, null, 2) + "\n");
for (const r of rivals) console.log(`${r.key.padEnd(20)} socket ${r.socket.id} · ${r.nand} NAND${r.latch ? ` + ${r.latch} LATCH` : ""} · ${r.bytes} bytes · ${r.keccak256.slice(0, 12)}…`);
