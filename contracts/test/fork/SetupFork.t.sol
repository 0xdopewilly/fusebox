// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

import {FuseRegistry} from "../../src/FuseRegistry.sol";
import {FuseboxFactory} from "../../src/FuseboxFactory.sol";
import {FuseboxSetup} from "../../src/FuseboxSetup.sol";
import {FuseboxWallet} from "../../src/FuseboxWallet.sol";
import {Sockets} from "../../src/libraries/Sockets.sol";

/// @notice FuseboxSetup against the live v2 contracts on an X Layer fork: the real factory and registry,
///         USD₮0's real EIP-2612 permit, and TapeOut's real processor deciding the payments.
///         forge test --fork-url https://rpc.xlayer.tech --match-path test/fork/SetupFork.t.sol
contract SetupForkTest is Test {
    FuseboxFactory constant FACTORY = FuseboxFactory(0xdFc9b1d715efB2bCDAd8f848A5E3b4e2c243EE9B);
    FuseRegistry constant REGISTRY = FuseRegistry(0x2583928546a614A2fD993B5C106ED9aD0E781AB6);
    address constant USDT0 = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    address constant SUPPLIER = 0x69dB89385E8a69278a49335C432d0c70ec86A6C4; // holds a little USD₮0
    bytes32 constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    FuseboxSetup setup;
    address user;
    uint256 userKey;
    address agent = makeAddr("forkAgent");
    address approver2 = makeAddr("forkApprover2");
    address approver3 = makeAddr("forkApprover3");

    function setUp() public {
        if (block.chainid != 196) {
            vm.skip(true);
            return;
        }
        setup = new FuseboxSetup(FACTORY);
        assertEq(address(setup.registry()), address(REGISTRY));
        (user, userKey) = makeAddrAndKey("forkUser");
        vm.prank(SUPPLIER);
        IERC20(USDT0).transfer(user, 30_000); // 0.03 USD₮0
        vm.deal(user, 0.01 ether);
    }

    function _p(address token, uint128 unit, uint8 a, uint8 b) internal pure returns (Sockets.Params memory) {
        return Sockets.Params({token: token, unit: unit, a: a, b: b});
    }

    function test_three_taps_on_the_live_contracts() public {
        FuseboxSetup.Setup memory s;
        s.agents = new address[](1);
        s.agents[0] = agent;
        s.salt = keccak256("fork");
        s.token = USDT0;
        s.fuses = new FuseboxSetup.FuseInstall[](5);
        s.fuses[0] = FuseboxSetup.FuseInstall(1, _p(USDT0, 1e6, 50, 0), uint96(REGISTRY.feeOf(1)));
        s.fuses[1] = FuseboxSetup.FuseInstall(2, _p(USDT0, 1e6, 24, 2), uint96(REGISTRY.feeOf(2)));
        s.fuses[2] = FuseboxSetup.FuseInstall(3, _p(address(0), 0, 0, 0), uint96(REGISTRY.feeOf(3)));
        s.fuses[3] = FuseboxSetup.FuseInstall(4, _p(USDT0, 1e6, 20, 0), uint96(REGISTRY.feeOf(4)));
        s.fuses[4] = FuseboxSetup.FuseInstall(5, _p(address(0), 0, 24, 0), uint96(REGISTRY.feeOf(5)));
        s.payees = new address[](1);
        s.payees[0] = SUPPLIER;
        s.approvers = [user, approver2, approver3];
        s.feeDeposit = 15_000;
        s.walletFloat = 10_000;

        // tap 1: a free signature (USD₮0 permit)
        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = s.feeDeposit + s.walletFloat;
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                IERC20Permit(USDT0).DOMAIN_SEPARATOR(),
                keccak256(abi.encode(PERMIT_TYPEHASH, user, address(setup), value, IERC20Permit(USDT0).nonces(user), deadline))
            )
        );
        (uint8 v, bytes32 r, bytes32 sig) = vm.sign(userKey, digest);

        // tap 2: one transaction
        uint256 gasBefore = gasleft();
        vm.prank(user);
        FuseboxWallet w = setup.setUpWallet{value: 0.0003 ether}(s, FuseboxSetup.Permit(value, deadline, v, r, sig));
        emit log_named_uint("setUpWallet gas (five fuses)", gasBefore - gasleft());

        assertTrue(FACTORY.isWallet(address(w)));
        assertEq(w.fuseCount(), 5);
        assertEq(REGISTRY.feeBalance(address(w)), 15_000);
        assertEq(IERC20(USDT0).balanceOf(address(w)), 10_000);
        assertEq(agent.balance, 0.0003 ether);
        assertEq(IERC20(USDT0).balanceOf(address(setup)), 0);

        // tap 3: accept ownership
        vm.prank(user);
        w.acceptOwnership();
        assertEq(w.owner(), user);

        // TapeOut's processor decides: the invoice once, not twice
        vm.prank(agent);
        (bool first,) = w.pay(USDT0, SUPPLIER, 2_000, "INV-1");
        assertTrue(first, "all five fuses pass");
        vm.prank(agent);
        (bool again,) = w.pay(USDT0, SUPPLIER, 2_000, "INV-1");
        assertFalse(again, "the Repeat Guard stops the repeat");
    }
}
