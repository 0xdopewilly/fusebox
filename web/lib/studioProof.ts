/**
 * Proves a Fuse Studio circuit: its encoded TAP-02 bytes, decoded and run (bitsliced, 32 vectors a word), must
 * give the rule's answer on every input checked. Combinational sockets up to 24 inputs are checked exhaustively;
 * Payee Guard (33 inputs, 8.6 billion of them) is proved symbolically: the circuit, gate by gate from its own bytes,
 * and the rule, built from each condition's definition, become BDDs over one variable order, and equal BDDs mean the
 * same answer on every input. If they differ, a real counterexample is run through the circuit and reported.
 * The Breaker is checked on every (state, input) pair and long random sequences. Runs in chunks so the page stays live.
 */
import { beat, compileBitsliced, load } from "./circuits/tap02";
import { Bdd, BddTooBig } from "./circuits/optimize";
import { circuitBdd, compare, orderFor, symOf } from "./circuits/symbolic";
import { pinsOf, ruleSym, type Compiled, type Fields, type Rule } from "./studio";

export interface Proof { checked: number; mismatches: number; mode: string; example?: { fields: Fields; want: number; got: number } }

const LANE = [0xaaaaaaaa | 0, 0xcccccccc | 0, 0xf0f0f0f0 | 0, 0xff00ff00 | 0, 0xffff0000 | 0];
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Every input at once: the circuit's BDD against the rule's. Null when it can't be done (then the caller samples). */
export function proveSymbolic(c: Compiled, socket: number, rule: Rule): Proof | null {
  if (c.nState) return null;
  const pins = pinsOf(socket);
  const levelOf = orderFor(c.nIn, pins, [["age", "cooldown"], ["amount", "trial"], ["spent", "cap"], ["amount", "threshold"]]);
  try {
    const bdd = new Bdd(2_000_000);
    const bus = (name: string) => { const q = pins.find((x) => x.name === name); if (!q) throw new Error(`no pin ${name}`); return Array.from({ length: q.width }, (_, k) => bdd.variable(levelOf[q.offset + k])); };
    const want = ruleSym(rule, symOf(bdd), bus);
    // the circuit as TapeOut will run it: decoded from its own bytes, every NAND applied in order
    const got = want === null ? null : circuitBdd(bdd, c.net.bytes, c.nIn, levelOf);
    if (want === null || got === null) return null;
    const total = 2 ** c.nIn;
    const r = compare(bdd, got, want, c.nIn, levelOf);
    if (r.equal) return { checked: total, mismatches: 0, mode: `every one of the 2^${c.nIn} inputs (${total.toLocaleString("en-US")}), proved with BDDs: the circuit and the rule are the same function` };
    // they differ: the counterexample is run through the real circuit and the rule, so the report can't be fake
    const bits = r.counterexample!;
    const fields: Fields = {};
    for (const q of pins) { let v = 0; for (let k = 0; k < q.width; k++) v |= bits[q.offset + k] << k; fields[q.name] = v; }
    const run = beat(load(c.net.bytes, c.nIn, 1), [], bits).outputs[0];
    return { checked: total, mismatches: Number(r.mismatches), mode: `every one of the 2^${c.nIn} inputs, compared with BDDs`, example: { fields, want: c.spec(fields, []).out, got: run } };
  } catch (e) {
    if (e instanceof BddTooBig) return null;
    throw e;
  }
}

export async function prove(c: Compiled, socket: number, onProgress: (done: number, total: number) => void, rule?: Rule): Promise<Proof> {
  const circuit = load(c.net.bytes, c.nIn, 1);
  const pins = pinsOf(socket);
  let bad = 0, checked = 0;
  let example: Proof["example"];
  const miss = (fields: Fields, want: number, got: number) => { bad++; if (!example) example = { fields, want, got }; };

  if (c.nState > 0) {
    // every (state, input) pair, then random sequences carried beat to beat
    const nS = c.nState, total = 2 ** nS * 2 ** c.nIn + 20000;
    for (let s = 0; s < 2 ** nS; s++) for (let i = 0; i < 2 ** c.nIn; i++) {
      const state = Array.from({ length: nS }, (_, k) => (s >> k) & 1), bits = Array.from({ length: c.nIn }, (_, k) => (i >> k) & 1);
      const fields: Fields = {}; for (const p of pins) fields[p.name] = (i >> p.offset) & ((1 << p.width) - 1);
      const got = beat(circuit, state, bits), want = c.spec(fields, state);
      checked++; if (got.outputs[0] !== want.out || got.newState.join() !== want.newState.join()) miss(fields, want.out, got.outputs[0]);
    }
    let state = Array(nS).fill(0), seed = 0x5eed;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16) & 15;
    for (let i = 0; i < 20000; i++) {
      const v = rnd(), bits = [0, 1, 2, 3].map((k) => (v >> k) & 1);
      const fields: Fields = { set: bits[0], clear: bits[1], attempt: bits[2], suspect: bits[3] };
      const got = beat(circuit, state, bits), want = c.spec(fields, state);
      checked++; if (got.outputs[0] !== want.out || got.newState.join() !== want.newState.join()) miss(fields, want.out, got.outputs[0]);
      state = got.newState;
      if (i % 4000 === 0) { onProgress(checked, total); await tick(); }
    }
    onProgress(total, total);
    return { checked, mismatches: bad, mode: `every state with every input (${2 ** nS} × ${2 ** c.nIn}), so every sequence of payments follows the rule; plus 20,000 random beats in a row`, example };
  }

  const ev = compileBitsliced(circuit);
  const words = new Int32Array(c.nIn);
  const fieldsOfLane = (lane: number): Fields => {
    const f: Fields = {};
    for (const p of pins) { let v = 0; for (let k = 0; k < p.width; k++) v |= ((words[p.offset + k] >>> lane) & 1) << k; f[p.name] = v; }
    return f;
  };
  const runBatch = () => {
    const out = ev(words)[0];
    for (let lane = 0; lane < 32; lane++) {
      const f = fieldsOfLane(lane), want = c.spec(f, []).out, got = (out >>> lane) & 1;
      checked++; if (got !== want) miss(f, want, got);
    }
  };

  if (c.nIn <= 24) {
    for (let i = 0; i < 5; i++) words[i] = LANE[i];
    const batches = 2 ** (c.nIn - 5);
    for (let bIdx = 0; bIdx < batches; bIdx++) {
      for (let i = 5; i < c.nIn; i++) words[i] = (bIdx >>> (i - 5)) & 1 ? -1 : 0;
      runBatch();
      if ((bIdx & 2047) === 2047) { onProgress(checked, batches * 32); await tick(); }
    }
    onProgress(checked, batches * 32);
    return { checked, mismatches: bad, mode: `every one of the 2^${c.nIn} inputs`, example };
  }

  // above 24 inputs: the complete symbolic proof
  if (rule) { onProgress(0, 1); await tick(); const sym = proveSymbolic(c, socket, rule); if (sym) { onProgress(1, 1); return sym; } }

  // fallback when a symbolic proof can't be built: each 16-bit operand pair exhaustively (both values of the 1-bit
  // pin), the rest random; then random
  let seed = 0x1234567;
  const rnd32 = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const byName = Object.fromEntries(pins.map((p) => [p.name, p]));
  const blocks = [["age", "cooldown"], ["amount", "trial"]].filter((b) => b.every((n) => byName[n]));
  const structured = blocks.length * 2 * 65536, random = 1_000_000, total = structured + random;
  for (const [x, y] of blocks) for (let listed = 0; listed < 2; listed++) {
    for (let base = 0; base < 65536; base += 32) {
      for (let i = 0; i < c.nIn; i++) words[i] = rnd32();
      for (let k = 0; k < byName.listed.width; k++) words[byName.listed.offset + k] = listed ? -1 : 0;
      for (let lane = 0; lane < 32; lane++) {
        const v = base + lane, xv = v & 255, yv = v >> 8;
        for (let k = 0; k < 8; k++) {
          const wx = byName[x].offset + k, wy = byName[y].offset + k;
          words[wx] = ((xv >> k) & 1) ? words[wx] | (1 << lane) : words[wx] & ~(1 << lane);
          words[wy] = ((yv >> k) & 1) ? words[wy] | (1 << lane) : words[wy] & ~(1 << lane);
        }
      }
      runBatch();
      if ((base & 8191) === 0) { onProgress(checked, total); await tick(); }
    }
  }
  for (let n = 0; n < random / 32; n++) {
    for (let i = 0; i < c.nIn; i++) words[i] = rnd32();
    runBatch();
    if ((n & 2047) === 2047) { onProgress(checked, total); await tick(); }
  }
  onProgress(total, total);
  return { checked, mismatches: bad, mode: "each comparator's 65,536 operand pairs with the payee saved and not, plus 1,000,000 random inputs", example };
}
