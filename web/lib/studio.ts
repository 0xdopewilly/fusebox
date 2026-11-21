/**
 * Fuse Studio: rules for one socket, compiled to a TAP-02 NAND netlist with the same toolchain as the shipped fuses
 * (lib/circuits = circuits/src), plus the plain-JS spec the proof checks the netlist against.
 *
 * A rule is groups of conditions. Each group is ALL of its conditions (the default), ANY of them, AT LEAST k of them,
 * or NONE of them; the groups join with OR ("any group lets it through", the default) or AND ("every group must
 * hold"). So "allow if (A and B) or (at least 2 of C, D, E)" and "allow if (any of A, B) and (none of C)" both compile.
 * The Breaker socket is sequential, so it takes a strikes count instead: a stranger payment is refused and counted;
 * the Nth blows it until the owner resets.
 */
import { Builder, add, lessOrEqual, majority3, ONE, ZERO, type Netlist, type Sig } from "./circuits/builder";
import { SOCKETS } from "./sockets";

export type Fields = Record<string, number>;
export interface CondDef {
  kind: string;
  /** what the condition says, with its number when it has one */
  label: (k: number) => string;
  /** a number baked into the circuit (a fixed limit, a count, a seat) */
  param?: { label: string; min: number; max: number; def: number };
  /** which owner setting the condition reads, and what to call it on the install form */
  uses?: { a?: string; b?: string };
  build: (b: Builder, p: (name: string) => Sig[], k: number) => Sig;
  spec: (f: Fields, k: number) => boolean;
}
export interface Cond { kind: string; k: number }
export type GroupMode = "all" | "any" | "atleast" | "none";
/** how a group combines its conditions; k is the count for "atleast" */
export interface GroupOp { m: GroupMode; k: number }
export type Join = "any" | "all";
export interface Rule { socket: number; groups: Cond[][]; strikes: number; /** one per group; missing = "all" */ ops?: GroupOp[]; /** how groups combine; missing = "any" */ join?: Join }
export const GROUP_MODES: GroupMode[] = ["all", "any", "atleast", "none"];
export const opOf = (r: Rule, i: number): GroupOp => r.ops?.[i] ?? { m: "all", k: 0 };
const joinOf = (r: Rule): Join => r.join ?? "any";

const konst = (k: number): Sig[] => Array.from({ length: 8 }, (_, i) => ((k >> i) & 1 ? ONE : ZERO));
const anyOf = (b: Builder, xs: Sig[]) => xs.reduce((acc, x) => b.or(acc, x));
const allOf = (b: Builder, xs: Sig[]) => xs.reduce((acc, x) => b.and(acc, x));
/** at least k of xs are 1: a running count kept as "at least j so far" lines, O(n·k) gates (constants fold away) */
function atLeast(b: Builder, xs: Sig[], k: number): Sig {
  if (k <= 0) return ONE;
  if (k > xs.length) return ZERO;
  const t: Sig[] = [ONE, ...Array.from({ length: k }, () => ZERO)];
  for (const x of xs) for (let j = k; j >= 1; j--) t[j] = b.or(t[j], b.and(x, t[j - 1]));
  return t[k];
}
function groupSig(b: Builder, op: GroupOp, xs: Sig[]): Sig {
  return op.m === "any" ? anyOf(b, xs) : op.m === "none" ? b.not(anyOf(b, xs)) : op.m === "atleast" ? atLeast(b, xs, op.k) : allOf(b, xs);
}
function groupSpec(op: GroupOp, v: boolean[]): boolean {
  const n = v.filter(Boolean).length;
  return op.m === "any" ? n > 0 : op.m === "none" ? n === 0 : op.m === "atleast" ? n >= op.k : n === v.length;
}

export const CONDS: Record<number, CondDef[]> = {
  1: [
    { kind: "total", label: () => "today's total stays within the cap", uses: { a: "Cap per UTC day" },
      // same gate order as the shipped Daily Cap (circuit #15), so the Studio rebuilds it byte for byte
      build: (b, p) => { const t = add(b, p("spent"), p("amount")); const fits = lessOrEqual(b, t.sum, p("cap")); return b.and(b.not(t.carry), fits); },
      spec: (f) => f.spent + f.amount <= f.cap },
    { kind: "each", label: () => "this payment is at most the cap", uses: { a: "Largest single payment" },
      build: (b, p) => lessOrEqual(b, p("amount"), p("cap")), spec: (f) => f.amount <= f.cap },
    { kind: "half", label: () => "this payment is at most half the cap", uses: { a: "Cap (one payment ≤ half)" },
      build: (b, p) => { const c = p("cap"); return lessOrEqual(b, p("amount"), [...c.slice(1), ZERO]); }, spec: (f) => f.amount <= f.cap >> 1 },
    { kind: "fixed", label: (k) => `this payment is at most ${k} USD₮0, whatever the settings`, param: { label: "Fixed limit (USD₮0)", min: 1, max: 254, def: 100 },
      build: (b, p, k) => lessOrEqual(b, p("amount"), konst(k)), spec: (f, k) => f.amount <= k },
  ],
  2: [
    { kind: "listed", label: () => "the payee is saved", build: (b, p) => p("listed")[0], spec: (f) => f.listed === 1 },
    { kind: "cooled", label: () => "its cooling-off is over", uses: { a: "Cooling-off" }, build: (b, p) => lessOrEqual(b, p("cooldown"), p("age")), spec: (f) => f.age >= f.cooldown },
    { kind: "trial", label: () => "this payment is within the trial amount", uses: { b: "Trial amount" }, build: (b, p) => lessOrEqual(b, p("amount"), p("trial")), spec: (f) => f.amount <= f.trial },
    { kind: "age", label: (k) => `it was saved at least ${k} hours ago`, param: { label: "Hours", min: 1, max: 255, def: 72 },
      build: (b, p, k) => lessOrEqual(b, konst(k), p("age")), spec: (f, k) => f.age >= k },
    { kind: "fixed", label: (k) => `this payment is at most ${k} USD₮0`, param: { label: "Fixed limit (USD₮0)", min: 1, max: 254, def: 10 },
      build: (b, p, k) => lessOrEqual(b, p("amount"), konst(k)), spec: (f, k) => f.amount <= k },
  ],
  4: [
    { kind: "small", label: () => "this payment is at most the threshold", uses: { a: "Approvals above" }, build: (b, p) => lessOrEqual(b, p("amount"), p("threshold")), spec: (f) => f.amount <= f.threshold },
    { kind: "kof3", label: (k) => `at least ${k} of the 3 approvers signed`, param: { label: "Approvers", min: 1, max: 3, def: 2 },
      build: (b, p, k) => { const [a0, a1, a2] = p("approvals"); return k === 1 ? anyOf(b, [a0, a1, a2]) : k === 2 ? majority3(b, a0, a1, a2).maj : allOf(b, [a0, a1, a2]); },
      spec: (f, k) => [0, 1, 2].filter((i) => (f.approvals >> i) & 1).length >= k },
    { kind: "seat", label: (k) => `seat ${k} signed`, param: { label: "Seat", min: 1, max: 3, def: 1 },
      build: (b, p, k) => p("approvals")[k - 1], spec: (f, k) => ((f.approvals >> (k - 1)) & 1) === 1 },
    { kind: "fixed", label: (k) => `this payment is at most ${k} USD₮0`, param: { label: "Fixed limit (USD₮0)", min: 1, max: 254, def: 50 },
      build: (b, p, k) => lessOrEqual(b, p("amount"), konst(k)), spec: (f, k) => f.amount <= k },
  ],
  // the Repeat Guard socket (v2): the wallet works out both bits from its own records; the window is the owner's setting
  5: [
    { kind: "fresh", label: () => "the same payment hasn't gone out inside the window", uses: { a: "Window" }, build: (b, p) => b.not(p("repeat")[0]), spec: (f) => f.repeat === 0 },
    { kind: "cleared", label: () => "the owner cleared this repeat", build: (b, p) => p("cleared")[0], spec: (f) => f.cleared === 1 },
  ],
};
export const condOf = (socket: number, kind: string) => CONDS[socket]?.find((c) => c.kind === kind);

/** Pin offsets for a socket, least-significant first, as the wallet packs them. */
export function pinsOf(socket: number) {
  let off = 0;
  return (SOCKETS[socket]?.pins ?? []).map(([name, width]) => { const p = { name, offset: off, width }; off += width; return p; });
}

export function ruleText(r: Rule): string {
  if (r.socket === 3) return r.strikes === 1 ? "a payment to a stranger blows it; it stays blown until the owner resets it" : `the first ${r.strikes - 1} payment${r.strikes > 2 ? "s" : ""} to strangers ${r.strikes > 2 ? "are" : "is"} refused and counted; stranger number ${r.strikes} blows it until the owner resets it`;
  const phrase = (g: Cond[], op: GroupOp) => {
    const ls = g.map((c) => condOf(r.socket, c.kind)?.label(c.k) ?? c.kind);
    const list = (w: string) => (ls.length > 1 ? `${ls.slice(0, -1).join(", ")} ${w} ${ls[ls.length - 1]}` : ls[0]);
    if (op.m === "any") return ls.length === 1 ? ls[0] : ls.length === 2 ? `${ls[0]} or ${ls[1]}` : `any of: ${list("or")}`;
    if (op.m === "none") return ls.length === 1 ? `not: ${ls[0]}` : `none of: ${list("or")}`;
    if (op.m === "atleast") return `at least ${op.k} of: ${list("and")}`;
    return ls.join(" and ");
  };
  return r.groups.map((g, i) => phrase(g, opOf(r, i))).map((s) => (r.groups.length > 1 ? `(${s})` : s)).join(joinOf(r) === "all" ? " and " : " or ");
}

/** The owner settings a rule reads, labelled for the install form (left out = unused, hidden there). */
export function paramLabels(r: Rule): { a?: string; b?: string } | undefined {
  if (r.socket === 3) return undefined;
  const out: { a?: string; b?: string } = {};
  for (const g of r.groups) for (const c of g) { const u = condOf(r.socket, c.kind)?.uses; if (u?.a && !out.a) out.a = u.a; if (u?.b && !out.b) out.b = u.b; }
  return out;
}

export function ruleProblem(r: Rule): string | null {
  if (r.socket === 3) return r.strikes >= 1 && r.strikes <= 3 ? null : "Pick 1, 2 or 3 strikes";
  if (!r.groups.length) return "Add a condition";
  if (r.groups.some((g) => !g.length)) return "Every group needs at least one condition";
  if (r.ops && r.ops.length !== r.groups.length) return "Every group needs its own setting";
  for (let i = 0; i < r.groups.length; i++) {
    const op = opOf(r, i);
    if (!GROUP_MODES.includes(op.m)) return "Unknown group setting";
    if (op.m === "atleast" && (!Number.isInteger(op.k) || op.k < 1 || op.k > r.groups[i].length)) return `"At least" needs a number from 1 to ${r.groups[i].length}`;
  }
  for (const g of r.groups) for (const c of g) {
    const d = condOf(r.socket, c.kind); if (!d) return "Unknown condition";
    if (d.param && (!Number.isInteger(c.k) || c.k < d.param.min || c.k > d.param.max)) return `${d.param.label}: ${d.param.min} to ${d.param.max}`;
  }
  return null;
}

// ---- the breaker socket: N strikes. State: [count bit 0, count bit 1, blown] (count saturates at 2) or fewer latches.
function strikesSpec(n: number, f: Fields, s: number[]): { out: number; newState: number[] } {
  const trip = f.attempt & f.suspect, keep = 1 - f.clear;
  if (n === 1) { const q = s[0]; return { out: (1 - q) & (1 - trip), newState: [f.set | trip | (q & keep)] }; }
  if (n === 2) { const [st, q] = s; return { out: (1 - q) & (1 - trip), newState: [keep & (st | trip), f.set | (trip & st) | (q & keep)] }; }
  const [c0, c1, q] = s;
  return { out: (1 - q) & (1 - trip), newState: [keep & (trip ? (1 - c0) & (1 - c1) : c0), keep & (trip ? c0 | c1 : c1), f.set | (trip & c1) | (q & keep)] };
}
function strikesBuild(b: Builder, p: (n: string) => Sig[], n: number): Sig {
  const [set] = p("set"), [clear] = p("clear"), [attempt] = p("attempt"), [suspect] = p("suspect");
  const trip = b.and(attempt, suspect), keep = b.not(clear);
  if (n === 1) { const q = b.latch(); b.setD(q, b.or(set, b.or(trip, b.and(q, keep)))); return b.and(b.not(q), b.not(trip)); }
  if (n === 2) { const st = b.latch(), q = b.latch(); b.setD(st, b.and(keep, b.or(st, trip))); b.setD(q, b.or(set, b.or(b.and(trip, st), b.and(q, keep)))); return b.and(b.not(q), b.not(trip)); }
  const c0 = b.latch(), c1 = b.latch(), q = b.latch();
  const zero = b.and(b.not(c0), b.not(c1)), any = b.or(c0, c1);
  // trip ? x : y  as  (trip AND x) OR (NOT trip AND y)
  const mux = (x: Sig, y: Sig) => b.or(b.and(trip, x), b.and(b.not(trip), y));
  b.setD(c0, b.and(keep, mux(zero, c0)));
  b.setD(c1, b.and(keep, mux(any, c1)));
  b.setD(q, b.or(set, b.or(b.and(trip, c1), b.and(q, keep))));
  return b.and(b.not(q), b.not(trip));
}

export interface Compiled { net: Netlist; spec: (f: Fields, state: number[]) => { out: number; newState: number[] }; nIn: number; nState: number }

export function compile(r: Rule): Compiled {
  const pins = pinsOf(r.socket), nIn = pins.reduce((t, p) => t + p.width, 0);
  const b = new Builder(nIn);
  const p = (name: string) => { const x = pins.find((q) => q.name === name); if (!x) throw new Error(`no pin ${name}`); return b.bus(x.offset, x.width); };
  let out: Sig;
  if (r.socket === 3) out = strikesBuild(b, p, r.strikes);
  else {
    const gs = r.groups.map((g, i) => groupSig(b, opOf(r, i), g.map((c) => condOf(r.socket, c.kind)!.build(b, p, c.k))));
    out = joinOf(r) === "all" ? allOf(b, gs) : anyOf(b, gs);
  }
  const net = b.build("studio", [out]);
  const spec = r.socket === 3
    ? (f: Fields, s: number[]) => strikesSpec(r.strikes, f, s)
    : (f: Fields) => {
      const gs = r.groups.map((g, i) => groupSpec(opOf(r, i), g.map((c) => condOf(r.socket, c.kind)!.spec(f, c.k))));
      return { out: (joinOf(r) === "all" ? gs.every(Boolean) : gs.some(Boolean)) ? 1 : 0, newState: [] as number[] };
    };
  return { net, spec, nIn, nState: net.nState };
}

export function fieldsFromIndex(socket: number, idx: number): Fields {
  const f: Fields = {};
  for (const p of pinsOf(socket)) f[p.name] = Math.floor(idx / 2 ** p.offset) % 2 ** p.width;
  return f;
}
export function bitsFromFields(socket: number, f: Fields): number[] {
  const bits: number[] = [];
  for (const p of pinsOf(socket)) for (let k = 0; k < p.width; k++) bits.push(((f[p.name] ?? 0) >> k) & 1);
  return bits;
}

/** A draft as a URL-safe string: the rule and its name, so a design can be shared or tested before it's taped out. */
export function encodeDraft(r: Rule, name = ""): string {
  const plain = !r.ops?.some((o) => o.m !== "all") && joinOf(r) === "any"; // older drafts stay byte-identical
  const json = JSON.stringify({ s: r.socket, g: r.groups.map((g) => g.map((c) => [c.kind, c.k])), n: r.strikes, name: name.slice(0, 40), ...(plain ? {} : { o: r.groups.map((_, i) => [opOf(r, i).m, opOf(r, i).k]), j: joinOf(r) }) });
  const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeDraft(s: string): { rule: Rule; name: string } | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function" ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, "base64").toString("utf8");
    const j = JSON.parse(json) as { s: number; g: [string, number][][]; n: number; name?: string; o?: [string, number][]; j?: string };
    const rule: Rule = { socket: Number(j.s), groups: (j.g ?? []).map((g) => g.map(([kind, k]) => ({ kind: String(kind), k: Number(k) }))), strikes: Number(j.n) || 1 };
    if (Array.isArray(j.o)) rule.ops = j.o.map(([m, k]) => ({ m: String(m) as GroupMode, k: Number(k) || 0 }));
    if (j.j === "all" || j.j === "any") rule.join = j.j;
    if (![1, 2, 3, 4, 5].includes(rule.socket) || ruleProblem(rule)) return null;
    return { rule, name: typeof j.name === "string" ? j.name.slice(0, 40) : "" };
  } catch { return null; }
}
