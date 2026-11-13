// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FuseRegistry} from "../src/FuseRegistry.sol";
import {FuseboxWallet} from "../src/FuseboxWallet.sol";
import {FuseboxFactory} from "../src/FuseboxFactory.sol";
import {ITapeoutFactory} from "../src/interfaces/ITapeout.sol";
import {Sockets} from "../src/libraries/Sockets.sol";

import {FuseFixtures} from "./fixtures/FuseFixtures.sol";
import {MockBeacon, MockFactory, MockProcessor} from "./mocks/MockTapeout.sol";
import {MockUSDT0} from "./mocks/MockTokens.sol";

/// @notice Shared world for unit tests: a mock TapeOut processor running the real netlists,
///         a registry with the four shipped fuses listed, and one wallet with all four installed.
abstract contract Base is Test {
    uint256 internal constant USDT = 1e6;
    uint16 internal constant PROTOCOL_BPS = 1_000; // 10%

    // fee per decision, USDT0 base units
    uint96 internal constant FEE_CAP = 1_000; // 0.001
    uint96 internal constant FEE_PAYEE = 2_000; // 0.002
    uint96 internal constant FEE_BREAKER = 500; // 0.0005
    uint96 internal constant FEE_APPROVAL = 1_500; // 0.0015

    address internal admin = makeAddr("admin");
    address internal designer = makeAddr("designer");
    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal supplier = makeAddr("supplier");
    address internal scammer = makeAddr("scammer");
    address internal approver1 = makeAddr("approver1");
    address internal approver2 = makeAddr("approver2");
    address internal approver3 = makeAddr("approver3");
    address internal impl = makeAddr("circuitImplementation");

    MockUSDT0 internal usdt;
    MockFactory internal tapeFactory;
    MockProcessor internal processor;
    MockBeacon internal beacon;
    FuseRegistry internal registry;
    FuseboxFactory internal walletFactory;
    FuseboxWallet internal wallet;

    // fuse ids in the registry, by fixture index
    uint256[4] internal fuseIds;
    uint256[4] internal circuitIds;

    function setUp() public virtual {
        vm.warp(1_800_000_000); // a fixed, realistic timestamp (2027)
        usdt = new MockUSDT0();
        tapeFactory = new MockFactory();
        processor = new MockProcessor(address(tapeFactory));
        tapeFactory.setCPU(address(processor), true);
        beacon = new MockBeacon(impl);

        registry = new FuseRegistry(IERC20(address(usdt)), ITapeoutFactory(address(tapeFactory)), admin, PROTOCOL_BPS);
        vm.startPrank(admin);
        registry.setProcessorCodehash(address(processor).codehash, address(beacon));
        registry.setTrustedImplementation(impl, true);
        vm.stopPrank();

        uint96[4] memory fees = [FEE_CAP, FEE_PAYEE, FEE_BREAKER, FEE_APPROVAL];
        for (uint256 k; k < FuseFixtures.COUNT; ++k) {
            FuseFixtures.Fixture memory f = FuseFixtures.fixture(k);
            vm.prank(designer);
            circuitIds[k] = processor.tapeout(f.netlist, f.nIn, f.nOut);
            vm.prank(designer);
            fuseIds[k] = registry.list(address(processor), circuitIds[k], f.socket, f.netlistHash, fees[k], "ipfs://fuse");
        }

        walletFactory = new FuseboxFactory(registry);
        address[] memory agents = new address[](1);
        agents[0] = agent;
        wallet = walletFactory.createWallet(owner, agents, bytes32("w1"));

        // money: fee balance prepaid by the owner, spendable funds in the wallet
        usdt.mint(owner, 100 * USDT);
        vm.startPrank(owner);
        usdt.approve(address(registry), type(uint256).max);
        registry.deposit(address(wallet), 10 * USDT);
        vm.stopPrank();
        usdt.mint(address(wallet), 1_000 * USDT);
        vm.deal(address(wallet), 10 ether);

        _installAll();

        vm.startPrank(owner);
        wallet.setToken(address(usdt), true);
        wallet.setToken(address(0), true);
        wallet.addPayee(supplier);
        wallet.setApprovers([approver1, approver2, approver3]);
        vm.stopPrank();
        vm.warp(vm.getBlockTimestamp() + 25 hours); // supplier has cooled off
    }

    function _installAll() internal {
        vm.startPrank(owner);
        wallet.addFuse(fuseIds[FuseFixtures.DAILY_CAP], capParams(50), FEE_CAP);
        wallet.addFuse(fuseIds[FuseFixtures.PAYEE_GUARD], payeeParams(24, 2), FEE_PAYEE);
        wallet.addFuse(fuseIds[FuseFixtures.BREAKER], breakerParams(), FEE_BREAKER);
        wallet.addFuse(fuseIds[FuseFixtures.APPROVAL_2OF3], approvalParams(20), FEE_APPROVAL);
        vm.stopPrank();
    }

    function capParams(uint8 cap) internal view returns (Sockets.Params memory) {
        return Sockets.Params({token: address(usdt), unit: uint128(USDT), a: cap, b: 0});
    }

    function payeeParams(uint8 cooldownHours, uint8 trial) internal view returns (Sockets.Params memory) {
        return Sockets.Params({token: address(usdt), unit: uint128(USDT), a: cooldownHours, b: trial});
    }

    function breakerParams() internal pure returns (Sockets.Params memory p) {}

    function approvalParams(uint8 threshold) internal view returns (Sockets.Params memory) {
        return Sockets.Params({token: address(usdt), unit: uint128(USDT), a: threshold, b: 0});
    }

    function totalFee() internal pure returns (uint256) {
        return uint256(FEE_CAP) + FEE_PAYEE + FEE_BREAKER + FEE_APPROVAL;
    }

    function pay(address to, uint256 amount) internal returns (bool allowed) {
        vm.prank(agent);
        (allowed,) = wallet.pay(address(usdt), to, amount, "sure thing, boss");
    }

    /// @dev Decode the wallet's Decision event from the last recorded logs.
    function lastDecision(Vm.Log[] memory logs)
        internal
        view
        returns (bool allowed, uint256[] memory ids, uint8[] memory status, bytes[] memory inputs, bytes[] memory outputs, uint256 fee)
    {
        bytes32 sig = FuseboxWallet.Decision.selector;
        for (uint256 i = logs.length; i > 0; --i) {
            Vm.Log memory l = logs[i - 1];
            if (l.emitter == address(wallet) && l.topics[0] == sig) {
                (, , allowed, ids, status, inputs, outputs, fee, ,) = abi.decode(
                    l.data, (address, uint256, bool, uint256[], uint8[], bytes[], bytes[], uint256, bytes32, string)
                );
                return (allowed, ids, status, inputs, outputs, fee);
            }
        }
        revert("no Decision event");
    }
}
