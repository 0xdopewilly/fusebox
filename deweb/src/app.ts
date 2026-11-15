// Fusebox · on-chain edition. Runs inside TapeKit's gateway with no server of its own: every number on the
// page comes from eth_call against X Layer's public nodes, the same nodes TapeKit itself reads this page from.
import { decodeFunctionResult, encodeFunctionData, formatUnits, getAddress, isAddress, keccak256, parseUnits, type Abi, type Address, type Hex } from "viem";
import { fuseboxWalletAbi, fuseRegistryAbi, tapeoutProcessorAbi } from "../../web/lib/abi";
import dep from "../../web/lib/deployments/mainnet.json";
import { decode, hexToBytes, OP_LATCH, OP_NAND, type Element } from "../../circuits/src/tap02";

// The X Layer nodes in TapeKit's own list (kernel/src/config.js). The gateway counts requests to them as on-chain.
const NODES = ["https://rpc.xlayer.tech", "https://xlayer.drpc.org", "https://196.rpc.thirdweb.com"];
const CONTAINER = "0x7af0647557909b07E0D92C4a8F63396120F8BDB3";
const SITE_REGISTRY = "0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6";
const ATLAS = dep.atlas as Address, REGISTRY = dep.registry as Address, USDT0 = dep.usdt0 as Address, SUPPLIER = dep.supplier;
const STATUS = ["pass", "blew", "failed", "untrusted"] as const;
const KEY: Record<number, string> = { 1: "daily-cap", 2: "payee-guard", 3: "breaker", 4: "approval-2of3" };
const NAME: Record<string, string> = { "daily-cap": "Daily Cap", "payee-guard": "Payee Guard", breaker: "Breaker", "approval-2of3": "Two of Three" };
const SAY: Record<string, string> = {
  "daily-cap": "No more than the owner's cap in a UTC day, however the agent is asked.",
  "payee-guard": "Saved payees only. A new payee gets a small trial amount until its 24-hour cooling-off ends.",
  breaker: "Trips on a payment to a stranger and stays blown until the owner resets it.",
  "approval-2of3": "Above a threshold, two of three approvers must sign that exact payment.",
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (v: bigint, d = 4) => Number(formatUnits(v, 6)).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ------------------------------------------------------------------ chain reads
let rid = 0, lastNode = NODES[0];
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let last: unknown = new Error("X Layer's nodes didn't answer.");
  for (const url of NODES) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }), signal: AbortSignal.timeout(9000) });
      const j = await r.json();
      if (j.error) { last = new Error(j.error.message); if (/revert/i.test(j.error.message)) throw last; continue; }
      lastNode = url;
      return j.result as T;
    } catch (e) { last = e; if (/revert/i.test(String((e as Error).message))) throw e; }
  }
  throw last;
}
async function read<R = unknown>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<R> {
  const data = encodeFunctionData({ abi, functionName, args } as Parameters<typeof encodeFunctionData>[0]);
  const out = await rpc<Hex>("eth_call", [{ to: address, data }, "latest"]);
  return decodeFunctionResult({ abi, functionName, data: out } as Parameters<typeof decodeFunctionResult>[0]) as R;
}
const W = (fn: string, args: readonly unknown[] = []) => read(ATLAS, fuseboxWalletAbi as Abi, fn, args);
const R = (fn: string, args: readonly unknown[] = []) => read(REGISTRY, fuseRegistryAbi as Abi, fn, args);

interface Slot { fuseId: bigint; processor: Address; circuitId: bigint; socket: number; nState: number; params: { unit: bigint; a: number; b: number }; state: Hex }
interface Fuse { slot: number; key: string; name: string; fuseId: number; circuitId: number; processor: Address; a: number; b: number; latched: boolean; spentToday: number; fee: bigint; decisions: bigint; lifetime: bigint; nIn: number; gates: number; nState: number }
let fuses: Fuse[] = [];

// ------------------------------------------------------------------ live block
async function tickBlock() {
  try { const b = Number(BigInt(await rpc<Hex>("eth_blockNumber", []))); $("block").textContent = b.toLocaleString("en-US"); $("bdot").style.background = ""; }
  catch { $("bdot").style.background = "var(--red)"; }
}

// ------------------------------------------------------------------ atlas + registry
async function loadAtlas() {
  const [n, dCount, bCount, fCount, protocol] = await Promise.all([W("fuseCount"), W("decisionCount"), W("blockedCount"), R("fuseCount"), R("protocolEarned")]) as bigint[];
  fuses = await Promise.all(Array.from({ length: Number(n) }, async (_, i) => {
    const s = await W("slotAt", [BigInt(i)]) as Slot;
    const [f, decisions, lifetime, spent] = await Promise.all([R("fuse", [s.fuseId]), R("decisions", [s.fuseId]), R("lifetimeEarned", [s.fuseId]), W("spentToday", [BigInt(i)])]) as [{ fee: bigint; nIn: number; gateCount: number }, bigint, bigint, bigint];
    const key = KEY[Number(s.socket)] ?? `socket-${s.socket}`;
    const unit = Number(s.params.unit) / 1e6;
    return {
      slot: i, key, name: NAME[key] ?? key, fuseId: Number(s.fuseId), circuitId: Number(s.circuitId), processor: s.processor,
      a: key === "payee-guard" ? Number(s.params.a) : Number(s.params.a) * unit, b: Number(s.params.b) * unit,
      latched: s.nState > 0 && s.state !== "0x" && BigInt(s.state) !== 0n, spentToday: Number(formatUnits(spent, 6)),
      fee: f.fee, decisions, lifetime, nIn: Number(f.nIn), gates: Number(f.gateCount), nState: Number(s.nState),
    };
  }));
  const earned = fuses.reduce((t, f) => t + f.lifetime, 0n);
  count("decisions", Number(fuses.reduce((t, f) => t + f.decisions, 0n)), 0);
  count("blocked", Number(bCount), 0);
  count("earned", Number(formatUnits(earned, 6)), 5);
  count("fuses", Number(fCount), 0);
  $("strip").querySelector<HTMLElement>('[data-k="circuits"]')!.textContent = fuses.map((f) => `#${f.circuitId}`).join(" ");
  $("asof").textContent = `${Number(dCount)} payments decided · protocol ${usd(protocol, 6)} USDT0`;
  return fuses;
}

function count(k: string, to: number, d: number) {
  const el = $("strip").querySelector<HTMLElement>(`[data-k="${k}"]`)!;
  const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t: number) => { const p = Math.min(1, (t - t0) / 1100); el.textContent = fmt(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ------------------------------------------------------------------ try to scam it
interface Trick { id: string; label: string; to: () => string; amount: string; memo: string; legit?: boolean; gap?: boolean }
const rand = () => getAddress("0x" + Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, "0")).join(""));
const oneOff = (s: string) => { const i = s.length - 5; const c = s[i].toLowerCase(); return getAddress((s.slice(0, i) + (c === "a" ? "b" : "a") + s.slice(i + 1)).toLowerCase()); };
const TRICKS: Trick[] = [
  { id: "bank", label: "New bank details: pay us here from now on", to: rand, amount: "2.5", memo: "We moved banks. Please pay invoice INV-7793 to our new account from now on." },
  { id: "letter", label: "One letter off: kano-cott0n", to: () => oneOff(SUPPLIER), amount: "0.5", memo: "Invoice INV-7793, Kano Cott0n" },
  { id: "padded", label: "Invoice padded to 3× the usual", to: () => SUPPLIER, amount: "60", memo: "Invoice INV-7794, revised total for the Q4 order" },
  { id: "ceo", label: "Urgent: the CEO needs this today", to: rand, amount: "25", memo: "URGENT from the CEO: wire this before 5pm, don't loop in finance" },
  { id: "refund", label: "Refund to a new address", to: rand, amount: "2.5", memo: "Urgent refund for a customer, per support ticket #4471" },
  { id: "twice", label: "Same invoice, sent twice", to: () => SUPPLIER, amount: "0.5", memo: "Invoice INV-7790, Kano Cotton (reminder, still unpaid)", gap: true },
  { id: "legit", label: "Pay the real supplier", to: () => SUPPLIER, amount: "0.5", memo: "Invoice INV-7795, Kano Cotton", legit: true },
];
let picked: Trick | null = null;

function renderTricks() {
  $("tricks").innerHTML = TRICKS.map((t, i) => `<button class="trick${t.legit ? " legit" : ""}" data-id="${t.id}"><span class="n">${t.legit ? "✓" : `0${i + 1}`}</span><span>${esc(t.label)}</span><span class="go">Load</span></button>`).join("");
  $("tricks").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>(".trick"); if (b) pick(TRICKS.find((t) => t.id === b.dataset.id)!, true); });
}
function pick(t: Trick, go = false) {
  picked = t;
  document.querySelectorAll<HTMLElement>(".trick").forEach((b) => b.classList.toggle("on", b.dataset.id === t.id));
  $<HTMLInputElement>("to").value = t.to(); $<HTMLInputElement>("amount").value = t.amount;
  $("memo").innerHTML = `<b>Memo:</b> “${esc(t.memo)}”`;
  if (go) run();
}

async function run(scroll = true) {
  const to = $<HTMLInputElement>("to").value.trim(), amount = $<HTMLInputElement>("amount").value.trim();
  const err = $("err"); err.hidden = true;
  if (!isAddress(to, { strict: false })) { err.textContent = "Enter a valid 0x address for the payee."; err.hidden = false; return; }
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) { err.textContent = "Enter an amount above 0, up to 6 decimals."; err.hidden = false; return; }
  const btn = $<HTMLButtonElement>("run"); btn.disabled = true; $("runl").textContent = "Asking X Layer…";
  try {
    const payee = getAddress(to.toLowerCase()), amt = parseUnits(amount, 6);
    const [res, since, mask, head] = await Promise.all([
      W("check", [USDT0, payee, amt]) as Promise<[boolean, readonly number[]]>, W("payeeAddedAt", [payee]) as Promise<bigint>,
      W("approvalMaskOf", [USDT0, payee, amt]) as Promise<bigint>, rpc<Hex>("eth_blockNumber", []),
      fuses.length ? Promise.resolve(fuses) : loadAtlas(),
    ]);
    show(res[0], res[1].map((s) => STATUS[s] ?? "failed"), Number(amount), Number(since), Number(mask), Number(BigInt(head)));
    if (scroll && matchMedia("(max-width: 900px)").matches) $("panel").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    err.textContent = /revert/i.test(String((e as Error).message)) ? "Atlas refused the check: that token or payee isn't valid here." : "Couldn't reach X Layer's nodes just now. Try again.";
    err.hidden = false;
  } finally { btn.disabled = false; $("runl").textContent = "Run it through Atlas's fuses"; }
}

function why(f: Fuse, st: string, amt: number, since: number, approvals: number) {
  const ok = st === "pass";
  if (st === "failed") return "The circuit call failed, so the fuse fails closed.";
  if (st === "untrusted") return "TapeOut's processor code changed and isn't attested, so the fuse fails closed.";
  if (f.key === "daily-cap") { const left = Math.max(0, f.a - f.spentToday); return ok ? `Within today's cap: ${left} of ${f.a} USDT0 left.` : `${amt} USDT0 would pass today's ${f.a} USDT0 cap (${f.spentToday} spent).`; }
  if (f.key === "payee-guard") {
    const hours = since ? (Date.now() / 1000 - since) / 3600 : 0;
    if (ok) return since && hours >= f.a ? "A saved payee, past its cooling-off." : `Saved ${hours.toFixed(1)} h ago and still cooling off, but ${amt} USDT0 is within the ${f.b} USDT0 trial.`;
    return !since ? "Not a saved payee." : `Saved ${hours.toFixed(1)} h ago: still cooling off (${f.a} h), and ${amt} USDT0 is over the ${f.b} USDT0 trial.`;
  }
  if (f.key === "breaker") return f.latched ? "Already blown. Nothing pays until the owner resets it." : ok ? "Not tripped." : "A payment to a stranger trips it, and it stays blown until the owner resets it.";
  if (f.key === "approval-2of3") return ok ? (amt > f.a ? `Over ${f.a} USDT0 and approved by ${approvals} of 3.` : `Under the ${f.a} USDT0 approval threshold.`) : `Over ${f.a} USDT0: needs two of three approvers, has ${approvals}.`;
  return ok ? "Holds." : "Blew.";
}

function show(allowed: boolean, status: string[], amt: number, since: number, mask: number, block: number) {
  const approvals = [0, 1, 2].filter((b) => (mask >> b) & 1).length;
  const panel = $("panel"), v = $("verdict");
  const blew = fuses.filter((_, i) => status[i] !== "pass").map((f) => f.name);
  panel.classList.toggle("stopped", !allowed);
  panel.classList.remove("flash"); void panel.offsetWidth; panel.classList.add("flash");
  v.className = `verdict ${allowed ? "paid" : "stop"}`;
  v.textContent = allowed ? "Paid." : "Stopped.";
  $("pblock").textContent = `Block ${block.toLocaleString("en-US")}`;
  $("why").innerHTML = fuses.map((f, i) => {
    const st = status[i] ?? "failed";
    return `<div class="rv" style="--i:${i}"><span class="fn">${esc(f.name)} <span class="dim">#${f.circuitId}</span></span><span class="pill ${st === "pass" ? "pass" : "blew"}">${st === "pass" ? "Holds" : st === "blew" ? "Blew" : "Fails closed"}</span><span>${esc(why(f, st, amt, since, approvals))}</span></div>`;
  }).join("");
  requestAnimationFrame(() => $("why").querySelectorAll(".rv").forEach((el) => el.classList.add("in")));
  $("pf").textContent = allowed ? `Every fuse held, so Atlas would pay ${amt} USDT0. Read with eth_call via ${new URL(lastNode).host}: no gas, nothing moved.`
    : `${blew.join(" and ")} blew, so nothing would move. Read with eth_call via ${new URL(lastNode).host}: no gas.`;
  $("gap").hidden = !(picked?.gap && allowed);
}

// ------------------------------------------------------------------ fuse cards with live netlists
async function loadCards() {
  const list = fuses.length ? fuses : await loadAtlas();
  $("fcards").innerHTML = list.map((f, i) => `<article class="fcard rv" style="--i:${i % 2}" id="fc${i}">
    <div class="top"><h3>${esc(f.name)}</h3><span class="m cid">Circuit #${f.circuitId}</span></div>
    <p class="say">${esc(SAY[f.key] ?? "")}</p>
    <div class="chips m"><span>${f.nIn} inputs</span><span data-g>${f.gates} gates</span><span>${f.nState} state bit${f.nState === 1 ? "" : "s"}</span><span class="lime">${usd(f.fee, 4)} USDT0 a check</span></div>
    <canvas class="wire" aria-label="Netlist of circuit #${f.circuitId}"></canvas>
    <div class="fstats m"><div class="mute">Fuse id<b>#${f.fuseId}</b></div><div class="mute">Decisions<b>${f.decisions}</b></div><div class="mute">Designer earned<b>${usd(f.lifetime, 6)}</b></div></div>
    <p class="hash m" data-h>Netlist: reading from the processor…</p>
  </article>`).join("");
  observe();
  await Promise.all(list.map(async (f, i) => {
    const card = $(`fc${i}`);
    try {
      const nl = await read<Hex>(f.processor, tapeoutProcessorAbi as Abi, "netlist", [BigInt(f.circuitId)]);
      const els = decode(hexToBytes(nl), f.nIn);
      const nand = els.filter((e) => e.op === OP_NAND).length, latch = els.filter((e) => e.op === OP_LATCH).length;
      card.querySelector<HTMLElement>("[data-g]")!.textContent = latch ? `${nand} NAND + ${latch} LATCH` : `${nand} NAND`;
      card.querySelector<HTMLElement>("[data-h]")!.textContent = `Netlist ${(nl.length - 2) / 2} bytes · keccak ${keccak256(nl).slice(0, 18)}… · processor ${short(f.processor)}`;
      draw(card.querySelector("canvas")!, els, f.nIn);
    } catch { card.querySelector<HTMLElement>("[data-h]")!.textContent = "Couldn't read this netlist just now."; }
  }));
}

/** An arc diagram of a TAP-02 netlist: inputs on the left, gates in order, every wire an arc from its source. */
function draw(cv: HTMLCanvasElement, els: Element[], nIn: number) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext("2d")!; g.scale(dpr, dpr);
  const base = h - 22, left = 14, right = w - 14;
  const inW = Math.min((right - left) * 0.22, nIn * 6);
  const xIn = (k: number) => left + (nIn > 1 ? (k / (nIn - 1)) * inW : 0);
  const gx0 = left + inW + 18, step = (right - gx0) / Math.max(1, els.length - 1);
  const xOf = (sig: number): number | null => {
    if (sig < 2) return null; // constants 0 and 1
    if (sig < 2 + nIn) return xIn(sig - 2);
    const k = els.findIndex((e) => sig >= e.firstOut && sig < e.firstOut + e.nOut);
    return k < 0 ? null : gx0 + k * step;
  };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let p = reduce ? 1 : 0;
  const frame = () => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(left, base + 6, right - left, 1);
    const upto = Math.floor(els.length * p);
    for (let k = 0; k < upto; k++) {
      const e = els[k], x = gx0 + k * step;
      for (const s of e.ins) {
        const sx = xOf(s); if (sx === null) continue;
        const r = Math.abs(x - sx) / 2, cx = (x + sx) / 2;
        g.beginPath(); g.ellipse(cx, base, r, Math.min(base - 8, r * 0.9 + 6), 0, Math.PI, 2 * Math.PI);
        g.strokeStyle = e.op === OP_LATCH ? "rgba(247,255,235,0.55)" : sx < gx0 ? "rgba(187,254,47,0.30)" : "rgba(187,254,47,0.16)";
        g.lineWidth = 1; g.stroke();
      }
    }
    for (let k = 0; k < nIn; k++) { g.fillStyle = "#585855"; g.fillRect(xIn(k) - 1, base + 1, 2, 9); }
    for (let k = 0; k < upto; k++) { const e = els[k]; g.fillStyle = e.op === OP_LATCH ? "#f7ffeb" : "#bbfe2f"; g.fillRect(gx0 + k * step - 1.5, base - 1.5, 3, e.op === OP_LATCH ? 9 : 5); }
    g.font = "500 9px 'Geist Mono', monospace"; g.fillStyle = "#585855"; g.fillText(`${nIn} IN`, left, h - 2);
    g.textAlign = "right"; g.fillText(`OUT →`, right, h - 2); g.textAlign = "left";
    if (p < 1) { p = Math.min(1, p + 0.035); requestAnimationFrame(frame); }
  };
  const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io.disconnect(); frame(); } }, { threshold: 0.3 });
  io.observe(cv);
}

// ------------------------------------------------------------------ contracts table
function renderTable() {
  const rows: [string, string, string][] = [
    ["Atlas", "The live demo wallet with four fuses", ATLAS],
    ["Fuse registry", "Lists fuses, collects fees, pays designers", REGISTRY],
    ["Wallet factory", "Makes every Fusebox wallet", dep.factory],
    ["OrderGuard processor", "TapeOut processor holding circuits #15–18", dep.processor],
    ["USDT0", "The token Atlas pays and fuses charge in", USDT0],
    ["This page's container", "ERC-6551 account of circuit #15", CONTAINER],
    ["DeWEB SiteRegistry", "Where this page's bytes are stored", SITE_REGISTRY],
  ];
  $("table").innerHTML = rows.map(([w, d, a], i) => `<div class="row rv" style="--i:${i}"><div class="what">${w}<small>${d}</small></div><code>${a}</code><button class="copy m" data-a="${a}">Copy</button></div>`).join("");
  $("table").addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".copy"); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.a!); b.textContent = "Copied"; b.classList.add("ok"); }
    catch { const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(b.previousElementSibling!); sel?.removeAllRanges(); sel?.addRange(r); b.textContent = "Selected"; }
    setTimeout(() => { b.textContent = "Copy"; b.classList.remove("ok"); }, 1600);
  });
}

// ------------------------------------------------------------------ reveals
let io: IntersectionObserver | null = null;
function observe() {
  io ??= new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io!.unobserve(en.target); } }), { threshold: 0.12 });
  document.querySelectorAll(".rv:not(.in)").forEach((el) => io!.observe(el));
}

// ------------------------------------------------------------------ preview mode
// The same file can be opened anywhere. Only on TapeKit (tape:// or a tapekit.org subdomain) is it the on-chain copy,
// so everywhere else it says plainly that it's a preview of the DeWEB edition.
const ON_CHAIN = location.protocol === "tape:" || /(^|\.)tapekit\.org$/.test(location.hostname) || /\.tape$/.test(location.hostname);
if (!ON_CHAIN) {
  const set = (id: string, html: string) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set("b1", 'DeWEB edition · preview<br><span class="lime">Built for 15.2.272.tape</span>');
  set("b2", "No backend<br>Reads X Layer directly");
  set("eyebrow", '<span class="lime">[01]</span> The DeWEB edition. No backend: your browser reads X Layer itself.');
  set("lede", "Fusebox wires an AI agent's wallet through small logic circuits taped out on TapeOut. A payment reaches the payee only if every fuse holds. <b>This is Fusebox's DeWEB edition, built to live on X Layer in the container of circuit #15 and be served by TapeKit.</b> Publishing it waits on TapeOut's one-time 0.08 OKB container fee, so for now the same file is served from Vercel. It still has no backend: every number below comes straight from the chain.");
  set("tag1", '<span class="dot"></span>Built for TapeKit');
  set("chip", "No backend");
  set("callt", "Its future home");
  document.getElementById("verify")?.remove();
}

// ------------------------------------------------------------------ boot
renderTricks(); renderTable(); observe();
pick(TRICKS[4]);
tickBlock(); setInterval(tickBlock, 4000);
loadAtlas().then(loadCards).catch(() => { $("asof").textContent = "X Layer's nodes didn't answer. Reload to try again."; });
$("run").addEventListener("click", () => run());
$("ctr").textContent = `Container ${short(CONTAINER)}`;
