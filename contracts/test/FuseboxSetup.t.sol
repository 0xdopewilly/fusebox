// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FuseboxSetup} from "../src/FuseboxSetup.sol";
import {FuseboxWallet} from "../src/FuseboxWallet.sol";
import {Sockets} from "../src/libraries/Sockets.sol";

import {Base} from "./Base.t.sol";
import {FuseFixtures} from "./fixtures/FuseFixtures.sol";

/// @notice One-transaction setup: create + configure + fund in one call, then the caller accepts ownership.
contract FuseboxSetupTest is Base {
    FuseboxSetup internal setup;
    address internal user;
    uint256 internal userKey;
    address internal newAgent = makeAddr("newAgent");

    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    function setUp() public override {
        super.setUp();
        setup = new FuseboxSetup(walletFactory);
        (user, userKey) = makeAddrAndKey("user");
        usdt.mint(user, 100 * USDT);
        vm.deal(user, 1 ether);
    }

    // ---- helpers -------------------------------------------------------------------------------

    function _config(bytes32 salt) internal view returns (FuseboxSetup.Setup memory s) {
        s.agents = new address[](1);
        s.agents[0] = newAgent;
        s.salt = salt;
        s.token = address(usdt);
        s.fuses = new FuseboxSetup.FuseInstall[](5);
        s.fuses[0] = FuseboxSetup.FuseInstall(fuseIds[FuseFixtures.DAILY_CAP], capParams(50), FEE_CAP);
        s.fuses[1] = FuseboxSetup.FuseInstall(fuseIds[FuseFixtures.PAYEE_GUARD], payeeParams(24, 2), FEE_PAYEE);
        s.fuses[2] = FuseboxSetup.FuseInstall(fuseIds[FuseFixtures.BREAKER], breakerParams(), FEE_BREAKER);
        s.fuses[3] = FuseboxSetup.FuseInstall(fuseIds[FuseFixtures.APPROVAL_2OF3], approvalParams(20), FEE_APPROVAL);
        s.fuses[4] = FuseboxSetup.FuseInstall(fuseIds[FuseFixtures.REPEAT_GUARD], repeatParams(24), FEE_REPEAT);
        s.payees = new address[](1);
        s.payees[0] = supplier;
        s.approvers = [user, approver2, approver3];
        s.feeDeposit = 1 * USDT;
        s.walletFloat = 5 * USDT;
    }

    function _permit(uint256 key, address owner_, uint256 value) internal view returns (FuseboxSetup.Permit memory p) {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, owner_, address(setup), value, usdt.nonces(owner_), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdt.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        p = FuseboxSetup.Permit(value, deadline, v, r, s);
    }

    function _noPermit() internal pure returns (FuseboxSetup.Permit memory p) {}

    function _setUpAsUser(bytes32 salt, uint256 gas) internal returns (FuseboxWallet w) {
        FuseboxSetup.Setup memory s = _config(salt);
        FuseboxSetup.Permit memory p = _permit(userKey, user, s.feeDeposit + s.walletFloat);
        vm.prank(user);
        w = setup.setUpWallet{value: gas}(s, p);
    }

    // ---- tests ---------------------------------------------------------------------------------

    function test_one_transaction_sets_everything_up() public {
        uint256 agentBefore = newAgent.balance;
        FuseboxWallet w = _setUpAsUser("a", 0.01 ether);

        assertTrue(walletFactory.isWallet(address(w)), "made by the factory");
        assertTrue(w.isAgent(newAgent));
        assertTrue(w.tokenEnabled(address(usdt)));
        assertEq(w.fuseCount(), 5);
        for (uint256 i; i < 5; ++i) {
            assertEq(w.slotAt(i).fuseId, fuseIds[i], "fuse order");
        }
        assertGt(w.payeeAddedAt(supplier), 0, "payee saved");
        address[3] memory seats = w.approvers();
        assertEq(seats[0], user);
        assertEq(seats[1], approver2);
        assertEq(seats[2], approver3);
        assertEq(registry.feeBalance(address(w)), 1 * USDT, "fees prepaid");
        assertEq(usdt.balanceOf(address(w)), 5 * USDT, "float funded");
        assertEq(usdt.balanceOf(user), 94 * USDT);
        assertEq(newAgent.balance - agentBefore, 0.01 ether, "agent gas sent");

        // the helper keeps nothing: no tokens, no OKB, no leftover allowance
        assertEq(usdt.balanceOf(address(setup)), 0);
        assertEq(address(setup).balance, 0);
        assertEq(usdt.allowance(address(setup), address(registry)), 0);
        assertEq(usdt.allowance(user, address(setup)), 0, "permit used up exactly");

        // ownership: handed over, waiting for the user
        assertEq(w.owner(), address(setup));
        assertEq(w.pendingOwner(), user);
        vm.prank(user);
        w.acceptOwnership();
        assertEq(w.owner(), user);
        assertEq(w.pendingOwner(), address(0));
    }

    function test_the_new_wallet_pays_and_stops_a_repeat() public {
        FuseboxWallet w = _setUpAsUser("a", 0);
        vm.prank(user);
        w.acceptOwnership();

        vm.prank(newAgent);
        (bool first,) = w.pay(address(usdt), supplier, 1 * USDT, "INV-1");
        assertTrue(first, "within the trial amount, every fuse passes");
        vm.prank(newAgent);
        (bool again,) = w.pay(address(usdt), supplier, 1 * USDT, "INV-1");
        assertFalse(again, "the Repeat Guard stops the same invoice");
        assertEq(usdt.balanceOf(supplier), 1 * USDT);
    }

    function test_nobody_else_can_take_the_wallet() public {
        FuseboxWallet w = _setUpAsUser("a", 0);
        vm.prank(scammer);
        vm.expectRevert(FuseboxWallet.NotOwner.selector);
        w.acceptOwnership();
        // the helper has no way to act on the wallet after setup: it exposes nothing but setUpWallet
        vm.prank(scammer);
        vm.expectRevert(FuseboxWallet.NotOwner.selector);
        w.setPaused(true);
    }

    function test_a_front_run_permit_does_not_break_setup() public {
        FuseboxSetup.Setup memory s = _config("a");
        FuseboxSetup.Permit memory p = _permit(userKey, user, s.feeDeposit + s.walletFloat);
        // someone copies the permit from the mempool and submits it first
        vm.prank(scammer);
        usdt.permit(user, address(setup), p.value, p.deadline, p.v, p.r, p.s);
        vm.prank(user);
        FuseboxWallet w = setup.setUpWallet(s, p);
        assertEq(w.fuseCount(), 5);
        assertEq(usdt.balanceOf(address(w)), 5 * USDT);
    }

    function test_without_a_permit_it_uses_the_allowance() public {
        FuseboxSetup.Setup memory s = _config("a");
        vm.startPrank(user);
        usdt.approve(address(setup), 6 * USDT);
        FuseboxWallet w = setup.setUpWallet(s, _noPermit());
        vm.stopPrank();
        assertEq(registry.feeBalance(address(w)), 1 * USDT);
    }

    function test_no_allowance_no_wallet() public {
        FuseboxSetup.Setup memory s = _config("a");
        // a permit signed by someone else does not give the helper the user's tokens
        (, uint256 otherKey) = makeAddrAndKey("other");
        FuseboxSetup.Permit memory p = _permit(otherKey, user, 6 * USDT);
        vm.prank(user);
        vm.expectRevert();
        setup.setUpWallet(s, p);
    }

    function test_it_only_spends_the_callers_tokens() public {
        // the user approved the helper; a stranger calling setUpWallet pays from their own (empty) balance
        vm.prank(user);
        usdt.approve(address(setup), type(uint256).max);
        FuseboxSetup.Setup memory s = _config("a");
        vm.prank(scammer);
        vm.expectRevert();
        setup.setUpWallet(s, _noPermit());
        assertEq(usdt.balanceOf(user), 100 * USDT);
    }

    function test_salt_is_per_caller() public {
        FuseboxWallet a = _setUpAsUser("same", 0);
        FuseboxSetup.Setup memory s = _config("same");
        s.feeDeposit = 0;
        s.walletFloat = 0;
        vm.prank(scammer);
        FuseboxWallet b = setup.setUpWallet(s, _noPermit());
        assertTrue(address(a) != address(b), "a stranger can't take the user's address");
        // the same caller and salt again collides (CREATE2), so a double submit can't make two wallets
        vm.prank(scammer);
        vm.expectRevert();
        setup.setUpWallet(s, _noPermit());
    }

    function test_minimal_setup_one_fuse_no_money() public {
        FuseboxSetup.Setup memory s;
        s.agents = new address[](1);
        s.agents[0] = newAgent;
        s.fuses = new FuseboxSetup.FuseInstall[](1);
        s.fuses[0] = FuseboxSetup.FuseInstall(fuseIds[FuseFixtures.BREAKER], breakerParams(), FEE_BREAKER);
        vm.prank(user);
        FuseboxWallet w = setup.setUpWallet(s, _noPermit());
        assertEq(w.fuseCount(), 1);
        address[3] memory seats = w.approvers();
        assertEq(seats[0], address(0), "approver seats left empty");
    }

    function test_gas_needs_an_agent_and_float_needs_a_token() public {
        FuseboxSetup.Setup memory s;
        vm.prank(user);
        vm.expectRevert(FuseboxSetup.NoAgentForGas.selector);
        setup.setUpWallet{value: 1}(s, _noPermit());

        s.salt = "b";
        s.walletFloat = 1;
        vm.startPrank(user);
        usdt.approve(address(setup), 1);
        vm.expectRevert(FuseboxSetup.NoTokenForFloat.selector);
        setup.setUpWallet(s, _noPermit());
        vm.stopPrank();
    }

    function test_a_fee_above_the_owners_max_fails_the_whole_setup() public {
        FuseboxSetup.Setup memory s = _config("a");
        s.fuses[1].maxFee = FEE_PAYEE - 1;
        FuseboxSetup.Permit memory p = _permit(userKey, user, s.feeDeposit + s.walletFloat);
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(FuseboxWallet.FeeAboveMax.selector, FEE_PAYEE, FEE_PAYEE - 1));
        setup.setUpWallet(s, p);
        assertEq(usdt.balanceOf(user), 100 * USDT, "all or nothing");
    }
}
