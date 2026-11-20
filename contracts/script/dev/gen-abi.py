#!/usr/bin/env python3
"""Regenerate the Fusebox ABIs in web/lib/abi.ts and sdk/src/abi.ts from contracts/out (run `forge build` first).
The TapeOut processor ABI (the last line) is kept as it is: it describes TapeOut's contract, not ours."""
import json, pathlib, re
root = pathlib.Path(__file__).resolve().parents[3]
out = root / "contracts" / "out"
abis = {name: json.loads((out / f"{src}.sol" / f"{src}.json").read_text())["abi"]
        for name, src in [("fuseboxWalletAbi", "FuseboxWallet"), ("fuseRegistryAbi", "FuseRegistry"), ("fuseboxFactoryAbi", "FuseboxFactory")]}
for f in [root / "web/lib/abi.ts", root / "sdk/src/abi.ts"]:
    lines = f.read_text().split("\n")
    for i, l in enumerate(lines):
        m = re.match(r"export const (\w+) = ", l)
        if m and m.group(1) in abis:
            lines[i] = f"export const {m.group(1)} = {json.dumps(abis[m.group(1)])} as const;"
    f.write_text("\n".join(lines))
    print("wrote", f.relative_to(root))
