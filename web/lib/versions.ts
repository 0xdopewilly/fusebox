import type { Address } from "viem";

/**
 * Fusebox runs two sets of contracts on X Layer. v1 (Nov 15) holds Atlas and the first wallets, and keeps working.
 * v2 (Nov 20) stores socket pinouts as data and adds the Repeat Guard (socket 5). New wallets, new listings and the
 * fuse market use v2. Fuses 1-4 are the same circuits (#15-18) with the same ids on both, so a fuse id means the same
 * design either way; a wallet always pays fees to, and installs from, the registry it was made with.
 */
export interface Version { tag: "v1" | "v2"; registry: Address; factory: Address; fuseIds: number[]; fromBlock: number }
interface Dep { registry: string; factory: string; fuseIds: number[]; fromBlock: number; v2: { registry: string; factory: string; fuseIds: number[]; fromBlock: number } }

export function versionsOf(dep: Dep) {
  const V1: Version = { tag: "v1", registry: dep.registry as Address, factory: dep.factory as Address, fuseIds: dep.fuseIds, fromBlock: dep.fromBlock };
  const V2: Version = { tag: "v2", registry: dep.v2.registry as Address, factory: dep.v2.factory as Address, fuseIds: dep.v2.fuseIds, fromBlock: dep.v2.fromBlock };
  const VERSIONS = [V1, V2];
  const versionOf = (registry: string) => VERSIONS.find((v) => v.registry.toLowerCase() === registry.toLowerCase());
  return {
    V1, V2, VERSIONS,
    /** where new wallets are made and new fuses are listed */
    CURRENT: V2,
    versionOf,
    /** one of the fuses Fusebox ships (built-in copy and schematics): v1's four, v2's five */
    isBuiltIn: (registry: string, fuseId: number) => versionOf(registry)?.fuseIds.includes(fuseId) ?? false,
  };
}
