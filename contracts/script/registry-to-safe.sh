#!/usr/bin/env bash
# Moves the admin role of both Fusebox registries (v1 and v2) from the deployer key to a Safe multisig on X Layer.
#
# The Safe is created with threshold 1 and the deployer among its owners, so the deployer alone can accept the two
# handovers (Ownable2Step) from the Safe; the Safe then raises its own threshold. After that, no single key (and so
# not the deployer key on this machine) can change trust settings or the protocol fee.
#
# Usage:
#   OWNERS=0xDeployer,0xYourWallet,0xYourOtherDevice THRESHOLD=2 RPC=https://rpc.xlayer.tech KEY=0x… \
#     contracts/script/registry-to-safe.sh          # prints the plan and the Safe's address, sends nothing
#   … contracts/script/registry-to-safe.sh --yes    # sends it
# On a fork, leave KEY unset: transactions go from the deployer through anvil's --auto-impersonate.
set -euo pipefail

FACTORY=0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67   # SafeProxyFactory 1.4.1
SINGLETON=0x29fcB43b46531BcA003ddC8FCB67FFE91900C762 # SafeL2 1.4.1
HANDLER=0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99   # CompatibilityFallbackHandler 1.4.1
REGISTRIES=(0x852a278322667BB86A2665a38CbC5Bfd551B20d7 0x2583928546a614A2fD993B5C106ED9aD0E781AB6)
DEPLOYER=0x1e91db86a9e468A4D98b24034b2c74E68705379d
ZERO=0x0000000000000000000000000000000000000000

: "${OWNERS:?set OWNERS to a comma-separated list of Safe owners (the deployer must be one)}"
: "${THRESHOLD:?set THRESHOLD (2 or more)}"
: "${RPC:?set RPC}"
lc() { tr '[:upper:]' '[:lower:]'; }
echo ",$OWNERS," | lc | grep -q ",$(echo $DEPLOYER | lc)," || { echo "OWNERS must include the deployer $DEPLOYER"; exit 1; }
n=$(echo "$OWNERS" | tr ',' '\n' | grep -c .)
[ "$THRESHOLD" -ge 2 ] && [ "$THRESHOLD" -le "$n" ] || { echo "THRESHOLD must be 2..$n"; exit 1; }

send() {
  if [ -n "${KEY:-}" ]; then cast send --private-key "$KEY" --rpc-url "$RPC" "$@" >/dev/null
  else cast send --unlocked --from "$DEPLOYER" --rpc-url "$RPC" "$@" >/dev/null; fi
}

for r in "${REGISTRIES[@]}"; do
  [ "$(cast call "$r" "owner()(address)" --rpc-url "$RPC" | lc)" = "$(echo $DEPLOYER | lc)" ] || { echo "$r isn't owned by the deployer"; exit 1; }
done
init=$(cast calldata "setup(address[],uint256,address,bytes,address,address,uint256,address)" "[$OWNERS]" 1 $ZERO 0x $HANDLER $ZERO 0 $ZERO)
salt=$(cast keccak "fusebox-registry-admin:$OWNERS:$THRESHOLD" | cast to-dec)
safe=$(cast call $FACTORY "createProxyWithNonce(address,bytes,uint256)(address)" $SINGLETON "$init" "$salt" --rpc-url "$RPC" --from $DEPLOYER)
echo "Safe:       $safe ($THRESHOLD of $n: $OWNERS)"
echo "Registries: ${REGISTRIES[*]} -> $safe"
[ "${1:-}" = "--yes" ] || { echo "Dry run. Pass --yes to send."; exit 0; }

[ "$(cast codesize "$safe" --rpc-url "$RPC")" -gt 0 ] || send $FACTORY "createProxyWithNonce(address,bytes,uint256)" $SINGLETON "$init" "$salt"
echo "created the Safe"
for r in "${REGISTRIES[@]}"; do send "$r" "transferOwnership(address)" "$safe"; done
echo "handed both registries to it"

# the deployer executes as a Safe owner with a pre-validated signature: r = its address, s = 0, v = 1
sig="0x000000000000000000000000${DEPLOYER#0x}$(printf '0%.0s' {1..64})01"
exec_safe() {
  send "$safe" "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)" \
    "$1" 0 "$2" 0 0 0 0 $ZERO $ZERO "$sig"
}
for r in "${REGISTRIES[@]}"; do exec_safe "$r" "$(cast calldata 'acceptOwnership()')"; done
echo "the Safe accepted both"
exec_safe "$safe" "$(cast calldata 'changeThreshold(uint256)' "$THRESHOLD")"
echo "raised the threshold"

ok=1
for r in "${REGISTRIES[@]}"; do
  o=$(cast call "$r" "owner()(address)" --rpc-url "$RPC")
  [ "$(echo $o | lc)" = "$(echo $safe | lc)" ] && echo "  $r owner = Safe" || { echo "  $r owner = $o (NOT the Safe)"; ok=0; }
done
echo "  threshold = $(cast call "$safe" 'getThreshold()(uint256)' --rpc-url "$RPC"), owners = $(cast call "$safe" 'getOwners()(address[])' --rpc-url "$RPC")"
[ $ok = 1 ] && echo "Done: the registries answer to the Safe." || exit 1
