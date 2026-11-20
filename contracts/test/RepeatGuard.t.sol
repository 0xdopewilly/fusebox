// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Test.sol";

import {FuseRegistry} from "../src/FuseRegistry.sol";
import {FuseboxWallet} from "../src/FuseboxWallet.sol";
import {Sockets} from "../src/libraries/Sockets.sol";

import {Base} from "./Base.t.sol";
import {FuseFixtures} from "./fixtures/FuseFixtures.sol";

/// @notice The Repeat Guard (socket 5): the same invoice sent twice gets paid once.
contract RepeatGuardTest is Base {
    uint256 internal slot;

    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        slot = wallet.addFuse(fuseIds[FuseFixtures.REPEAT_GUARD], repeatParams(24), FEE_REPEAT);
    }

    function _repeatStatus() internal returns (bool allowed, uint8 status, bytes memory inputs) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint8[] memory st;
        bytes[] memory ins;
        (allowed,, st, ins,,) = lastDecision(logs);
        return (allowed, st[slot], ins[slot]);
    }

    function test_same_invoice_twice_is_paid_once() public {
        uint256 before = usdt.balanceOf(supplier);
        vm.recordLogs();
        assertTrue(pay(supplier, 10 * USDT), "first payment of the invoice");
        (, uint8 st, bytes memory ins) = _repeatStatus();
        assertEq(st, wallet.PASS());
        assertEq(ins, hex"00", "repeat 0, cleared 0");

        vm.warp(vm.getBlockTimestamp() + 3 hours);
        vm.recordLogs();
        assertFalse(pay(supplier, 10 * USDT), "same invoice again inside the window");
        (bool allowed, uint8 st2, bytes memory ins2) = _repeatStatus();
        assertFalse(allowed);
        assertEq(st2, wallet.BLEW(), "the Repeat Guard blew");
        assertEq(ins2, hex"01", "repeat 1, cleared 0");
        assertEq(usdt.balanceOf(supplier), before + 10 * USDT, "paid once");
    }

    function test_a_different_amount_or_payee_is_not_a_repeat() public {
        assertTrue(pay(supplier, 10 * USDT));
        assertTrue(pay(supplier, 11 * USDT), "different amount");
        address other = makeAddr("otherSupplier");
        vm.prank(owner);
        wallet.addPayee(other);
        vm.warp(vm.getBlockTimestamp() + 25 hours);
        assertTrue(pay(other, 10 * USDT), "different payee");
    }

    function test_repeat_after_the_window_goes_through() public {
        assertTrue(pay(supplier, 10 * USDT));
        vm.warp(vm.getBlockTimestamp() + 24 hours - 1);
        assertFalse(pay(supplier, 10 * USDT), "one second inside the window");
        vm.warp(vm.getBlockTimestamp() + 1);
        assertTrue(pay(supplier, 10 * USDT), "window over");
    }

    function test_owner_clears_one_repeat_and_it_is_used_up() public {
        assertTrue(pay(supplier, 10 * USDT));
        vm.prank(owner);
        wallet.clearRepeat(address(usdt), supplier, 10 * USDT, true);
        vm.recordLogs();
        assertTrue(pay(supplier, 10 * USDT), "cleared repeat");
        (, uint8 st, bytes memory ins) = _repeatStatus();
        assertEq(st, wallet.PASS());
        assertEq(ins, hex"03", "repeat 1, cleared 1");
        assertEq(wallet.repeatClearedUntil(wallet.repeatKey(address(usdt), supplier, 10 * USDT)), 0, "used up");
        assertFalse(pay(supplier, 10 * USDT), "a third one needs clearing again");
    }

    function test_clearance_expires_and_can_be_withdrawn() public {
        assertTrue(pay(supplier, 10 * USDT));
        vm.startPrank(owner);
        wallet.setApprovalTtl(1 hours); // shorter than the 24 h window, so expiry is what's tested
        wallet.clearRepeat(address(usdt), supplier, 10 * USDT, true);
        vm.stopPrank();
        vm.warp(vm.getBlockTimestamp() + 1 hours + 1);
        assertFalse(pay(supplier, 10 * USDT), "clearance expired");

        vm.startPrank(owner);
        wallet.clearRepeat(address(usdt), supplier, 10 * USDT, true);
        wallet.clearRepeat(address(usdt), supplier, 10 * USDT, false);
        vm.stopPrank();
        assertFalse(pay(supplier, 10 * USDT), "clearance withdrawn");
    }

    function test_only_the_owner_clears_a_repeat() public {
        address[4] memory notOwner = [agent, approver1, scammer, designer];
        for (uint256 i; i < notOwner.length; ++i) {
            vm.prank(notOwner[i]);
            vm.expectRevert(FuseboxWallet.NotOwner.selector);
            wallet.clearRepeat(address(usdt), supplier, 10 * USDT, true);
        }
    }

    function test_a_stopped_payment_is_not_remembered_as_paid() public {
        // 60 is over the 50 daily cap: stopped, so the next 10 is not a repeat of anything
        assertFalse(pay(supplier, 60 * USDT));
        assertEq(wallet.lastPaidAt(wallet.repeatKey(address(usdt), supplier, 60 * USDT)), 0);
        assertTrue(pay(supplier, 10 * USDT));
        assertEq(wallet.lastPaidAt(wallet.repeatKey(address(usdt), supplier, 10 * USDT)), vm.getBlockTimestamp());
    }

    function test_check_shows_the_repeat_before_anything_moves() public {
        (bool ok,,,) = wallet.check(address(usdt), supplier, 10 * USDT);
        assertTrue(ok);
        assertTrue(pay(supplier, 10 * USDT));
        (bool ok2, uint8[] memory status,,) = wallet.check(address(usdt), supplier, 10 * USDT);
        assertFalse(ok2);
        assertEq(status[slot], wallet.BLEW());
    }

    function test_designer_is_paid_for_every_repeat_decision() public {
        uint256 id = fuseIds[FuseFixtures.REPEAT_GUARD];
        assertTrue(pay(supplier, 10 * USDT));
        assertFalse(pay(supplier, 10 * USDT));
        assertEq(registry.decisions(id), 2, "allowed and stopped both decided");
        assertEq(registry.lifetimeEarned(id), 2 * (uint256(FEE_REPEAT) * (10_000 - PROTOCOL_BPS) / 10_000));
    }

    function test_params_are_a_window_and_nothing_else() public {
        uint256 id = fuseIds[FuseFixtures.REPEAT_GUARD];
        Sockets.Params[4] memory bad = [
            Sockets.Params({token: address(0), unit: 0, a: 0, b: 0}), // no window
            Sockets.Params({token: address(0), unit: 0, a: 255, b: 0}), // above MAX_PARAM
            Sockets.Params({token: address(usdt), unit: 0, a: 24, b: 0}), // a token
            Sockets.Params({token: address(0), unit: uint128(USDT), a: 24, b: 0}) // a unit
        ];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(owner);
            vm.expectRevert(abi.encodeWithSelector(Sockets.BadParams.selector, Sockets.REPEAT_GUARD));
            wallet.addFuse(id, bad[i], FEE_REPEAT);
        }
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Sockets.BadParams.selector, Sockets.REPEAT_GUARD));
        wallet.addFuse(id, Sockets.Params({token: address(0), unit: 0, a: 24, b: 1}), FEE_REPEAT);
    }

    function test_owner_can_widen_the_window() public {
        assertTrue(pay(supplier, 10 * USDT));
        vm.warp(vm.getBlockTimestamp() + 30 hours);
        vm.prank(owner);
        wallet.setFuseParams(slot, repeatParams(72));
        assertFalse(pay(supplier, 10 * USDT), "30 h is inside a 72 h window");
    }
}

/// @notice Socket pinouts are registry data, append-only, so a new socket never needs a new registry.
contract SocketDefsTest is Base {
    function test_built_in_sockets_are_defined_at_deploy() public view {
        uint32[5] memory nIns = [uint32(24), 33, 4, 19, 2];
        for (uint32 k = 1; k <= 5; ++k) {
            (uint32 nIn, uint32 nOut, bool seq) = registry.socketDef(k);
            assertEq(nIn, nIns[k - 1]);
            assertEq(nOut, 1);
            assertEq(seq, k == Sockets.BREAKER);
        }
        (, uint32 none,) = registry.socketDef(6);
        assertEq(none, 0);
    }

    function test_admin_adds_a_socket_but_never_changes_one() public {
        vm.prank(designer);
        vm.expectRevert();
        registry.defineSocket(6, 3, 1, false);

        vm.startPrank(admin);
        registry.defineSocket(6, 3, 1, false);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.SocketExists.selector, uint32(6)));
        registry.defineSocket(6, 4, 1, false);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.SocketExists.selector, uint32(5)));
        registry.defineSocket(5, 9, 1, false);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.BadSocket.selector, uint32(0)));
        registry.defineSocket(0, 1, 1, false);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.BadSocket.selector, uint32(7)));
        registry.defineSocket(7, 0, 1, false);
        vm.stopPrank();
    }

    function test_listing_follows_the_stored_pinout() public {
        // the 2-input Repeat Guard netlist can't be listed as an undefined socket 6 ...
        FuseFixtures.Fixture memory f = FuseFixtures.fixture(FuseFixtures.REPEAT_GUARD);
        vm.prank(designer);
        uint256 cid = processor.tapeout(f.netlist, f.nIn, f.nOut);
        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(Sockets.UnknownSocket.selector, uint32(6)));
        registry.list(address(processor), cid, 6, f.netlistHash, 100, "");

        // ... nor as a defined socket with another pinout ...
        vm.prank(admin);
        registry.defineSocket(6, 3, 1, false);
        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.PinoutMismatch.selector, uint32(6), uint32(2), uint32(1)));
        registry.list(address(processor), cid, 6, f.netlistHash, 100, "");

        // ... but lists once a matching socket exists; a wallet that can't drive socket 7 still refuses it
        vm.prank(admin);
        registry.defineSocket(7, 2, 1, false);
        vm.prank(designer);
        uint256 id = registry.list(address(processor), cid, 7, f.netlistHash, 100, "");
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Sockets.UnknownSocket.selector, uint32(7)));
        wallet.addFuse(id, repeatParams(24), 100);
    }
}
