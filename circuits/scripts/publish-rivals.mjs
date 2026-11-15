// Tapes out the rival fuses (build/rivals.json) on a TapeOut processor and lists them in Fusebox's registry,
// each with an on-chain fusebox-fuse/1 description. Resumable: a circuit already taped out (same netlist hash,
// owned by the sender) or already listed is skipped.
//
//   node circuits/scripts/publish-rivals.mjs --rpc http://127.0.0.1:8547 --from 0x… --unlocked   (a local fork)
//   node circuits/scripts/publish-rivals.mjs --rpc https://rpc.xlayer.tech --yes                   (mainnet: PRIVATE_KEY env)
//
// Mainnet costs OKB: one transistor per gate, TapeOut's mint fee per mint call, and the tape-out fee per circuit.
// The script prints the total and refuses if the sender can't cover it.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
const RPC = arg("--rpc"); if (!RPC) throw new Error("--rpc required");
const REGISTRY = arg("--registry", "0x852a278322667BB86A2665a38CbC5Bfd551B20d7");
const PROCESSOR = arg("--processor", "0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355");
const FEES = { "per-payment-cap": 1000n, "strict-payees": 1000n, "two-strike-breaker": 500n, "lead-approver": 2000n };
const unlocked = flag("--unlocked");
const auth = unlocked ? ["--from", arg("--from"), "--unlocked"] : ["--private-key", process.env.PRIVATE_KEY ?? ""];
if (!unlocked && !process.env.PRIVATE_KEY && !process.argv.includes("--dry")) throw new Error("PRIVATE_KEY env (or --unlocked on a fork)");
const chainId = Number(execFileSync("cast", ["chain-id", "--rpc-url", RPC], { encoding: "utf8" }).trim());
if (chainId !== 196) throw new Error(`not X Layer (chain ${chainId})`);
const isFork = /127\.0\.0\.1|localhost/.test(RPC);
const dry = flag("--dry"); // read-only: print the plan and the cost, send nothing
if (!isFork && !flag("--yes") && !dry) throw new Error("mainnet: run with --dry first to see the cost, then --yes");

const cast = (...a) => execFileSync("cast", [...a, "--rpc-url", RPC], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const local = (...a) => execFileSync("cast", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); // no RPC needed
const num = (s) => BigInt(s.split(" ")[0]);
const send = (to, sig, args, value = 0n) => JSON.parse(cast("send", to, sig, ...args, ...auth, "--value", value.toString(), "--json"));
const me = unlocked || dry ? arg("--from") : local("wallet", "address", "--private-key", process.env.PRIVATE_KEY);

const { rivals } = JSON.parse(readFileSync(new URL("../build/rivals.json", import.meta.url), "utf8"));
const DOCS = {
  "per-payment-cap": { params: { a: "Largest single payment" }, rule: "allow iff amount <= cap",
    description: "Caps each payment on its own: however many invoices arrive in a day, none can be bigger than the owner's limit. It reads the same pins as Daily Cap and ignores today's spend, so pair it with Daily Cap for a per-day total too." },
  "strict-payees": { params: { a: "Cooling-off" }, rule: "allow iff listed and age >= cooldown",
    description: "A payee book with no trial allowance: a newly saved address gets nothing, not even a test payment, until its cooling-off is over. For wallets that would rather wait a day than risk a swapped bank detail." },
  "two-strike-breaker": { rule: "strike' = !clear & (strike | trip); blown' = set | (trip & strike) | (blown & !clear); allow iff !blown & !trip",
    description: "Two LATCHes. A payment to a stranger is refused and remembered as a strike; good payments keep flowing. A second stranger blows the breaker, and then everything is refused until the owner resets it. Freeze still blows it at once." },
  "lead-approver": { params: { a: "Approvals above" }, rule: "allow iff amount <= threshold or (seat 1 and seat 2 or 3)",
    description: "Above the threshold two approvals are needed, and seat 1 (say, the finance lead) must be one of them. Two junior seats together can't move a large payment." },
};
const meta = (r) => "data:application/json;base64," + Buffer.from(JSON.stringify({
  schema: "fusebox-fuse/1", name: r.title, summary: r.story, ...DOCS[r.key], designer: "Fusebox",
  source: "https://github.com/0xdopewilly/fusebox/blob/main/circuits/src/rivals.ts",
})).toString("base64");

// already done? a listed fuse for this exact netlist, or a circuit of ours with this hash not yet listed
const nextId = Number(num(cast("call", PROCESSOR, "nextId()(uint256)")));
const plan = [];
for (const r of rivals) {
  let circuit = 0;
  for (let id = nextId; id >= Math.max(1, nextId - 400) && !circuit; id--) { // nextId() is the last id assigned
    try {
      if (cast("call", PROCESSOR, "ownerOf(uint256)(address)", String(id)).toLowerCase() !== me.toLowerCase()) continue;
      const nl = cast("call", PROCESSOR, "netlist(uint256)(bytes)", String(id));
      if (local("keccak", nl) === r.keccak256) circuit = id;
    } catch { /* burned or unreadable */ }
  }
  const listed = circuit ? Number(num(cast("call", REGISTRY, "fuseIdOf(address,uint256)(uint256)", PROCESSOR, String(circuit)))) : 0;
  plan.push({ r, circuit, listed });
}

const T = cast("call", PROCESSOR, "transistors()(address)");
const price = num(cast("call", T, "mintPrice()(uint256)")), pfee = num(cast("call", T, "protocolFee()(uint256)")), tapeFee = num(cast("call", PROCESSOR, "TAPEOUT_FEE()(uint256)"));
const todo = plan.filter((p) => !p.circuit);
const needN = BigInt(todo.reduce((t, p) => t + p.r.nand, 0)) - num(cast("call", T, "balanceOf(address,uint256)(uint256)", me, "0"));
const needL = BigInt(todo.reduce((t, p) => t + p.r.latch, 0)) - num(cast("call", T, "balanceOf(address,uint256)(uint256)", me, "1"));
const cost = (needN > 0n ? price * needN + pfee : 0n) + (needL > 0n ? price * needL + pfee : 0n) + tapeFee * BigInt(todo.length);
const bal = num(cast("balance", me));
console.log(`sender ${me} · ${todo.length} to tape out (${needN > 0n ? needN : 0n} NAND + ${needL > 0n ? needL : 0n} LATCH to mint) · cost ${Number(cost) / 1e18} OKB + gas · balance ${Number(bal) / 1e18} OKB`);
for (const p of plan) console.log(`  ${p.r.title.padEnd(20)} ${p.circuit ? `circuit #${p.circuit}` : "to tape out"} · ${p.listed ? `fuse ${p.listed}` : "to list"}`);
if (dry) process.exit(0);
if (cost > bal) throw new Error("not enough OKB to tape out; nothing sent");

if (needN > 0n) send(T, "mint(uint256,uint256)", ["0", needN.toString()], price * needN + pfee);
if (needL > 0n) send(T, "mint(uint256,uint256)", ["1", needL.toString()], price * needL + pfee);
const TOPIC = local("keccak", "TapedOut(uint256,address,uint32,uint32)");
for (const p of plan) {
  if (!p.circuit) {
    const rc = send(PROCESSOR, "tapeout(bytes,uint32,uint32)", [p.r.netlist, String(p.r.nIn), String(p.r.nOut)], tapeFee);
    const log = rc.logs.find((l) => l.topics[0] === TOPIC && l.address.toLowerCase() === PROCESSOR.toLowerCase());
    p.circuit = Number(BigInt(log.topics[1]));
  }
  if (!p.listed) {
    send(REGISTRY, "list(address,uint256,uint32,bytes32,uint96,string)", [PROCESSOR, String(p.circuit), String(p.r.socket.id), p.r.keccak256, FEES[p.r.key].toString(), meta(p.r)]);
    p.listed = Number(num(cast("call", REGISTRY, "fuseIdOf(address,uint256)(uint256)", PROCESSOR, String(p.circuit))));
  }
  if (cast("call", REGISTRY, "metadataURI(uint256)(string)", String(p.listed)).replace(/^"|"$/g, "") !== meta(p.r)) {
    send(REGISTRY, "setMetadataURI(uint256,string)", [String(p.listed), meta(p.r)]);
    console.log(`  updated fuse ${p.listed}'s description`);
  }
  console.log(`${p.r.title.padEnd(20)} circuit #${p.circuit} · fuse ${p.listed}`);
}
