/**
 * Conformance of src/tap02.ts with the official TAP-02 test vectors
 * (TapeOutProtocol/TAPs, assets/tap-02/vectors.json, MIT; copied unchanged).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { IllFormed, beat, bytesToHex, decode, encode, hexToBytes, load, pack, unpack, type Circuit } from "../src/tap02.ts";

const path = new URL("./vectors/tap02-vectors.json", import.meta.url);
const raw = readFileSync(path);
const V = JSON.parse(raw.toString("utf8"));

type Ref = { cpu: string; id: number; nIn: number; nOut: number; netlist: string };

function resolverFor(refs: Ref[]) {
  const cache = new Map<string, Circuit>();
  const resolve = (cpu: string, cid: bigint): Circuit | undefined => {
    const r = refs.find((x) => x.cpu.toLowerCase() === cpu.toLowerCase() && BigInt(x.id) === cid);
    if (!r) return undefined;
    const key = `${cpu}#${cid}`;
    if (!cache.has(key)) cache.set(key, load(hexToBytes(r.netlist), r.nIn, r.nOut, resolve));
    return cache.get(key);
  };
  return resolve;
}

test("vectors file is the one TAP-02 publishes (SHA-256)", () => {
  assert.equal(createHash("sha256").update(raw).digest("hex"), "1a02f5cf991c130a22dc6cc6ee93d0f8fe0720afed081665fa8b8018aefd203b");
  assert.equal(V.format, "tap-netlist-vectors/1");
});

test("valid netlists: truth tables and beat sequences match", () => {
  let checked = 0;
  for (const v of V.valid) {
    const nIn = Number(v.nIn);
    const nOut = Number(v.nOut);
    const bytes = hexToBytes(v.netlist);
    const c = load(bytes, nIn, nOut, resolverFor(v.refs ?? []));
    assert.equal(c.nState, Number(v.nState), `${v.name} nState`);
    // decode -> encode round trip is byte-exact
    assert.equal(bytesToHex(encode(decode(bytes, nIn))), v.netlist.toLowerCase(), `${v.name} round trip`);
    if (v.truthTable) {
      for (const row of v.truthTable) {
        const r = beat(c, [], unpack(hexToBytes(row.inputs), nIn));
        assert.equal(bytesToHex(pack(r.outputs)).slice(2), row.outputs, `${v.name} ${row.inputs}`);
        checked++;
      }
    }
    if (v.beats) {
      for (const row of v.beats) {
        const r = beat(c, unpack(hexToBytes(row.state), c.nState), unpack(hexToBytes(row.inputs), nIn));
        assert.equal(bytesToHex(pack(r.outputs)).slice(2), row.outputs, `${v.name} out`);
        assert.equal(bytesToHex(pack(r.newState)).slice(2), row.newState, `${v.name} state`);
        checked++;
      }
    }
  }
  assert.ok(checked > 256, `checked ${checked} rows`);
});

test("ill-formed netlists are rejected with the TAP-02 reason", () => {
  for (const v of V.illFormed) {
    assert.throws(
      () => load(hexToBytes(v.netlist), Number(v.nIn), Number(v.nOut), resolverFor(v.refs ?? [])),
      (e: unknown) => e instanceof IllFormed && e.message === v.reason,
      v.name,
    );
  }
});

test("packing edge cases read leniently, like the contracts", () => {
  const nand = load(hexToBytes("0x00000002000003"), 2, 1);
  for (const c of V.packingEdgeCases.cases) {
    const r = beat(nand, [], unpack(hexToBytes(c.inputs), 2));
    assert.equal(bytesToHex(pack(r.outputs)).slice(2), c.outputs, c.case);
  }
});
