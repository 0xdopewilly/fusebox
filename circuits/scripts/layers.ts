// Export each fuse's real gate structure for the design: logic depth of every gate (inputs are depth 0).
import { readFileSync, writeFileSync } from "node:fs";
import { decode, hexToBytes, OP_LATCH } from "../src/tap02.ts";
const build = JSON.parse(readFileSync(new URL("../build/fuses.json", import.meta.url), "utf8"));
const out = build.fuses.map((f: any) => {
  const els = decode(hexToBytes(f.netlist), f.nIn);
  const depth: number[] = new Array(f.nIn).fill(0);
  const gates = els.map((e) => {
    const d = e.op === OP_LATCH ? 1 : 1 + Math.max(0, ...e.ins.map((s) => depth[s] ?? 0));
    for (let i = 0; i < e.nOut; i++) depth[e.firstOut + i] = d;
    return { d, latch: e.op === OP_LATCH, ins: e.ins, out: e.firstOut };
  });
  return { key: f.key, title: f.title, nIn: f.nIn, gates: gates.length, depth: Math.max(...gates.map((g) => g.d)), layout: gates };
});
writeFileSync(new URL("../../design/data/fuse-layers.json", import.meta.url), JSON.stringify(out));
for (const f of out) console.log(f.key, "inputs", f.nIn, "gates", f.gates, "depth", f.depth);
