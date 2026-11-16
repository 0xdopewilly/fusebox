// Copies the circuit toolchain (circuits/src: builder, TAP-02, keccak, optimizer) into web/lib/circuits for Fuse Studio.
// circuits/src stays the source of truth: edit there, then run `node web/scripts/sync-circuits.mjs`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const src = new URL("../../circuits/src/", import.meta.url), dst = new URL("../lib/circuits/", import.meta.url);
mkdirSync(dst, { recursive: true });
for (const f of ["builder.ts", "tap02.ts", "keccak.ts", "optimize.ts"]) {
  const body = readFileSync(new URL(f, src), "utf8").replace(/from "\.\/([a-z0-9]+)\.ts"/g, 'from "./$1"');
  writeFileSync(new URL(f, dst), `// Copied from circuits/src/${f} by web/scripts/sync-circuits.mjs. Edit the original.\n${body}`);
  console.log("synced", f);
}
