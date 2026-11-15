/**
 * Second-generation fuses: rival circuits for the same four sockets. A socket fixes what the wallet tells a
 * circuit; the circuit decides. These show the market's premise: different designers can sell different
 * policies for one socket, and a wallet owner picks per install.
 *
 * Same contract as src/fuses.ts: a gate-level build() and a plain spec(), checked against each other through
 * the encoded TAP-02 bytes in test/rivals.test.ts.
 */
import { Builder, lessOrEqual } from "./builder.ts";
import { SOCKET_APPROVAL_2OF3, SOCKET_BREAKER, SOCKET_DAILY_CAP, SOCKET_PAYEE_GUARD, pin, pinBus, type FuseDesign } from "./fuses.ts";

// Daily Cap socket. Ignores today's spend: no single payment may exceed the cap.
export const PER_PAYMENT_CAP: FuseDesign = {
  key: "per-payment-cap",
  title: "Per-Payment Cap",
  socket: SOCKET_DAILY_CAP,
  nState: 0,
  story: "However many invoices arrive, no single payment can be bigger than the cap.",
  build() {
    const s = SOCKET_DAILY_CAP;
    const b = new Builder(s.nIn);
    const out = lessOrEqual(b, pinBus(b, s, "amount"), pinBus(b, s, "cap"));
    return b.build("per-payment-cap", [out]);
  },
  spec(f) {
    return { out: f.amount <= f.cap ? 1 : 0, newState: [] };
  },
};

// Payee Guard socket. No trial allowance at all: a payee is paid only once its cooling-off is over.
export const STRICT_PAYEES: FuseDesign = {
  key: "strict-payees",
  title: "Strict Payee Book",
  socket: SOCKET_PAYEE_GUARD,
  nState: 0,
  story: "A newly saved payee gets nothing, not even a test payment, until its cooling-off is over.",
  build() {
    const s = SOCKET_PAYEE_GUARD;
    const b = new Builder(s.nIn);
    const cooled = lessOrEqual(b, pinBus(b, s, "cooldown"), pinBus(b, s, "age"));
    const out = b.and(pin(b, s, "listed"), cooled);
    return b.build("strict-payees", [out]);
  },
  spec(f) {
    return { out: f.listed === 1 && f.age >= f.cooldown ? 1 : 0, newState: [] };
  },
};

// Breaker socket, two LATCHes. A first payment to a stranger is refused and remembered (a strike); the second
// blows the breaker. Freeze (set) blows it at once; the owner's reset (clear) clears both.
//   trip    = attempt AND suspect
//   strike' = NOT clear AND (strike OR trip)
//   blown'  = set OR (trip AND strike) OR (blown AND NOT clear)      (set wins over clear: fail safe)
//   out     = NOT blown AND NOT trip
export const TWO_STRIKE_BREAKER: FuseDesign = {
  key: "two-strike-breaker",
  title: "Two-Strike Breaker",
  socket: SOCKET_BREAKER,
  nState: 2,
  story: "One odd payee is a typo; two is a pattern. The first is refused, the second blows the breaker.",
  build() {
    const s = SOCKET_BREAKER;
    const b = new Builder(s.nIn);
    const strike = b.latch();
    const blown = b.latch();
    const trip = b.and(pin(b, s, "attempt"), pin(b, s, "suspect"));
    const nClear = b.not(pin(b, s, "clear"));
    b.setD(strike, b.and(nClear, b.or(strike, trip)));
    b.setD(blown, b.or(pin(b, s, "set"), b.or(b.and(trip, strike), b.and(blown, nClear))));
    const out = b.and(b.not(blown), b.not(trip));
    return b.build("two-strike-breaker", [out]);
  },
  spec(f, state) {
    const [strike, blown] = state;
    const trip = f.attempt & f.suspect;
    const nClear = 1 - f.clear;
    return { out: (1 - blown) & (1 - trip), newState: [nClear & (strike | trip), f.set | (trip & strike) | (blown & nClear)] };
  },
};

// Approval socket. Above the threshold it takes two approvals, and seat 1 (say, the finance lead) must be one.
export const LEAD_APPROVER: FuseDesign = {
  key: "lead-approver",
  title: "Lead Approver",
  socket: SOCKET_APPROVAL_2OF3,
  nState: 0,
  story: "Above the threshold, two must sign and one of them must be seat 1.",
  build() {
    const s = SOCKET_APPROVAL_2OF3;
    const b = new Builder(s.nIn);
    const small = lessOrEqual(b, pinBus(b, s, "amount"), pinBus(b, s, "threshold"));
    const [a0, a1, a2] = pinBus(b, s, "approvals");
    const out = b.or(small, b.and(a0, b.or(a1, a2)));
    return b.build("lead-approver", [out]);
  },
  spec(f) {
    const a0 = f.approvals & 1, a1 = (f.approvals >> 1) & 1, a2 = (f.approvals >> 2) & 1;
    return { out: f.amount <= f.threshold || (a0 && (a1 || a2)) ? 1 : 0, newState: [] };
  },
};

export const RIVALS: FuseDesign[] = [PER_PAYMENT_CAP, STRICT_PAYEES, TWO_STRIKE_BREAKER, LEAD_APPROVER];
