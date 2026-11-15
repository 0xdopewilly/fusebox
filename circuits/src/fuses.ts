/**
 * Fusebox guard circuits ("fuses") and the sockets they plug into.
 *
 * A *socket* is the pinout a FuseboxWallet drives: which input bit means what. It is fixed in the
 * wallet contract (contracts/src/libraries/Sockets.sol) and checked by FuseRegistry at listing time
 * (nIn, nOut). Any designer can tape out a different circuit for the same socket: the socket is the
 * interface, the circuit is the policy.
 *
 * Each design below has a gate-level `build()` and a plain-JS `spec()`; the tests check the encoded
 * netlist against the spec exhaustively (or exhaustively per block + randomly where 2^nIn is too big).
 */
import { Builder, add, lessOrEqual, majority3, type Netlist } from "./builder.ts";

export interface Pin {
  name: string;
  offset: number;
  width: number;
  doc: string;
}

export interface Socket {
  id: number;
  key: string;
  nIn: number;
  nOut: number;
  pins: Pin[];
  /** pins the wallet owner may drive in a control beat (sequential sockets only) */
  ownerPins: string[];
  doc: string;
}

export type Fields = Record<string, number>;

export interface FuseDesign {
  key: string;
  title: string;
  socket: Socket;
  /** the circuit's state width (number of LATCHes) */
  nState: number;
  build(): Netlist;
  /** reference behaviour: one beat from (state, fields) to (out, newState) */
  spec(f: Fields, state: number[]): { out: number; newState: number[] };
  story: string;
}

const pins = (...list: [string, number, string][]): Pin[] => {
  let offset = 0;
  return list.map(([name, width, doc]) => {
    const p = { name, offset, width, doc };
    offset += width;
    return p;
  });
};
const width = (p: Pin[]) => p.reduce((s, x) => s + x.width, 0);

// ---------------------------------------------------------------------------------------------
// Sockets (must match contracts/src/libraries/Sockets.sol)
// ---------------------------------------------------------------------------------------------

const capPins = pins(
  ["amount", 8, "this payment, in units of the install's `unit`, rounded up, saturating at 255"],
  ["spent", 8, "already spent today (UTC day) through this fuse slot, rounded up, saturating at 255"],
  ["cap", 8, "the owner's daily cap in units (0..254)"],
);
export const SOCKET_DAILY_CAP: Socket = {
  id: 1,
  key: "DAILY_CAP",
  nIn: width(capPins),
  nOut: 1,
  pins: capPins,
  ownerPins: [],
  doc: "Allow iff spent + amount <= cap. Payments in a token other than the install's token read amount = 255.",
};

const payeePins = pins(
  ["listed", 1, "the payee is in the owner's payee book"],
  ["age", 8, "hours since the payee was added, saturating at 255 (0 if not listed)"],
  ["cooldown", 8, "the install's cooling-off period in hours"],
  ["amount", 8, "this payment in units, rounded up, saturating at 255 (255 for another token)"],
  ["trial", 8, "largest payment in units allowed to a payee still cooling off (0..254)"],
);
export const SOCKET_PAYEE_GUARD: Socket = {
  id: 2,
  key: "PAYEE_GUARD",
  nIn: width(payeePins),
  nOut: 1,
  pins: payeePins,
  ownerPins: [],
  doc: "Payee book with a cooling-off period for new payees and a small trial allowance while cooling.",
};

const breakerPins = pins(
  ["set", 1, "owner freeze pulse (control beats only)"],
  ["clear", 1, "owner reset pulse (control beats only)"],
  ["attempt", 1, "1 on every payment decision, 0 on control beats"],
  ["suspect", 1, "the payee is not in the owner's payee book (payment beats only)"],
);
export const SOCKET_BREAKER: Socket = {
  id: 3,
  key: "BREAKER",
  nIn: width(breakerPins),
  nOut: 1,
  pins: breakerPins,
  ownerPins: ["set", "clear"],
  doc: "Sequential socket. Payment beats drive attempt=1 and suspect; owner control beats drive set/clear.",
};

const approvalPins = pins(
  ["approvals", 3, "bit k = approver k approved this exact payment (wallet, chain, epoch, token, to, amount) within the TTL"],
  ["amount", 8, "this payment in units, rounded up, saturating at 255 (255 for another token)"],
  ["threshold", 8, "payments up to this many units need no approval (0..254)"],
);
export const SOCKET_APPROVAL_2OF3: Socket = {
  id: 4,
  key: "APPROVAL_2OF3",
  nIn: width(approvalPins),
  nOut: 1,
  pins: approvalPins,
  ownerPins: [],
  doc: "Human approvals recorded on chain become input bits; the circuit decides when they are needed.",
};

export const SOCKETS: Socket[] = [SOCKET_DAILY_CAP, SOCKET_PAYEE_GUARD, SOCKET_BREAKER, SOCKET_APPROVAL_2OF3];

/** Input bits (LSB-first order) from named fields. */
export function bitsFromFields(socket: Socket, f: Fields): number[] {
  const bits = new Array<number>(socket.nIn).fill(0);
  for (const p of socket.pins) {
    const v = f[p.name] ?? 0;
    if (!Number.isInteger(v) || v < 0 || v >= 2 ** p.width) throw new Error(`${p.name}=${v} does not fit ${p.width} bits`);
    for (let k = 0; k < p.width; k++) bits[p.offset + k] = Math.floor(v / 2 ** k) % 2;
  }
  return bits;
}

export function fieldsFromBits(socket: Socket, bits: number[]): Fields {
  const f: Fields = {};
  for (const p of socket.pins) {
    let v = 0;
    for (let k = p.width - 1; k >= 0; k--) v = v * 2 + (bits[p.offset + k] ?? 0);
    f[p.name] = v;
  }
  return f;
}

export const pinBus = (b: Builder, s: Socket, name: string) => {
  const p = s.pins.find((x) => x.name === name);
  if (!p) throw new Error(`no pin ${name}`);
  return b.bus(p.offset, p.width);
};
export const pin = (b: Builder, s: Socket, name: string) => pinBus(b, s, name)[0];

// ---------------------------------------------------------------------------------------------
// Fuse 1: daily cap. 8-bit adder + no-borrow comparator; carry out of the adder must be 0.
// ---------------------------------------------------------------------------------------------
export const DAILY_CAP: FuseDesign = {
  key: "daily-cap",
  title: "Daily Cap",
  socket: SOCKET_DAILY_CAP,
  nState: 0,
  story: "Your agent can't spend more than the cap in a UTC day, no matter how it is asked.",
  build() {
    const s = SOCKET_DAILY_CAP;
    const b = new Builder(s.nIn);
    const total = add(b, pinBus(b, s, "spent"), pinBus(b, s, "amount")); // 9-bit spent + amount
    const fits = lessOrEqual(b, total.sum, pinBus(b, s, "cap"));
    const out = b.and(b.not(total.carry), fits);
    return b.build("daily-cap", [out]);
  },
  spec(f) {
    return { out: f.spent + f.amount <= f.cap ? 1 : 0, newState: [] };
  },
};

// ---------------------------------------------------------------------------------------------
// Fuse 2: payee guard. Listed AND (cooled off OR within the trial allowance).
// ---------------------------------------------------------------------------------------------
export const PAYEE_GUARD: FuseDesign = {
  key: "payee-guard",
  title: "Payee Guard",
  socket: SOCKET_PAYEE_GUARD,
  nState: 0,
  story: "Only saved payees get paid. A payee added today can receive a small test payment, not the invoice.",
  build() {
    const s = SOCKET_PAYEE_GUARD;
    const b = new Builder(s.nIn);
    const cooled = lessOrEqual(b, pinBus(b, s, "cooldown"), pinBus(b, s, "age"));
    const trialOk = lessOrEqual(b, pinBus(b, s, "amount"), pinBus(b, s, "trial"));
    const out = b.and(pin(b, s, "listed"), b.or(cooled, trialOk));
    return b.build("payee-guard", [out]);
  },
  spec(f) {
    const ok = f.listed === 1 && (f.age >= f.cooldown || f.amount <= f.trial);
    return { out: ok ? 1 : 0, newState: [] };
  },
};

// ---------------------------------------------------------------------------------------------
// Fuse 3: breaker. One LATCH. A payment to a stranger trips it; it stays blown until the owner resets.
//   trip = attempt AND suspect
//   q'   = set OR trip OR (q AND NOT clear)      (set wins over clear: fail safe)
//   out  = NOT q AND NOT trip                    (blocks the tripping payment and everything after)
// ---------------------------------------------------------------------------------------------
export const BREAKER: FuseDesign = {
  key: "breaker",
  title: "Breaker",
  socket: SOCKET_BREAKER,
  nState: 1,
  story: "The agent says \"sure thing, boss\" to a stranger: the fuse blows and stays blown until you reset it.",
  build() {
    const s = SOCKET_BREAKER;
    const b = new Builder(s.nIn);
    const q = b.latch();
    const nTrip = b.nand(pin(b, s, "attempt"), pin(b, s, "suspect"));
    const nHold = b.nand(q, b.not(pin(b, s, "clear")));
    const setOrTrip = b.nand(b.not(pin(b, s, "set")), nTrip);
    const d = b.nand(b.not(setOrTrip), nHold);
    b.setD(q, d);
    const out = b.and(b.not(q), nTrip);
    return b.build("breaker", [out]);
  },
  spec(f, state) {
    const q = state[0];
    const trip = f.attempt & f.suspect;
    const next = f.set | trip | (q & (1 - f.clear));
    return { out: (1 - q) & (1 - trip), newState: [next] };
  },
};

// ---------------------------------------------------------------------------------------------
// Fuse 4: 2-of-3 approval above a threshold.
//   out = amount <= threshold OR MAJ(approvals)
// ---------------------------------------------------------------------------------------------
export const APPROVAL_2OF3: FuseDesign = {
  key: "approval-2of3",
  title: "Two of Three",
  socket: SOCKET_APPROVAL_2OF3,
  nState: 0,
  story: "Small payments go through; anything above the threshold needs two of your three humans.",
  build() {
    const s = SOCKET_APPROVAL_2OF3;
    const b = new Builder(s.nIn);
    const small = lessOrEqual(b, pinBus(b, s, "amount"), pinBus(b, s, "threshold"));
    const [a0, a1, a2] = pinBus(b, s, "approvals");
    const { maj } = majority3(b, a0, a1, a2);
    const out = b.or(small, maj);
    return b.build("approval-2of3", [out]);
  },
  spec(f) {
    const votes = (f.approvals & 1) + ((f.approvals >> 1) & 1) + ((f.approvals >> 2) & 1);
    return { out: f.amount <= f.threshold || votes >= 2 ? 1 : 0, newState: [] };
  },
};

export const FUSES: FuseDesign[] = [DAILY_CAP, PAYEE_GUARD, BREAKER, APPROVAL_2OF3];
