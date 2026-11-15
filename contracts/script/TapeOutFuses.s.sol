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
///         Env: REGISTRY (required), PROCESSOR (default OrderGuard), FEE (one USDT0 fee in base units for every
///         fuse; unset = the per-fuse defaults below), METADATA_BASE (default "ipfs://fusebox/").
///         Default fees per decision: Daily Cap 0.001, Payee Guard 0.001, Breaker 0.0005, Two of Three 0.002 USDT0.
///         Circuit ids are read from the TapedOut return value; check them against the events in the receipts.
contract TapeOutFuses is Script {
    function run() external returns (uint256[] memory fuseIds) {
        require(block.chainid == XLayer.CHAIN_ID, "not X Layer");
        FuseRegistry registry = FuseRegistry(vm.envAddress("REGISTRY"));
        ITapeoutProcessor processor = ITapeoutProcessor(vm.envOr("PROCESSOR", XLayer.ORDERGUARD_PROCESSOR));
        uint256 flat = vm.envOr("FEE", uint256(0));
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
            uint96 fee = flat > 0 ? uint96(flat) : defaultFee(f.key);
            fuseIds[k] = registry.list(address(processor), id, f.socket, f.netlistHash, fee, string.concat(base, f.key));
            console.log(string.concat(f.key, ": circuit id / fuse id"), id, fuseIds[k]);
        }
        vm.stopBroadcast();
    }

    function defaultFee(string memory key) internal pure returns (uint96) {
        bytes32 h = keccak256(bytes(key));
        if (h == keccak256("breaker")) return 500;
        if (h == keccak256("approval-2of3")) return 2_000;
        return 1_000; // daily-cap, payee-guard
    }
}
