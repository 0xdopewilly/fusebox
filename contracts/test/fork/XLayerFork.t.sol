// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {FuseRegistry} from "../../src/FuseRegistry.sol";
import {FuseboxWallet} from "../../src/FuseboxWallet.sol";
import {FuseboxFactory} from "../../src/FuseboxFactory.sol";
import {
    ITapeoutBeacon,
    ITapeoutFactory,
    ITapeoutProcessor,
    ITapeoutTransistors
} from "../../src/interfaces/ITapeout.sol";
import {Sockets} from "../../src/libraries/Sockets.sol";
import {FuseFixtures} from "../fixtures/FuseFixtures.sol";

/// @notice End to end on a fork of X Layer mainnet (chain 196), against the real TapeOut contracts.
///         Nothing is broadcast. Run with:
///           forge test --match-path test/fork/XLayerFork.t.sol --fork-url xlayer -vv
///         Without a fork every test here is skipped.
contract XLayerForkTest is Test {
    // X Layer mainnet, read on 2026-11-13 and re-checked in setUp
    address constant TAPEOUT_FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;
    address constant BEACON = 0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C;
    address constant CIRCUIT_IMPL = 0x977f217887E085D298Cb3819cDAD5A0ee35F29B2;
    bytes32 constant PROCESSOR_CODEHASH = 0x57aa306fd0be97087da3534e03398f5ff4efd533b5be4e45a405ce86fa6717d5;
    /// "OrderGuard" (OGD), an existing processor whose transistors are priced in OKB
    address constant PROCESSOR = 0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355;
    address constant USDT0 = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    bytes32 constant TAPED_OUT = keccak256("TapedOut(uint256,address,uint32,uint32)");

    uint256 constant USDT = 1e6;
    uint96 constant FEE = 1_000; // 0.001 USDT0 per decision per fuse

    ITapeoutProcessor processor = ITapeoutProcessor(PROCESSOR);
    IERC20 usdt0 = IERC20(USDT0);

    address designer = makeAddr("designer");
    address admin = makeAddr("admin");
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address supplier = makeAddr("supplier");
    address scammer = makeAddr("scammer");
    address approver1 = makeAddr("approver1");
    address approver2 = makeAddr("approver2");
    address approver3 = makeAddr("approver3");

    FuseRegistry registry;
    FuseboxWallet wallet;
    uint256[5] circuitIds;
    uint256[5] fuseIds;
    uint256 okbSpent;

    function setUp() public {
        if (block.chainid != 196) {
            vm.skip(true);
            return;
        }
        // the facts this build relies on, re-read from the chain
        assertEq(PROCESSOR.codehash, PROCESSOR_CODEHASH, "processor proxy code");
        assertEq(ITapeoutBeacon(BEACON).implementation(), CIRCUIT_IMPL, "beacon implementation");
        assertTrue(ITapeoutFactory(TAPEOUT_FACTORY).isCPU(PROCESSOR), "factory lists the processor");
        assertEq(processor.factory(), TAPEOUT_FACTORY);
        assertEq(IERC20Metadata(USDT0).decimals(), 6);
        assertEq(keccak256(bytes(IERC20Metadata(USDT0).symbol())), keccak256(bytes(unicode"USD₮0")));

        _tapeOutAll();
        _deployFusebox();
    }

    // ------------------------------------------------------------------ helpers

    function _tapeOutAll() internal {
        vm.deal(designer, 1 ether);
        ITapeoutTransistors t = ITapeoutTransistors(processor.transistors());
        assertEq(t.circuits(), PROCESSOR);
        uint256 nand;
        uint256 latch;
        for (uint256 k; k < FuseFixtures.COUNT; ++k) {
            nand += FuseFixtures.fixture(k).nand;
            latch += FuseFixtures.fixture(k).latch;
        }
        uint256 price = t.mintPrice();
        uint256 pfee = t.protocolFee();
        uint256 startBal = designer.balance;
        vm.startPrank(designer);
        t.mint{value: price * nand + pfee}(0, nand);
        t.mint{value: price * latch + pfee}(1, latch);
        vm.stopPrank();
        assertEq(t.balanceOf(designer, 0), nand);
        assertEq(t.balanceOf(designer, 1), latch);
        console.log("transistor price (wei):", price);
        console.log("mint protocol fee (wei):", pfee);
        console.log("NAND bought:", nand);
        console.log("LATCH bought:", latch);

        uint256 tapeFee = processor.TAPEOUT_FEE();
        console.log("tapeout fee (wei):", tapeFee);
        for (uint256 k; k < FuseFixtures.COUNT; ++k) {
            FuseFixtures.Fixture memory f = FuseFixtures.fixture(k);
            vm.recordLogs();
            vm.prank(designer);
            uint256 ret = processor.tapeout{value: tapeFee}(f.netlist, f.nIn, f.nOut);
            uint256 id = _tapedOutId(vm.getRecordedLogs());
            assertEq(id, ret, "event id == returned id");
            circuitIds[k] = id;
            assertEq(processor.ownerOf(id), designer);
            (uint32 nIn, uint32 nOut, uint32 nState, uint32 gates) = processor.circuitInfo(id);
            assertEq(nIn, f.nIn);
            assertEq(nOut, f.nOut);
            assertEq(nState, f.nState);
            assertEq(gates, f.gates);
            assertEq(keccak256(processor.netlist(id)), f.netlistHash, "stored netlist");
            console.log(string.concat("taped out ", f.key, " as circuit"), id);
        }
        assertEq(t.balanceOf(designer, 0), 0, "one NAND burned per NAND record");
        assertEq(t.balanceOf(designer, 1), 0, "one LATCH burned per LATCH record");
        okbSpent = startBal - designer.balance;
        console.log("designer OKB spent (wei, excl. gas):", okbSpent);
    }

    function _tapedOutId(Vm.Log[] memory logs) internal pure returns (uint256) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == PROCESSOR && logs[i].topics.length > 1 && logs[i].topics[0] == TAPED_OUT) {
                return uint256(logs[i].topics[1]);
            }
        }
        revert("no TapedOut event");
    }

    function _deployFusebox() internal {
        registry = new FuseRegistry(usdt0, ITapeoutFactory(TAPEOUT_FACTORY), admin, 1_000);
        vm.startPrank(admin);
        registry.setProcessorCodehash(PROCESSOR_CODEHASH, BEACON);
        registry.setTrustedImplementation(CIRCUIT_IMPL, true);
        vm.stopPrank();
        for (uint256 k; k < FuseFixtures.COUNT; ++k) {
            FuseFixtures.Fixture memory f = FuseFixtures.fixture(k);
            vm.prank(designer);
            fuseIds[k] = registry.list(PROCESSOR, circuitIds[k], f.socket, f.netlistHash, FEE, "ipfs://fusebox");
        }
        FuseboxFactory factory = new FuseboxFactory(registry);
        address[] memory agents = new address[](1);
        agents[0] = agent;
        wallet = factory.createWallet(owner, agents, bytes32("fork"));

        deal(USDT0, owner, 100 * USDT);
        deal(USDT0, address(wallet), 1_000 * USDT);
        vm.startPrank(owner);
        usdt0.approve(address(registry), type(uint256).max);
        registry.deposit(address(wallet), 5 * USDT);
        Sockets.Params memory none;
        wallet.addFuse(fuseIds[0], Sockets.Params(USDT0, uint128(USDT), 50, 0), FEE); // cap 50 USDT0/day
        wallet.addFuse(fuseIds[1], Sockets.Params(USDT0, uint128(USDT), 24, 2), FEE); // 24h cooling, 2 USDT0 trial
        wallet.addFuse(fuseIds[2], none, FEE); // breaker
        wallet.addFuse(fuseIds[3], Sockets.Params(USDT0, uint128(USDT), 20, 0), FEE); // approvals above 20
        wallet.setToken(USDT0, true);
        wallet.addPayee(supplier);
        wallet.setApprovers([approver1, approver2, approver3]);
        vm.stopPrank();
        vm.warp(vm.getBlockTimestamp() + 25 hours);
    }

    function _pay(address to, uint256 amount, string memory memo) internal returns (bool allowed, uint256 gasUsed) {
        uint256 g = gasleft();
        vm.prank(agent);
        (allowed,) = wallet.pay(USDT0, to, amount, memo);
        gasUsed = g - gasleft();
    }

    // ------------------------------------------------------------------ tests

    /// @notice The real processor answers every spec vector exactly like the TypeScript simulator.
    function test_real_processor_matches_simulator_and_gas_per_fuse() public view {
        for (uint256 k; k < FuseFixtures.COUNT; ++k) {
            FuseFixtures.Fixture memory f = FuseFixtures.fixture(k);
            FuseFixtures.Vector[] memory v = FuseFixtures.vectors(k);
            uint256 gasTotal;
            for (uint256 i; i < v.length; ++i) {
                uint256 g = gasleft();
                if (f.nState == 0) {
                    assertEq(processor.eval(circuitIds[k], v[i].inputs), v[i].outputs, v[i].note);
                } else {
                    (bytes memory ns, bytes memory out) = processor.step(circuitIds[k], v[i].state, v[i].inputs);
                    assertEq(out, v[i].outputs, v[i].note);
                    assertEq(ns, v[i].newState, v[i].note);
                }
                gasTotal += g - gasleft();
            }
            console.log(string.concat(f.key, ": gates / avg gas per eval-or-step call"), f.gates, gasTotal / v.length);
        }
    }

    function test_story_allowed_scam_frozen_and_designer_paid() public {
        uint256 walletBefore = usdt0.balanceOf(address(wallet));

        // 1. an allowed payment to a saved, cooled-off supplier
        (bool ok, uint256 gasAllowed) = _pay(supplier, 10 * USDT, "invoice #42");
        assertTrue(ok, "allowed payment passes");
        assertEq(usdt0.balanceOf(supplier), 10 * USDT);
        console.log("pay() gas, allowed, 4 fuses:", gasAllowed);

        // 2. the scam: the agent says "sure thing, boss" to a stranger
        (ok,) = _pay(scammer, 5 * USDT, "sure thing, boss");
        assertFalse(ok, "scam payment is blocked");
        assertEq(usdt0.balanceOf(scammer), 0, "nothing moved");
        assertEq(wallet.blockedCount(), 1);
        assertEq(wallet.slotAt(2).state, hex"01", "breaker latched on the real processor");

        // 3. frozen: even the good supplier is blocked until the owner resets
        (ok,) = _pay(supplier, 1 * USDT, "small top-up");
        assertFalse(ok, "frozen wallet is blocked");
        vm.prank(owner);
        wallet.unfreeze();
        (ok,) = _pay(supplier, 1 * USDT, "small top-up");
        assertTrue(ok, "reset by owner");

        // 4. explicit freeze by the agent itself
        vm.prank(agent);
        wallet.freeze();
        (ok,) = _pay(supplier, 1 * USDT, "after freeze");
        assertFalse(ok, "owner/agent freeze blocks");
        vm.prank(owner);
        wallet.unfreeze();

        // 5. over the daily cap (11 spent; 11 + 40 > 50)
        (ok,) = _pay(supplier, 40 * USDT, "big order");
        assertFalse(ok, "cap");

        // 6. above the approval threshold: two of three humans approve on chain
        vm.prank(approver1);
        wallet.approvePayment(USDT0, supplier, 30 * USDT);
        vm.prank(approver2);
        wallet.approvePayment(USDT0, supplier, 30 * USDT);
        (ok,) = _pay(supplier, 30 * USDT, "approved order");
        assertTrue(ok, "2-of-3 approved");
        (ok,) = _pay(supplier, 30 * USDT, "replay");
        assertFalse(ok, "approvals are consumed");

        assertEq(usdt0.balanceOf(supplier), 41 * USDT);
        assertEq(walletBefore - usdt0.balanceOf(address(wallet)), 41 * USDT);

        // 7. designers were paid for every decision, blocked ones included
        uint256 decisions = wallet.decisionCount();
        assertEq(decisions, 8);
        uint256 perFuse = uint256(FEE) * decisions * 9 / 10;
        for (uint256 k; k < 4; ++k) {
            assertEq(registry.earned(fuseIds[k]), perFuse);
        }
        uint256 before = usdt0.balanceOf(designer);
        vm.startPrank(designer);
        for (uint256 k; k < 4; ++k) {
            registry.claim(fuseIds[k], designer);
        }
        vm.stopPrank();
        assertEq(usdt0.balanceOf(designer) - before, perFuse * 4, "designer received USDT0");
        console.log("designer earned (USDT0 base units):", perFuse * 4);
        assertGe(usdt0.balanceOf(address(registry)), registry.totalOwed());
    }

    /// @dev Every pay() on chain is its own transaction, so all accounts and slots start cold.
    function _coolAll() internal {
        address[9] memory hot =
            [address(wallet), address(registry), PROCESSOR, CIRCUIT_IMPL, BEACON, USDT0, supplier, scammer, agent];
        for (uint256 i; i < hot.length; ++i) {
            vm.cool(hot[i]);
        }
        address usdtImpl = address(
            uint160(uint256(vm.load(USDT0, 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc)))
        );
        if (usdtImpl != address(0)) vm.cool(usdtImpl);
    }

    /// @notice Gas per fuse (one cold eval/step on the real processor) and per decision (cold pay()).
    function test_gas_profile() public {
        for (uint256 k; k < FuseFixtures.COUNT; ++k) {
            FuseFixtures.Fixture memory f = FuseFixtures.fixture(k);
            FuseFixtures.Vector memory v = FuseFixtures.vectors(k)[0];
            _coolAll();
            uint256 g = gasleft();
            if (f.nState == 0) processor.eval(circuitIds[k], v.inputs);
            else processor.step(circuitIds[k], v.state, v.inputs);
            uint256 cold = g - gasleft();
            g = gasleft();
            if (f.nState == 0) processor.eval(circuitIds[k], v.inputs);
            else processor.step(circuitIds[k], v.state, v.inputs);
            uint256 warm = g - gasleft();
            console.log(string.concat("[gas] ", f.key, " gates / cold call / warm call"), f.gates, cold, warm);
        }

        Sockets.Params memory none;
        vm.startPrank(owner);
        wallet.removeFuse(3);
        wallet.removeFuse(2);
        wallet.removeFuse(1);
        vm.stopPrank();
        // each configuration: one warm-up decision (first-time storage writes), then a cold measured one
        (bool ok,) = _pay(supplier, 1 * USDT, "cap only");
        _coolAll();
        uint256 g1;
        (ok, g1) = _pay(supplier, 1 * USDT, "cap only");
        assertTrue(ok);
        vm.prank(owner);
        wallet.addFuse(fuseIds[1], Sockets.Params(USDT0, uint128(USDT), 24, 2), FEE);
        (ok,) = _pay(supplier, 1 * USDT, "cap + payee");
        assertTrue(ok);
        _coolAll();
        (, uint256 g2) = _pay(supplier, 1 * USDT, "cap + payee");
        vm.prank(owner);
        wallet.addFuse(fuseIds[2], none, FEE);
        _pay(supplier, 1 * USDT, "+ breaker");
        _coolAll();
        (, uint256 g3) = _pay(supplier, 1 * USDT, "+ breaker");
        vm.prank(owner);
        wallet.addFuse(fuseIds[3], Sockets.Params(USDT0, uint128(USDT), 20, 0), FEE);
        (ok,) = _pay(supplier, 1 * USDT, "+ two of three");
        assertTrue(ok);
        _coolAll();
        (, uint256 g4) = _pay(supplier, 1 * USDT, "+ two of three");
        _coolAll();
        uint256 g5;
        (ok, g5) = _pay(scammer, 1 * USDT, "sure thing, boss");
        assertFalse(ok);
        console.log("[gas] pay() allowed, cap only", g1);
        console.log("[gas] pay() allowed, cap + payee guard", g2);
        console.log("[gas] pay() allowed, + breaker", g3);
        console.log("[gas] pay() allowed, all four fuses", g4);
        console.log("[gas] pay() blocked (scam), all four fuses", g5);
    }

    /// @notice The Repeat Guard on TapeOut's real processor: the same invoice twice is paid once; the owner
    ///         clears a real repeat and it goes through, once.
    function test_repeat_guard_on_the_real_processor() public {
        vm.prank(owner);
        uint256 slot = wallet.addFuse(fuseIds[4], Sockets.Params(address(0), 0, 24, 0), FEE); // 24 h window
        (bool ok, uint256 gasFirst) = _pay(supplier, 10 * USDT, "invoice 7793");
        assertTrue(ok, "first payment of the invoice");
        vm.warp(vm.getBlockTimestamp() + 2 hours);
        (bool allowed, uint8[] memory status,,) = wallet.check(USDT0, supplier, 10 * USDT);
        assertFalse(allowed);
        assertEq(status[slot], wallet.BLEW(), "check sees the repeat");
        (ok,) = _pay(supplier, 10 * USDT, "invoice 7793, resent");
        assertFalse(ok, "same invoice again: stopped");
        vm.prank(owner);
        wallet.clearRepeat(USDT0, supplier, 10 * USDT, true);
        (ok,) = _pay(supplier, 10 * USDT, "a real second order");
        assertTrue(ok, "cleared repeat");
        (ok,) = _pay(supplier, 10 * USDT, "and again");
        assertFalse(ok, "the clearance was used up");
        assertEq(usdt0.balanceOf(supplier), 20 * USDT);
        assertEq(registry.decisions(fuseIds[4]), 4);
        console.log("pay() gas with all five fuses:", gasFirst);
    }

    function test_upgrade_of_tapeout_implementation_fails_closed() public {
        // simulate TapeOut's beacon being pointed at new code: every fuse must fail closed
        vm.mockCall(BEACON, abi.encodeCall(ITapeoutBeacon.implementation, ()), abi.encode(address(0xdead)));
        (bool ok,) = _pay(supplier, 1 * USDT, "after upgrade");
        assertFalse(ok);
        assertEq(registry.earned(fuseIds[0]), 0, "no fee when no fuse could decide");
    }
}
