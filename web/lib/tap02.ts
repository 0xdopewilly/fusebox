/** TAP-02 netlist decoding (records only), enough to draw a circuit read from a TapeOut processor.
 *  Signals: 0 and 1 are constants, then the nIn inputs, then each element's outputs in order. */
export interface NetEl { op: number; ins: number[]; nOut: number; firstOut: number }
export const OP_NAND = 0, OP_LATCH = 1, OP_REF = 2;

export function decodeNetlist(hex: string, nIn: number): NetEl[] {
  const b = Uint8Array.from((hex.startsWith("0x") ? hex.slice(2) : hex).match(/../g) ?? [], (x) => parseInt(x, 16));
  let p = 0, next = 2 + nIn;
  const els: NetEl[] = [];
  const u24 = () => { if (p + 3 > b.length) throw new Error("truncated"); const v = (b[p] << 16) | (b[p + 1] << 8) | b[p + 2]; p += 3; return v; };
  while (p < b.length) {
    const op = b[p++];
    let e: NetEl;
    if (op === OP_NAND) e = { op, ins: [u24(), u24()], nOut: 1, firstOut: next };
    else if (op === OP_LATCH) e = { op, ins: [u24()], nOut: 1, firstOut: next };
    else if (op === OP_REF) { p += 28; const ni = b[p++], no = b[p++]; const ins = Array.from({ length: ni }, u24); e = { op, ins, nOut: no, firstOut: next }; }
    else throw new Error(`unknown opcode ${op}`);
    next += e.nOut; els.push(e);
  }
  return els;
}
