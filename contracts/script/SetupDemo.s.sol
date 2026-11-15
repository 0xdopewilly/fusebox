// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FuseRegistry} from "../src/FuseRegistry.sol";
import {FuseboxFactory} from "../src/FuseboxFactory.sol";
import {FuseboxWallet} from "../src/FuseboxWallet.sol";
import {Sockets} from "../src/libraries/Sockets.sol";
import {XLayer} from "./XLayer.sol";

/// @notice Creates "Atlas", the public demo wallet: one agent key, the four fuses in series, one saved
///         supplier, three approvers, a USDT0 fee balance and a little USDT0 to pay with.
///         The broadcaster is the owner.
///
///         Env: REGISTRY, FACTORY, FUSE_IDS (4, stack order), AGENT, SUPPLIER, APPROVER1..3,
///         FEE_DEPOSIT (default 1 USDT0), FLOAT (default 3 USDT0), CAP (default 50), THRESHOLD (default 20).
contract SetupDemo is Script {
    uint256 constant USDT = 1e6;

    function run() external returns (FuseboxWallet wallet) {
        require(block.chainid == XLayer.CHAIN_ID, "not X Layer");
        FuseRegistry registry = FuseRegistry(vm.envAddress("REGISTRY"));
        FuseboxFactory factory = FuseboxFactory(vm.envAddress("FACTORY"));
        uint256[] memory ids = vm.envUint("FUSE_IDS", ",");
        require(ids.length == 4, "FUSE_IDS needs 4 ids");
        address[] memory agents = new address[](1);
        agents[0] = vm.envAddress("AGENT");
        address supplier = vm.envAddress("SUPPLIER");
        address[3] memory seats = [vm.envAddress("APPROVER1"), vm.envAddress("APPROVER2"), vm.envAddress("APPROVER3")];
        uint256 deposit = vm.envOr("FEE_DEPOSIT", 1 * USDT);
        uint256 float_ = vm.envOr("FLOAT", 3 * USDT);
        uint8 cap = uint8(vm.envOr("CAP", uint256(50)));
        uint8 threshold = uint8(vm.envOr("THRESHOLD", uint256(20)));
        IERC20 usdt0 = IERC20(XLayer.USDT0);

        vm.startBroadcast();
        wallet = factory.createWallet(msg.sender, agents, bytes32("atlas"));
        usdt0.approve(address(registry), deposit);
        registry.deposit(address(wallet), deposit);
        if (float_ > 0) require(usdt0.transfer(address(wallet), float_), "float transfer");
        Sockets.Params memory none;
        wallet.addFuse(ids[0], Sockets.Params(XLayer.USDT0, uint128(USDT), cap, 0), uint96(registry.feeOf(ids[0])));
        wallet.addFuse(ids[1], Sockets.Params(XLayer.USDT0, uint128(USDT), 24, 2), uint96(registry.feeOf(ids[1])));
        wallet.addFuse(ids[2], none, uint96(registry.feeOf(ids[2])));
        wallet.addFuse(ids[3], Sockets.Params(XLayer.USDT0, uint128(USDT), threshold, 0), uint96(registry.feeOf(ids[3])));
        wallet.setToken(XLayer.USDT0, true);
        wallet.addPayee(supplier);
        wallet.setApprovers(seats);
        vm.stopBroadcast();

        console.log("Atlas wallet", address(wallet));
        console.log("owner", msg.sender);
        console.log("agent", agents[0]);
    }
}
