// Publishes dist/index.html to DeWEB on X Layer: opens circuit #15's container (one-time 0.08 OKB to TapeOut),
// stores the page in SiteRegistry in 24,000-byte chunks, sets it as the fallback page and activates the name.
// Then reads the file back from the chain and checks its SHA-256.
//
//   node publish.mjs --rpc http://127.0.0.1:8547 --unlocked     rehearsal on an anvil fork (deployer impersonated)
//   node publish.mjs --rpc https://rpc.xlayer.tech              mainnet plan and cost only
//   node publish.mjs --rpc https://rpc.xlayer.tech --yes        mainnet, for real (DEPLOYER_PRIVATE_KEY from ../.env)
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatEther, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "viem/chains";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes(k);
const RPC = arg("--rpc", "https://rpc.xlayer.tech");
const UNLOCKED = flag("--unlocked"), YES = flag("--yes");
const env = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n").filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));

const PROCESSOR = "0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355", CIRCUIT = 15n, NAME = "15.2.272.tape", PATH = "index.html", MONTHS = 120n;
const OPENER = "0x536adD8F30f03b69f6fbF29d425A816A0dC50106";
const SITES = "0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6";
const BINDING = "0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9";
const CHUNK = 24_000;

const openerAbi = parseAbi(["function accountOf(address circuits, uint256 tokenId) view returns (address)", "function isOpened(address circuits, uint256 tokenId) view returns (bool)", "function open(address circuits, uint256 tokenId) payable returns (address)", "function FEE() view returns (uint256)"]);
const sitesAbi = parseAbi([
  "function fileInfo(address container, string path) view returns (uint32 size, string contentType, bytes32 sha256Hash, uint40 updatedAt, uint256 chunkCount)",
  "function readRange(address container, string path, uint256 offset, uint256 len) view returns (bytes)",
  "function fallbackPath(address container) view returns (string)",
  "function putFile(address container, string path, string contentType, bytes32 sha256Hash, bytes data)",
  "function appendChunk(address container, string path, uint256 expectIndex, bytes data)",
  "function setFallback(address container, string path)",
]);
const bindingAbi = parseAbi(["function monthlyFee() view returns (uint256)", "function isLive(string name, address container) view returns (bool)", "function isContainerLive(address container) view returns (bool)", "function bind(string name, address container, uint256 months) payable"]);
const nftAbi = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)"]);

const page = readFileSync(new URL("./dist/index.html", import.meta.url));
const sha = `0x${createHash("sha256").update(page).digest("hex")}`;
const chunks = Array.from({ length: Math.ceil(page.length / CHUNK) }, (_, i) => page.subarray(i * CHUNK, (i + 1) * CHUNK));

const chain = { ...xLayer, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC, { timeout: 60_000 }) });
const owner = await pub.readContract({ address: PROCESSOR, abi: nftAbi, functionName: "ownerOf", args: [CIRCUIT] });
const account = UNLOCKED ? owner : privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
if (!UNLOCKED && account.address.toLowerCase() !== owner.toLowerCase()) throw new Error(`The deployer key isn't circuit #15's holder (${owner}).`);
const wallet = createWalletClient({ chain, transport: http(RPC, { timeout: 120_000 }), account });

const [container, opened, fee, monthly, gasPrice, bal] = await Promise.all([
  pub.readContract({ address: OPENER, abi: openerAbi, functionName: "accountOf", args: [PROCESSOR, CIRCUIT] }),
  pub.readContract({ address: OPENER, abi: openerAbi, functionName: "isOpened", args: [PROCESSOR, CIRCUIT] }),
  pub.readContract({ address: OPENER, abi: openerAbi, functionName: "FEE" }),
  pub.readContract({ address: BINDING, abi: bindingAbi, functionName: "monthlyFee" }),
  pub.getGasPrice(), pub.getBalance({ address: owner }),
]);
const gasGuess = BigInt(chunks.length) * 5_600_000n + 600_000n + (opened ? 0n : 400_000n);
const need = (opened ? 0n : fee) + monthly * MONTHS + gasGuess * gasPrice;
console.log(`page      ${page.length} bytes, ${chunks.length} chunks, sha256 ${sha}`);
console.log(`holder    ${owner}  balance ${formatEther(bal)} OKB`);
console.log(`container ${container}  opened: ${opened}`);
console.log(`cost      open ${opened ? "already paid" : formatEther(fee) + " OKB"} + name ${formatEther(monthly * MONTHS)} OKB + gas ≈ ${formatEther(gasGuess * gasPrice)} OKB (at ${Number(gasPrice) / 1e9} gwei) = ${formatEther(need)} OKB`);
if (bal < need) throw new Error(`The holder needs about ${formatEther(need - bal)} OKB more.`);
if (!UNLOCKED && !YES) { console.log("\nPlan only. Re-run with --yes to publish on mainnet."); process.exit(0); }

const send = async (label, req) => {
  const hash = await wallet.writeContract(req);
  let r = null;
  for (let k = 0; !r && k < 40; k++) { // RPCs sometimes stall on receipts: keep asking rather than resend
    try { r = await pub.waitForTransactionReceipt({ hash, timeout: 45_000 }); } catch { r = await pub.getTransactionReceipt({ hash }).catch(() => null); }
  }
  if (!r) throw new Error(`${label}: no receipt for ${hash}; re-run to resume`);
  if (r.status !== "success") throw new Error(`${label} reverted (${hash})`);
  console.log(`  ✓ ${label.padEnd(26)} ${hash}  gas ${r.gasUsed}`);
  return r;
};

if (!opened) await send("open container", { address: OPENER, abi: openerAbi, functionName: "open", args: [PROCESSOR, CIRCUIT], value: fee });
// Resume: if this exact page (same declared SHA-256) is partly stored, carry on from the last chunk.
const have = await pub.readContract({ address: SITES, abi: sitesAbi, functionName: "fileInfo", args: [container, PATH] }).catch(() => null);
let start = 1;
if (have && have[2].toLowerCase() === sha && have[4] > 0n) { start = Number(have[4]); console.log(`  · ${start} of ${chunks.length} chunks already stored, resuming`); }
else await send(`putFile 1/${chunks.length}`, { address: SITES, abi: sitesAbi, functionName: "putFile", args: [container, PATH, "text/html; charset=utf-8", sha, `0x${chunks[0].toString("hex")}`] });
for (let i = start; i < chunks.length; i++) await send(`appendChunk ${i + 1}/${chunks.length}`, { address: SITES, abi: sitesAbi, functionName: "appendChunk", args: [container, PATH, BigInt(i), `0x${chunks[i].toString("hex")}`] });
if ((await pub.readContract({ address: SITES, abi: sitesAbi, functionName: "fallbackPath", args: [container] })) !== PATH) await send("setFallback", { address: SITES, abi: sitesAbi, functionName: "setFallback", args: [container, PATH] });
if (!(await pub.readContract({ address: BINDING, abi: bindingAbi, functionName: "isLive", args: [NAME, container] }))) await send(`bind ${NAME}`, { address: BINDING, abi: bindingAbi, functionName: "bind", args: [NAME, container, MONTHS], value: monthly * MONTHS });

// Read it all back from the chain and compare.
const info = await pub.readContract({ address: SITES, abi: sitesAbi, functionName: "fileInfo", args: [container, PATH] });
let back = Buffer.alloc(0);
for (let off = 0; off < info[0]; off += 60_000) back = Buffer.concat([back, Buffer.from((await pub.readContract({ address: SITES, abi: sitesAbi, functionName: "readRange", args: [container, PATH, BigInt(off), 60_000n] })).slice(2), "hex")]);
const backSha = `0x${createHash("sha256").update(back).digest("hex")}`;
const live = await pub.readContract({ address: BINDING, abi: bindingAbi, functionName: "isContainerLive", args: [container] });
console.log(`\nfileInfo  ${info[0]} bytes, ${info[4]} chunks, ${info[1]}, declared ${info[2]}`);
console.log(`read back ${back.length} bytes, sha256 ${backSha} ${backSha === sha ? "MATCHES" : "DOES NOT MATCH"}`);
console.log(`name      ${NAME} live: ${live}  →  https://15-2-272.tapekit.org/`);
if (backSha !== sha || !live) process.exit(1);
