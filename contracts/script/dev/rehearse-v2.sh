#!/usr/bin/env bash
# Fusebox v2 on a mainnet fork, end to end, no keys: deploy (DeployV2.s.sol), make a wallet with all five fuses,
# then send the same invoice twice. The second is stopped by the Repeat Guard; the owner clears a real repeat and
# it goes through once.
#
#   anvil --fork-url https://rpc.xlayer.tech --auto-impersonate --port 8547   (in another terminal)
#   bash script/dev/rehearse-v2.sh [registry factory]                          (skip the deploy if given)
set -euo pipefail
cd "$(dirname "$0")/../.."
RPC=${RPC:-http://127.0.0.1:8547}
OWNER=0x1e91db86a9e468A4D98b24034b2c74E68705379d # the v1 deployer: owns circuits 15-18
AGENT=0x00000000000000000000000000000000000a6e47
SUPPLIER=0x69dB89385E8a69278a49335C432d0c70ec86A6C4
USDT0=0x779Ded0c9e1022225f8E0630b35a9b54bE713736
U=1000000
send() { cast send --rpc-url "$RPC" --unlocked --from "$@" >/dev/null; }

if [ $# -ge 2 ]; then REG=$1 FAC=$2; else
  out=$(forge script script/DeployV2.s.sol --rpc-url "$RPC" --broadcast --unlocked --sender "$OWNER" --slow 2>&1)
  REG=$(grep -o 'FuseRegistry v2 0x[0-9a-fA-F]*' <<<"$out" | awk '{print $3}')
  FAC=$(grep -o 'FuseboxFactory v2 0x[0-9a-fA-F]*' <<<"$out" | awk '{print $3}')
fi
echo "registry v2 $REG  factory v2 $FAC  fuses listed: $(cast call "$REG" 'fuseCount()(uint256)' --rpc-url "$RPC")"

cast rpc anvil_setBalance "$AGENT" 0x16345785D8A0000 --rpc-url "$RPC" >/dev/null # 0.1 OKB of fork gas
# 100 USDT0 to the owner (USDT0 balances live at mapping slot 51)
cast rpc anvil_setStorageAt "$USDT0" "$(cast index address "$OWNER" 51)" "$(cast to-uint256 $((100 * U)))" --rpc-url "$RPC" >/dev/null

SALT=$(cast keccak "rehearse-v2-$(date +%s)")
W=$(cast call "$FAC" 'createWallet(address,address[],bytes32)(address)' "$OWNER" "[$AGENT]" "$SALT" --from "$OWNER" --rpc-url "$RPC")
send "$OWNER" "$FAC" 'createWallet(address,address[],bytes32)' "$OWNER" "[$AGENT]" "$SALT"
echo "wallet $W"
send "$OWNER" "$USDT0" 'approve(address,uint256)' "$REG" $((5 * U))
send "$OWNER" "$REG" 'deposit(address,uint256)' "$W" $((1 * U))
send "$OWNER" "$USDT0" 'transfer(address,uint256)' "$W" $((50 * U))
send "$OWNER" "$W" 'setToken(address,bool)' "$USDT0" true
send "$OWNER" "$W" 'addPayee(address)' "$SUPPLIER"
P='addFuse(uint256,(address,uint128,uint8,uint8),uint96)'
send "$OWNER" "$W" "$P" 1 "($USDT0,$U,50,0)" 1000    # Daily Cap 50
send "$OWNER" "$W" "$P" 2 "($USDT0,$U,24,2)" 1000    # Payee Guard 24 h, trial 2
send "$OWNER" "$W" "$P" 3 "(0x0000000000000000000000000000000000000000,0,0,0)" 500   # Breaker
send "$OWNER" "$W" "$P" 4 "($USDT0,$U,20,0)" 2000    # Two of Three above 20
send "$OWNER" "$W" "$P" 5 "(0x0000000000000000000000000000000000000000,0,24,0)" 500  # Repeat Guard, 24 h
cast rpc evm_increaseTime 90000 --rpc-url "$RPC" >/dev/null && cast rpc evm_mine --rpc-url "$RPC" >/dev/null # supplier cools off

verdict() { # the last Decision's allowed flag and the Repeat Guard's status (0 pass, 1 blew)
  local r; r=$(cast call "$W" 'check(address,address,uint256)(bool,uint8[],bytes[],bytes[])' "$USDT0" "$SUPPLIER" $((10 * U)) --rpc-url "$RPC")
  echo "$r" | sed -n '1p;2p' | tr '\n' ' '
}
pay() { send "$AGENT" "$W" 'pay(address,address,uint256,string)' "$USDT0" "$SUPPLIER" $((10 * U)) "$1"; }
bal() { cast call "$USDT0" 'balanceOf(address)(uint256)' "$SUPPLIER" --rpc-url "$RPC" | awk '{print $1}'; }

b0=$(bal)
echo "before invoice 7793:    check -> $(verdict)"
pay "invoice 7793"
echo "after paying it once:   check -> $(verdict)"
pay "invoice 7793 (resent)"
echo "resent: supplier got $(( ($(bal) - b0) / U )) USD₮0 in total (paid once)"
send "$OWNER" "$W" 'clearRepeat(address,address,uint256,bool)' "$USDT0" "$SUPPLIER" $((10 * U)) true
echo "owner cleared a repeat: check -> $(verdict)"
pay "a real second order"
echo "after the cleared one:  check -> $(verdict)  supplier got $(( ($(bal) - b0) / U )) USD₮0"
echo "decisions $(cast call "$W" 'decisionCount()(uint64)' --rpc-url "$RPC") (allowed $(cast call "$W" 'allowedCount()(uint64)' --rpc-url "$RPC"), stopped $(cast call "$W" 'blockedCount()(uint64)' --rpc-url "$RPC"))"
echo "Repeat Guard decisions $(cast call "$REG" 'decisions(uint256)(uint64)' 5 --rpc-url "$RPC"), designer earned $(cast call "$REG" 'earned(uint256)(uint256)' 5 --rpc-url "$RPC") base units"
