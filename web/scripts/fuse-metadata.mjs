// Prints each fuse's on-chain metadata URI (fusebox-fuse/1 JSON as a base64 data URI) from deployments/fuse-metadata.json.
// usage: node web/scripts/fuse-metadata.mjs [fuseId]   → "<id> <uri>" per line
import { readFileSync } from "node:fs";
const docs = JSON.parse(readFileSync(new URL("../../deployments/fuse-metadata.json", import.meta.url), "utf8"));
const only = process.argv[2];
for (const [id, doc] of Object.entries(docs)) {
  if (only && id !== only) continue;
  const uri = "data:application/json;base64," + Buffer.from(JSON.stringify({ schema: "fusebox-fuse/1", ...doc })).toString("base64");
  console.log(id, uri);
}
