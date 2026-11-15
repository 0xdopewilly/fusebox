import "server-only";
import { cache } from "react";
import { fuseRegistryAbi } from "./abi";
import { client, DEPLOYMENT } from "./chain";
import { decodeDataUri } from "./fuseMeta";
import { SOCKETS } from "./sockets";

/**
 * What a fuse page needs on the server (its title, summary, whether it exists): two registry reads, shared by
 * generateMetadata and the page through React's cache. The full market read stays in the browser.
 * Returns undefined when X Layer doesn't answer in time, null when the registry has no such fuse.
 */
export const fuseHead = cache(async (id: number): Promise<{ name: string; summary?: string } | null | undefined> => {
  const R = { address: DEPLOYMENT.registry, abi: fuseRegistryAbi } as const;
  const read = Promise.all([
    // the registry reverts UnknownFuse for an id it never issued: that's a definite "no such fuse"
    client.readContract({ ...R, functionName: "fuse", args: [BigInt(id)] }).catch((e: Error) => { if (/UnknownFuse/.test(e?.message ?? "")) return null; throw e; }),
    client.readContract({ ...R, functionName: "metadataURI", args: [BigInt(id)] }).catch(() => ""),
  ]).then(([f, uri]) => {
    if (!f || /^0x0{40}$/i.test(f.processor)) return null;
    const meta = uri ? decodeDataUri(uri) : null;
    return { name: meta?.name ?? SOCKETS[Number(f.socket)]?.name ?? `Fuse ${id}`, summary: meta?.summary };
  });
  return Promise.race([read, new Promise<undefined>((r) => setTimeout(() => r(undefined), 3000))]).catch(() => undefined);
});
