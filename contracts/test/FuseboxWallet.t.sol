// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Test.sol";
import {Base} from "./Base.t.sol";
import {FuseboxWallet} from "../src/FuseboxWallet.sol";
import {FuseRegistry} from "../src/FuseRegistry.sol";
import {Sockets} from "../src/libraries/Sockets.sol";
import {FuseFixtures} from "./fixtures/FuseFixtures.sol";
import {HostileProcessor} from "./mocks/HostileProcessors.sol";
import {IPayable, ReentrantToken} from "./mocks/MockTokens.sol";

contract FuseboxWalletTest is Base {
    uint256 constant CAP = 0;
    uint256 constant PAYEE = 1;
    uint256 constant BREAKER = 2;
    uint256 constant APPROVAL = 3;

    // ------------------------------------------------------------------ the story

    function test_allowed_payment_moves_funds_and_pays_every_designer() public {
        uint256 feeBefore = registry.feeBalance(address(wallet));
        vm.recordLogs();
        assertTrue(pay(supplier, 10 * USDT));
        assertEq(usdt.balanceOf(supplier), 10 * USDT);
        assertEq(wallet.allowedCount(), 1);
        assertEq(wallet.blockedCount(), 0);
        assertEq(wallet.spentToday(CAP), 10 * USDT);

        (bool allowed, uint256[] memory ids, uint8[] memory status, bytes[] memory inputs, bytes[] memory outputs, uint256 fee) =
            lastDecision(vm.getRecordedLogs());
        assertTrue(allowed);
        assertEq(ids.length, 4);
        assertEq(fee, totalFee());
        for (uint256 i; i < 4; ++i) {
            assertEq(ids[i], fuseIds[i]);
            assertEq(status[i], 0);
            assertEq(outputs[i], hex"01");
        }
        // inputs exactly as the sockets define them
        assertEq(inputs[CAP], Sockets.dailyCapInputs(10, 0, 50));
        assertEq(inputs[PAYEE], Sockets.payeeGuardInputs(true, 25, 24, 10, 2));
        assertEq(inputs[BREAKER], Sockets.breakerInputs(false, false, true, false));
        assertEq(inputs[APPROVAL], Sockets.approvalInputs(0, 10, 20));

        assertEq(registry.feeBalance(address(wallet)), feeBefore - totalFee());
        assertEq(registry.earned(fuseIds[CAP]), FEE_CAP * 9 / 10);
        assertEq(registry.earned(fuseIds[APPROVAL]), FEE_APPROVAL * 9 / 10);
        assertEq(registry.protocolEarned(), totalFee() / 10);
        assertEq(registry.decisions(fuseIds[PAYEE]), 1);
    }

    function test_scam_payment_blows_fuses_and_moves_nothing() public {
        uint256 before = usdt.balanceOf(address(wallet));
        vm.recordLogs();
        assertFalse(pay(scammer, 5 * USDT));
        assertEq(usdt.balanceOf(scammer), 0);
        assertEq(usdt.balanceOf(address(wallet)), before);
        assertEq(wallet.blockedCount(), 1);
        assertEq(wallet.spentToday(CAP), 0, "blocked spend is not counted");

        Vm.Log[] memory logs = vm.getRecordedLogs();
        (bool allowed,, uint8[] memory status,, bytes[] memory outputs, uint256 fee) = lastDecision(logs);
        assertFalse(allowed);
        assertEq(status[CAP], 0);
        assertEq(status[PAYEE], 1, "payee guard blew");
        assertEq(status[BREAKER], 1, "breaker blew");
        assertEq(status[APPROVAL], 0);
        assertEq(outputs[PAYEE], hex"00");
        assertEq(fee, totalFee(), "every fuse that decided is paid, including the ones that said no");
        assertEq(_count(logs, FuseboxWallet.FuseBlew.selector), 2);
        // the breaker latched
        assertEq(wallet.slotAt(BREAKER).state, hex"01");
    }

    function test_breaker_stays_blown_until_owner_resets() public {
        pay(scammer, 1 * USDT);
        assertFalse(pay(supplier, 1 * USDT), "known payee is blocked while the breaker is blown");
        vm.prank(agent);
        vm.expectRevert(FuseboxWallet.NotOwner.selector);
        wallet.unfreeze();
        vm.prank(owner);
        wallet.unfreeze();
        assertEq(wallet.slotAt(BREAKER).state, hex"00");
        assertTrue(pay(supplier, 1 * USDT));
    }

    function test_freeze_by_agent_or_approver_but_not_strangers() public {
        vm.prank(agent);
        wallet.freeze();
        assertFalse(pay(supplier, 1 * USDT));
        vm.prank(owner);
        wallet.unfreeze();
        vm.prank(approver2);
        wallet.freeze();
        assertFalse(pay(supplier, 1 * USDT));
        vm.prank(scammer);
        vm.expectRevert(FuseboxWallet.NotAllowedToFreeze.selector);
        wallet.freeze();
    }

    function test_owner_pulse_set_and_clear_together_stays_frozen() public {
        vm.prank(owner);
        wallet.pulse(BREAKER, true, true);
        assertFalse(pay(supplier, 1 * USDT));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FuseboxWallet.NoOwnerPins.selector, CAP));
        wallet.pulse(CAP, true, false);
    }

    // ------------------------------------------------------------------ daily cap

    function test_daily_cap_blocks_over_cap_and_resets_next_day() public {
        vm.prank(owner);
        wallet.removeFuse(APPROVAL); // amounts above 20 would need approvals
        assertTrue(pay(supplier, 10 * USDT));
        assertFalse(pay(supplier, 41 * USDT), "10 + 41 > 50");
        assertTrue(pay(supplier, 40 * USDT), "10 + 40 == 50");
        assertFalse(pay(supplier, 1), "even 1 base unit rounds up to a unit");
        vm.warp(vm.getBlockTimestamp() + 1 days);
        assertTrue(pay(supplier, 15 * USDT));
        assertEq(wallet.spentToday(CAP), 15 * USDT);
    }

    function test_other_token_fails_closed_on_the_cap() public {
        vm.prank(agent);
        (bool allowed,) = wallet.pay(address(0), supplier, 1 wei, "pay in OKB");
        assertFalse(allowed, "cap is pinned to USDT0: OKB reads amount 255");
    }

    function test_native_payment_with_native_cap() public {
        vm.startPrank(owner);
        wallet.setFuseParams(CAP, Sockets.Params({token: address(0), unit: 0.01 ether, a: 10, b: 0}));
        wallet.removeFuse(APPROVAL);
        wallet.removeFuse(PAYEE);
        vm.stopPrank();
        uint256 before = supplier.balance;
        vm.prank(agent);
        (bool allowed,) = wallet.pay(address(0), supplier, 0.05 ether, "gas money");
        assertTrue(allowed);
        assertEq(supplier.balance - before, 0.05 ether);
        vm.prank(agent);
        (allowed,) = wallet.pay(address(0), supplier, 0.06 ether, "more gas money");
        assertFalse(allowed, "0.05 + 0.06 > 0.10");
    }

    // ------------------------------------------------------------------ payee guard

    function test_new_payee_trial_then_cooled() public {
        address newcomer = makeAddr("newcomer");
        vm.prank(owner);
        wallet.addPayee(newcomer);
        vm.warp(vm.getBlockTimestamp() + 1 hours);
        assertTrue(pay(newcomer, 2 * USDT), "trial allowance");
        assertFalse(pay(newcomer, 3 * USDT), "above trial while cooling");
        vm.warp(vm.getBlockTimestamp() + 23 hours);
        assertTrue(pay(newcomer, 3 * USDT), "cooled off after 24h");
    }

    function test_removed_payee_is_a_stranger_again() public {
        vm.prank(owner);
        wallet.removePayee(supplier);
        assertFalse(pay(supplier, 1 * USDT));
    }

    // ------------------------------------------------------------------ 2-of-3 approvals

    function test_two_of_three_above_threshold() public {
        assertFalse(pay(supplier, 30 * USDT), "above 20 needs approvals");
        vm.prank(approver1);
        wallet.approvePayment(address(usdt), supplier, 30 * USDT);
        assertFalse(pay(supplier, 30 * USDT), "one approval is not enough");
        vm.prank(approver3);
        wallet.approvePayment(address(usdt), supplier, 30 * USDT);
        assertEq(wallet.approvalMaskOf(address(usdt), supplier, 30 * USDT), 5);
        vm.recordLogs();
        assertTrue(pay(supplier, 30 * USDT));
        (,,, bytes[] memory inputs,,) = lastDecision(vm.getRecordedLogs());
        assertEq(inputs[APPROVAL], Sockets.approvalInputs(5, 30, 20));
        // consumed: the same payment cannot be replayed on the same approvals
        assertEq(wallet.approvalMaskOf(address(usdt), supplier, 30 * USDT), 0);
        assertFalse(pay(supplier, 30 * USDT), "replay blocked");
    }

    function test_approval_is_bound_to_exact_payment() public {
        vm.prank(approver1);
        wallet.approvePayment(address(usdt), supplier, 30 * USDT);
        vm.prank(approver2);
        wallet.approvePayment(address(usdt), supplier, 30 * USDT);
        assertFalse(pay(supplier, 31 * USDT), "different amount");
        assertTrue(pay(supplier, 30 * USDT));
    }

    function test_approvals_expire_and_reset_with_epoch() public {
        vm.prank(approver1);
        wallet.approvePayment(address(usdt), supplier, 30 * USDT);
        vm.prank(approver2);
        wallet.approvePayment(address(usdt), supplier, 30 * USDT);
        vm.warp(vm.getBlockTimestamp() + 1 days + 1);
        assertEq(wallet.approvalMaskOf(address(usdt), supplier, 30 * USDT), 0, "expired");
        assertFalse(pay(supplier, 30 * USDT));

        vm.prank(approver1);
        wallet.approvePayment(address(usdt), supplier, 30 * USDT); // stale mask reset, fresh window
        assertEq(wallet.approvalMaskOf(address(usdt), supplier, 30 * USDT), 1);
        vm.prank(approver2);
        wallet.approvePayment(address(usdt), supplier, 30 * USDT);
        vm.prank(owner);
        wallet.setApprovers([approver1, approver2, makeAddr("newSeat")]);
        assertEq(wallet.approvalMaskOf(address(usdt), supplier, 30 * USDT), 0, "new epoch");
        assertFalse(pay(supplier, 30 * USDT));
    }

    function test_approval_revoke_and_access() public {
        vm.prank(scammer);
        vm.expectRevert(FuseboxWallet.NotApprover.selector);
        wallet.approvePayment(address(usdt), scammer, 30 * USDT);
        vm.prank(approver1);
        wallet.approvePayment(address(usdt), supplier, 30 * USDT);
        vm.prank(approver2);
        wallet.approvePayment(address(usdt), supplier, 30 * USDT);
        vm.prank(approver2);
        wallet.revokeApproval(address(usdt), supplier, 30 * USDT);
        assertFalse(pay(supplier, 30 * USDT));
        vm.prank(owner);
        vm.expectRevert(FuseboxWallet.DuplicateApprover.selector);
        wallet.setApprovers([approver1, approver1, address(0)]);
    }

    function test_approval_intent_differs_per_wallet() public {
        address[] memory agents = new address[](0);
        FuseboxWallet other = walletFactory.createWallet(owner, agents, bytes32("w2"));
        assertTrue(other.intentHash(address(usdt), supplier, 1) != wallet.intentHash(address(usdt), supplier, 1));
    }

    // ------------------------------------------------------------------ fees

    function test_fee_balance_too_low_reverts_everything() public {
        uint256 bal = registry.feeBalance(address(wallet));
        vm.prank(owner);
        wallet.withdrawFeeBalance(bal, owner);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.InsufficientFeeBalance.selector, 0, totalFee()));
        wallet.pay(address(usdt), supplier, 1 * USDT, "");
    }

    function test_fee_increase_needs_owner_acceptance() public {
        vm.prank(designer);
        registry.setFee(fuseIds[CAP], FEE_CAP * 100);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.FeeAboveAccepted.selector, fuseIds[CAP], FEE_CAP * 100, FEE_CAP));
        wallet.pay(address(usdt), supplier, 1 * USDT, "");
        vm.prank(owner);
        wallet.setFuseMaxFee(CAP, FEE_CAP * 100);
        assertTrue(pay(supplier, 1 * USDT));
    }

    function test_fee_decrease_applies_at_once() public {
        vm.prank(designer);
        registry.setFee(fuseIds[PAYEE], 0);
        vm.recordLogs();
        pay(supplier, 1 * USDT);
        (,,,,, uint256 fee) = lastDecision(vm.getRecordedLogs());
        assertEq(fee, totalFee() - FEE_PAYEE);
    }

    function test_blocked_limit_bounds_fee_drain_but_not_good_payments() public {
        vm.prank(owner);
        wallet.setMaxBlockedPerDay(2);
        vm.prank(owner);
        wallet.removeFuse(BREAKER); // keep the wallet usable after strangers
        assertFalse(pay(scammer, 1 * USDT));
        assertFalse(pay(scammer, 1 * USDT));
        uint256 bal = registry.feeBalance(address(wallet));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(FuseboxWallet.BlockedLimitReached.selector, 2));
        wallet.pay(address(usdt), scammer, 1 * USDT, "");
        assertEq(registry.feeBalance(address(wallet)), bal, "no fee for the reverted attempt");
        assertTrue(pay(supplier, 1 * USDT), "good payments still go through");
        vm.warp(vm.getBlockTimestamp() + 1 days);
        assertFalse(pay(scammer, 1 * USDT), "new day, recorded again");
    }

    // ------------------------------------------------------------------ trust and failure modes

    function test_untrusted_implementation_fails_closed_and_charges_nothing() public {
        beacon.upgradeTo(makeAddr("unreviewedImplementation"));
        uint256 bal = registry.feeBalance(address(wallet));
        vm.recordLogs();
        assertFalse(pay(supplier, 1 * USDT));
        (,, uint8[] memory status,,, uint256 fee) = lastDecision(vm.getRecordedLogs());
        for (uint256 i; i < 4; ++i) {
            assertEq(status[i], 3);
        }
        assertEq(fee, 0);
        assertEq(registry.feeBalance(address(wallet)), bal);
        // attest it and things work again
        vm.prank(admin);
        registry.setTrustedImplementation(makeAddr("unreviewedImplementation"), true);
        assertTrue(pay(supplier, 1 * USDT));
    }

    function test_hostile_processor_fails_closed_in_every_mode() public {
        FuseFixtures.Fixture memory f = FuseFixtures.fixture(FuseFixtures.APPROVAL_2OF3);
        vm.prank(designer);
        HostileProcessor hostile = new HostileProcessor(f.netlist, f.nIn);
        tapeFactory.setCPU(address(hostile), true);
        vm.prank(admin);
        registry.setProcessorCodehash(address(hostile).codehash, address(beacon)); // deliberately allowlisted
        vm.prank(designer);
        uint256 id = registry.list(address(hostile), 1, Sockets.APPROVAL_2OF3, f.netlistHash, 0, "");
        vm.prank(owner);
        wallet.addFuse(id, approvalParams(20), 0);

        for (uint8 m; m <= uint8(HostileProcessor.Mode.Burn); ++m) {
            hostile.setMode(HostileProcessor.Mode(m));
            vm.recordLogs();
            assertFalse(pay(supplier, 1 * USDT));
            (,, uint8[] memory status,,,) = lastDecision(vm.getRecordedLogs());
            assertEq(status[4], 2, "FAILED");
            assertEq(status[0], 0);
        }
    }

    function test_caller_cannot_starve_a_fuse_of_gas() public {
        vm.prank(agent);
        vm.expectRevert(FuseboxWallet.InsufficientGas.selector);
        wallet.pay{gas: 1_500_000}(address(usdt), supplier, 1 * USDT, "");
        assertEq(wallet.decisionCount(), 0);
    }

    function test_reentrancy_through_token_is_refused() public {
        ReentrantToken bad = new ReentrantToken();
        bad.mint(address(wallet), 100 * USDT);
        bad.arm(IPayable(address(wallet)));
        vm.startPrank(owner);
        wallet.setFuseParams(CAP, Sockets.Params({token: address(bad), unit: uint128(USDT), a: 50, b: 0}));
        wallet.removeFuse(APPROVAL);
        wallet.setAgent(address(bad), true); // worst case: the token itself is an agent
        vm.stopPrank();
        vm.prank(agent);
        (bool allowed,) = wallet.pay(address(bad), supplier, 10 * USDT, "");
        assertTrue(allowed);
        assertTrue(bad.attempted());
        assertFalse(bad.reentered(), "nonReentrant held");
        assertEq(bad.balanceOf(supplier), 10 * USDT);
        assertEq(wallet.decisionCount(), 1);
    }

    function test_paused_reverts_before_any_fuse() public {
        vm.prank(owner);
        wallet.setPaused(true);
        vm.prank(agent);
        vm.expectRevert(FuseboxWallet.IsPaused.selector);
        wallet.pay(address(usdt), supplier, 1, "");
    }

    // ------------------------------------------------------------------ access control and stack

    function test_only_agents_pay_and_only_owner_configures() public {
        vm.prank(scammer);
        vm.expectRevert(FuseboxWallet.NotAgent.selector);
        wallet.pay(address(usdt), scammer, 1, "");

        vm.startPrank(agent);
        vm.expectRevert(FuseboxWallet.NotOwner.selector);
        wallet.removeFuse(0);
        vm.expectRevert(FuseboxWallet.NotOwner.selector);
        wallet.addPayee(scammer);
        vm.expectRevert(FuseboxWallet.NotOwner.selector);
        wallet.execute(address(usdt), 0, abi.encodeCall(usdt.transfer, (scammer, 1)));
        vm.expectRevert(FuseboxWallet.NotOwner.selector);
        wallet.setFuseMaxFee(0, type(uint96).max);
        vm.expectRevert(FuseboxWallet.NotOwner.selector);
        wallet.setAgent(scammer, true);
        vm.stopPrank();
    }

    function test_input_validation() public {
        vm.startPrank(agent);
        vm.expectRevert(FuseboxWallet.ZeroAmount.selector);
        wallet.pay(address(usdt), supplier, 0, "");
        vm.expectRevert(FuseboxWallet.BadPayee.selector);
        wallet.pay(address(usdt), address(wallet), 1, "");
        vm.expectRevert(FuseboxWallet.BadPayee.selector);
        wallet.pay(address(usdt), address(0), 1, "");
        vm.stopPrank();

        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(Sockets.BadParams.selector, Sockets.DAILY_CAP));
        wallet.addFuse(fuseIds[CAP], capParams(255), FEE_CAP); // 255 is reserved for saturation
        vm.expectRevert(abi.encodeWithSelector(Sockets.BadParams.selector, Sockets.BREAKER));
        wallet.addFuse(fuseIds[BREAKER], capParams(1), FEE_BREAKER);
        vm.expectRevert(abi.encodeWithSelector(FuseboxWallet.FeeAboveMax.selector, FEE_CAP, FEE_CAP - 1));
        wallet.addFuse(fuseIds[CAP], capParams(5), FEE_CAP - 1);
        vm.stopPrank();
    }

    function test_no_fuses_means_no_payments() public {
        vm.startPrank(owner);
        for (uint256 i; i < 4; ++i) {
            wallet.removeFuse(0);
        }
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(FuseboxWallet.NoFuses.selector);
        wallet.pay(address(usdt), supplier, 1, "");
    }

    function test_remove_keeps_order_and_max_stack() public {
        vm.prank(owner);
        wallet.removeFuse(PAYEE);
        assertEq(wallet.fuseCount(), 3);
        assertEq(wallet.slotAt(0).fuseId, fuseIds[CAP]);
        assertEq(wallet.slotAt(1).fuseId, fuseIds[BREAKER]);
        assertEq(wallet.slotAt(2).fuseId, fuseIds[APPROVAL]);
        vm.startPrank(owner);
        for (uint256 i; i < 5; ++i) {
            wallet.addFuse(fuseIds[BREAKER], breakerParams(), FEE_BREAKER);
        }
        vm.expectRevert(FuseboxWallet.TooManyFuses.selector);
        wallet.addFuse(fuseIds[BREAKER], breakerParams(), FEE_BREAKER);
        vm.stopPrank();
    }

    function test_delisted_fuse_keeps_working_but_cannot_be_installed() public {
        vm.prank(designer);
        registry.setListed(fuseIds[CAP], false);
        assertTrue(pay(supplier, 1 * USDT));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FuseboxWallet.FuseNotListed.selector, fuseIds[CAP]));
        wallet.addFuse(fuseIds[CAP], capParams(5), FEE_CAP);
    }

    function test_check_matches_pay() public {
        (bool okGood, uint8[] memory s1,,) = wallet.check(address(usdt), supplier, 10 * USDT);
        (bool okScam, uint8[] memory s2,,) = wallet.check(address(usdt), scammer, 10 * USDT);
        assertTrue(okGood);
        assertFalse(okScam);
        assertEq(s1[PAYEE], 0);
        assertEq(s2[PAYEE], 1);
        assertEq(wallet.decisionCount(), 0, "dry run changes nothing");
        assertTrue(pay(supplier, 10 * USDT));
        assertFalse(pay(scammer, 10 * USDT));
    }

    function test_owner_execute_and_two_step_ownership() public {
        vm.prank(owner);
        wallet.execute(address(usdt), 0, abi.encodeCall(usdt.transfer, (owner, 5 * USDT)));
        assertEq(usdt.balanceOf(owner), 95 * USDT); // 100 minted - 10 deposited + 5
        address next = makeAddr("nextOwner");
        vm.prank(owner);
        wallet.transferOwnership(next);
        assertEq(wallet.owner(), owner);
        vm.prank(next);
        wallet.acceptOwnership();
        assertEq(wallet.owner(), next);
    }

    // ------------------------------------------------------------------ properties

    /// @notice Whatever sequence of payments the agent tries, the amount that leaves through a capped
    ///         token in one UTC day never exceeds cap * unit.
    function testFuzz_cap_is_never_exceeded(uint256 seed) public {
        vm.startPrank(owner);
        wallet.removeFuse(APPROVAL);
        wallet.removeFuse(BREAKER);
        wallet.removeFuse(PAYEE);
        vm.stopPrank();
        uint256 day = vm.getBlockTimestamp() / 1 days;
        uint256 moved;
        for (uint256 i; i < 12; ++i) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            uint256 amount = 1 + (seed % (30 * USDT));
            uint256 before = usdt.balanceOf(supplier);
            pay(supplier, amount);
            moved += usdt.balanceOf(supplier) - before;
            vm.warp(vm.getBlockTimestamp() + (seed >> 200) % 3 hours);
            if (vm.getBlockTimestamp() / 1 days != day) break;
        }
        assertLe(moved, 50 * USDT);
        assertLe(wallet.spentToday(CAP), 50 * USDT);
    }

    function testFuzz_quantise_never_under_reports(uint256 amount, uint128 unit) public pure {
        vm.assume(unit > 0);
        amount = bound(amount, 0, type(uint256).max / 2);
        uint8 q = Sockets.quantise(amount, unit);
        if (q < 255) {
            assertGe(uint256(q) * unit, amount, "rounded up");
            if (q > 0) assertLt(uint256(q - 1) * unit, amount, "tight");
        } else {
            assertGe(amount, uint256(254) * unit + 1, "only saturates above 254 units");
        }
    }

    function _count(Vm.Log[] memory logs, bytes32 sig) internal view returns (uint256 n) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(wallet) && logs[i].topics[0] == sig) n++;
        }
    }
}
