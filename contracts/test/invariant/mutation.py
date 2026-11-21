#!/usr/bin/env python3
"""Mutation check for the wallet invariants: plant one realistic bug at a time in the contracts, run the
long-walk test, and report whether the suite caught it. Every file is restored from memory after each run
(even on Ctrl-C), so uncommitted work is never touched.

Usage, from contracts/:  python3 test/invariant/mutation.py
"""
import pathlib
import re
import subprocess
import sys

W = "src/FuseboxWallet.sol"
R = "src/FuseRegistry.sol"

# (what the bug does, file, exact text, replacement)
MUTANTS = [
    ("breaker forgets a blocked stranger", W,
     "if (s.nState != 0) s.state = v.newStates[i];", "if (s.nState != 0 && v.allowed) s.state = v.newStates[i];"),
    ("registry ignores the accepted max fee", R, "if (fee > maxFees[i]) fee = maxFees[i];", ""),
    ("approvals are not used up", W, "if (c.approvalMask != 0) delete approvals[c.intent];", ""),
    ("daily spend is not recorded", W, "                    s.spent += amount;\n", ""),
    ("an untrusted processor is still asked", W,
     "            if (!lastTrusted) {\n                v.status[i] = UNTRUSTED;",
     "            if (false) {\n                v.status[i] = UNTRUSTED;"),
    ("decision budget off by one", W,
     "if ((sameDay ? decisionsToday : 0) >= maxDecisionsPerDay)", "if ((sameDay ? decisionsToday : 0) > maxDecisionsPerDay)"),
    ("repeat clearance is not used up", W, "if (c.repeatCleared) delete repeatClearedUntil[c.repeatKey];", ""),
    ("anyone can clear a repeat", W,
     "function clearRepeat(address token, address to, uint256 amount, bool clear) external onlyOwner {",
     "function clearRepeat(address token, address to, uint256 amount, bool clear) external {"),
    ("payee age counted in minutes", W,
     "uint256 hrs = (block.timestamp - added) / 1 hours;", "uint256 hrs = (block.timestamp - added) / 1 minutes;"),
    ("withdraw skips the balance check", R,
     "if (bal < amount) revert InsufficientFeeBalance(bal, amount);\n        feeBalance[msg.sender] = bal - amount;",
     "feeBalance[msg.sender] = bal > amount ? bal - amount : 0;"),
]


def main() -> int:
    missed = 0
    for name, path, old, new in MUTANTS:
        f = pathlib.Path(path)
        original = f.read_text()
        if original.count(old) != 1:
            print(f"SKIP    | {name} | anchor not found once; the contract changed")
            missed += 1
            continue
        try:
            f.write_text(original.replace(old, new))
            out = subprocess.run(
                ["forge", "test", "--match-test", "test_long_walks"], capture_output=True, text=True
            ).stdout
        finally:
            f.write_text(original)
        fail = re.search(r"^\[FAIL: ?(.*?)\] ", out, re.M)
        if fail:
            print(f"CAUGHT  | {name} | {fail.group(1)[:110]}")
        elif "[PASS]" in out:
            print(f"MISSED  | {name}")
            missed += 1
        else:
            print(f"ERROR   | {name} | did not compile or run")
            missed += 1
    print(f"\n{len(MUTANTS) - missed} of {len(MUTANTS)} planted bugs caught")
    return 1 if missed else 0


if __name__ == "__main__":
    sys.exit(main())
