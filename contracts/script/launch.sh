#!/usr/bin/env bash
# Fusebox launch: registry + factory, tape out the four fuses, the Atlas demo wallet, and a few real decisions.
#   RPC=http://127.0.0.1:8547 script/launch.sh          rehearsal on a local fork (funds the deployer itself)
#   RPC=https://rpc.xlayer.tech CONFIRM=yes script/launch.sh   X Layer mainnet: spends real OKB and USDT0
# Reads keys from ../.env. Writes the addresses to ../deployments/<chain>-<tag>.json.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source ../.env; set +a
RPC="${RPC:?set RPC}"
USDT0=0x779Ded0c9e1022225f8E0630b35a9b54bE713736
SCAMMER=0x9f3e71b8d05a2c6e94f13b7d5e0a8c2f6b19c41a
FORK=0
[[ "$RPC" == http://127.0.0.1* || "$RPC" == http://localhost* ]] && FORK=1
if [[ $FORK == 0 && "${CONFIRM:-}" != yes ]]; then echo "mainnet launch needs CONFIRM=yes"; exit 1; fi
TAG="${TAG:-$([[ $FORK == 1 ]] && echo fork || echo mainnet)}"
mkdir -p ../deployments; OUT="../deployments/xlayer-$TAG.json"

bal() { cast balance "$1" --rpc-url "$RPC"; }
if [[ $FORK == 1 ]]; then
  cast rpc anvil_setBalance "$DEPLOYER_ADDRESS" $(cast to-hex ${FORK_OKB_WEI:-32700000000000000}) --rpc-url "$RPC" >/dev/null   # default 0.0327 OKB, the real budget
  # USDT0 to the deployer (balance slot found with script/dev/FindSlot.s.sol)
  cast rpc anvil_setStorageAt "$USDT0" 0xcca656092db7fffb8faf01f7f6acd6babe34b5eed06562c523e5fe89f54f3509 $(cast to-uint256 ${FORK_USDT0:-300000}) --rpc-url "$RPC" >/dev/null   # default 0.3 USDT0
fi
OKB0=$(bal "$DEPLOYER_ADDRESS")
START=$(cast block-number --rpc-url "$RPC")
echo "deployer $DEPLOYER_ADDRESS  OKB $(cast from-wei $OKB0)  USDT0 $(cast call $USDT0 'balanceOf(address)(uint256)' $DEPLOYER_ADDRESS --rpc-url $RPC)"

F=(--rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast --slow)
forge script script/Deploy.s.sol "${F[@]}" > /tmp/fb-deploy.log
REGISTRY=$(grep -oE 'FuseRegistry 0x[0-9a-fA-F]{40}' /tmp/fb-deploy.log | head -1 | awk '{print $2}')
FACTORY=$(grep -oE 'FuseboxFactory 0x[0-9a-fA-F]{40}' /tmp/fb-deploy.log | head -1 | awk '{print $2}')
echo "registry $REGISTRY  factory $FACTORY"

REGISTRY=$REGISTRY forge script script/TapeOutFuses.s.sol "${F[@]}" > /tmp/fb-tape.log
grep -E 'circuit id / fuse id' /tmp/fb-tape.log | sort -u
IDS=$(grep -E 'circuit id / fuse id' /tmp/fb-tape.log | awk '!seen[$0]++' | awk '{print $NF}' | paste -sd, -)
CIRCUITS=$(grep -E 'circuit id / fuse id' /tmp/fb-tape.log | awk '!seen[$0]++' | awk '{print $(NF-1)}' | paste -sd, -)

cast send "$AGENT_ADDRESS" --value 0.0003ether --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" -q
REGISTRY=$REGISTRY FACTORY=$FACTORY FUSE_IDS=$IDS AGENT=$AGENT_ADDRESS SUPPLIER=$SUPPLIER_ADDRESS \
  APPROVER1=$APPROVER1_ADDRESS APPROVER2=$APPROVER2_ADDRESS APPROVER3=$APPROVER3_ADDRESS \
  FEE_DEPOSIT=${FEE_DEPOSIT:-100000} FLOAT=${FLOAT:-200000} forge script script/SetupDemo.s.sol "${F[@]}" > /tmp/fb-demo.log
WALLET=$(grep -oE 'Atlas wallet 0x[0-9a-fA-F]{40}' /tmp/fb-demo.log | head -1 | awk '{print $3}')
echo "Atlas wallet $WALLET"

pay() { # to amount(base units) memo
  cast send "$WALLET" 'pay(address,address,uint256,string)' $USDT0 "$1" "$2" "$3" --rpc-url "$RPC" --private-key "$AGENT_PRIVATE_KEY" --gas-limit 3000000 -q
  local r; r=$(cast call "$WALLET" 'decisionCount()(uint256)' --rpc-url "$RPC" 2>/dev/null || echo "?"); echo "  decision $r: pay $(cast to-unit $2 6 2>/dev/null || echo $2) → $1  \"$3\""
}
echo "decisions:"
pay "$SUPPLIER_ADDRESS" 50000   "Invoice INV-7790, Kano Cotton"
pay "$SCAMMER"          2500000 "Urgent refund for a customer, per support ticket"
pay "$SUPPLIER_ADDRESS" 50000   "Invoice INV-7791, Kano Cotton"
cast send "$WALLET" 'pulse(uint256,bool,bool)' 2 false true --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" -q && echo "  owner reset the Breaker"
pay "$SUPPLIER_ADDRESS" 60000000 "Q4 bulk order, pay today"
pay "$SUPPLIER_ADDRESS" 50000   "Invoice INV-7792, Kano Cotton"

OKB1=$(bal "$DEPLOYER_ADDRESS")
SPENT=$(cast from-wei $(( OKB0 - OKB1 )))
BLOCK=$(cast block-number --rpc-url "$RPC")
cat > "$OUT" <<JSON
{ "chainId": 196, "tag": "$TAG", "fromBlock": $START, "block": $BLOCK, "registry": "$REGISTRY", "factory": "$FACTORY",
  "processor": "0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355", "circuitIds": [$CIRCUITS], "fuseIds": [$IDS],
  "atlas": "$WALLET", "owner": "$DEPLOYER_ADDRESS", "agent": "$AGENT_ADDRESS", "supplier": "$SUPPLIER_ADDRESS",
  "approvers": ["$APPROVER1_ADDRESS", "$APPROVER2_ADDRESS", "$APPROVER3_ADDRESS"], "usdt0": "$USDT0" }
JSON
echo "deployer OKB spent: $SPENT (includes 0.0003 sent to the agent for gas)"
echo "wrote $OUT"
