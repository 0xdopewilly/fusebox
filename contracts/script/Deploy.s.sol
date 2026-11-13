// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FuseRegistry} from "../src/FuseRegistry.sol";
import {FuseboxFactory} from "../src/FuseboxFactory.sol";
import {ITapeoutBeacon, ITapeoutFactory} from "../src/interfaces/ITapeout.sol";
import {XLayer} from "./XLayer.sol";

/// @notice Deploys FuseRegistry and FuseboxFactory on X Layer and configures processor trust.
///
///         Rehearse on a local fork first (no keys needed):
///           anvil --fork-url https://rpc.xlayer.tech --auto-impersonate --port 8547
///           forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8547 --broadcast --unlocked --sender <addr>
///         A mainnet broadcast is a separate, deliberate step that needs the owner's sign-off.
///
///         Env: PROTOCOL_FEE_BPS (default 1000 = 10%).
contract Deploy is Script {
    function run() external returns (FuseRegistry registry, FuseboxFactory factory) {
        require(block.chainid == XLayer.CHAIN_ID, "not X Layer");
        // re-check the chain facts the registry will pin
        require(XLayer.ORDERGUARD_PROCESSOR.codehash == XLayer.PROCESSOR_CODEHASH, "processor code changed");
        require(ITapeoutBeacon(XLayer.TAPEOUT_BEACON).implementation() == XLayer.TAPEOUT_CIRCUIT_IMPL, "impl changed");
        require(ITapeoutFactory(XLayer.TAPEOUT_FACTORY).isCPU(XLayer.ORDERGUARD_PROCESSOR), "not a CPU");

        uint16 bps = uint16(vm.envOr("PROTOCOL_FEE_BPS", uint256(1_000)));
        vm.startBroadcast();
        registry = new FuseRegistry(IERC20(XLayer.USDT0), ITapeoutFactory(XLayer.TAPEOUT_FACTORY), msg.sender, bps);
        registry.setProcessorCodehash(XLayer.PROCESSOR_CODEHASH, XLayer.TAPEOUT_BEACON);
        registry.setTrustedImplementation(XLayer.TAPEOUT_CIRCUIT_IMPL, true);
        factory = new FuseboxFactory(registry);
        vm.stopBroadcast();

        console.log("FuseRegistry", address(registry));
        console.log("FuseboxFactory", address(factory));
        console.log("admin", msg.sender);
    }
}
