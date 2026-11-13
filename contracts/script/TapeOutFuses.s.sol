// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

import {FuseRegistry} from "../src/FuseRegistry.sol";
import {ITapeoutProcessor, ITapeoutTransistors} from "../src/interfaces/ITapeout.sol";
import {FuseFixtures} from "../test/fixtures/FuseFixtures.sol";
import {XLayer} from "./XLayer.sol";

/// @notice Buys transistors, tapes out the four shipped fuses and lists them in the registry.
///         The broadcaster becomes the designer (circuit NFT owner, fee recipient).
///
///         Env: REGISTRY (required), PROCESSOR (default OrderGuard), FEE (USDT0 base units per decision,
///         default 1000 = 0.001 USDT0), METADATA_BASE (default "ipfs://fusebox/").
///         Circuit ids are read from the TapedOut return value; check them against the events in the receipts.
contract TapeOutFuses is Script {
    function run() external returns (uint256[] memory fuseIds) {
        require(block.chainid == XLayer.CHAIN_ID, "not X Layer");
        FuseRegistry registry = FuseRegistry(vm.envAddress("REGISTRY"));
        ITapeoutProcessor processor = ITapeoutProcessor(vm.envOr("PROCESSOR", XLayer.ORDERGUARD_PROCESSOR));
        uint96 fee = uint96(vm.envOr("FEE", uint256(1_000)));
        string memory base = vm.envOr("METADATA_BASE", string("ipfs://fusebox/"));
        require(registry.isTrustedProcessor(address(processor)), "processor not trusted by registry");

        ITapeoutTransistors t = ITapeoutTransistors(processor.transistors());
        uint256 nand;
        uint256 latch;
        for (uint256 k; k < FuseFixtures.COUNT; ++k) {
            nand += FuseFixtures.fixture(k).nand;
            latch += FuseFixtures.fixture(k).latch;
        }
        uint256 price = t.mintPrice();
        uint256 pfee = t.protocolFee();
        uint256 tapeFee = processor.TAPEOUT_FEE();
        uint256 needNand = nand > t.balanceOf(msg.sender, 0) ? nand - t.balanceOf(msg.sender, 0) : 0;
        uint256 needLatch = latch > t.balanceOf(msg.sender, 1) ? latch - t.balanceOf(msg.sender, 1) : 0;
        uint256 total = (needNand > 0 ? price * needNand + pfee : 0) + (needLatch > 0 ? price * needLatch + pfee : 0)
            + tapeFee * FuseFixtures.COUNT;
        console.log("OKB needed excluding gas (wei)", total);
        require(msg.sender.balance > total, "not enough OKB");

        fuseIds = new uint256[](FuseFixtures.COUNT);
        vm.startBroadcast();
        if (needNand > 0) t.mint{value: price * needNand + pfee}(0, needNand);
        if (needLatch > 0) t.mint{value: price * needLatch + pfee}(1, needLatch);
        for (uint256 k; k < FuseFixtures.COUNT; ++k) {
            FuseFixtures.Fixture memory f = FuseFixtures.fixture(k);
            uint256 id = processor.tapeout{value: tapeFee}(f.netlist, f.nIn, f.nOut);
            fuseIds[k] = registry.list(address(processor), id, f.socket, f.netlistHash, fee, string.concat(base, f.key));
            console.log(string.concat(f.key, ": circuit id / fuse id"), id, fuseIds[k]);
        }
        vm.stopBroadcast();
    }
}
