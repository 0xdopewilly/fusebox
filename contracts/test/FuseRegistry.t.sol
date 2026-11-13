// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {FuseRegistry} from "../src/FuseRegistry.sol";
import {Sockets} from "../src/libraries/Sockets.sol";
import {FuseFixtures} from "./fixtures/FuseFixtures.sol";
import {FakeProcessor} from "./mocks/HostileProcessors.sol";
import {MockProcessor} from "./mocks/MockTapeout.sol";

contract FuseRegistryTest is Base {
    function _fresh(uint256 k) internal returns (uint256 id, FuseFixtures.Fixture memory f) {
        f = FuseFixtures.fixture(k);
        vm.prank(designer);
        id = processor.tapeout(f.netlist, f.nIn, f.nOut);
    }

    // ------------------------------------------------------------------ listing

    function test_listing_records_the_chain_facts() public view {
        FuseRegistry.Fuse memory f = registry.fuse(fuseIds[0]);
        FuseFixtures.Fixture memory x = FuseFixtures.fixture(0);
        assertEq(f.processor, address(processor));
        assertEq(f.circuitId, circuitIds[0]);
        assertEq(f.socket, Sockets.DAILY_CAP);
        assertEq(f.gateCount, x.gates);
        assertEq(f.nState, 0);
        assertEq(f.netlistHash, x.netlistHash);
        assertTrue(f.listed);
        assertEq(registry.designerOf(fuseIds[0]), designer);
        assertEq(registry.fuseIdOf(address(processor), circuitIds[0]), fuseIds[0]);
        assertEq(registry.fuse(fuseIds[2]).nState, 1, "breaker keeps one state bit");
        assertEq(registry.originalOf(x.netlistHash), fuseIds[0]);
    }

    function test_copies_are_listed_but_not_original() public {
        (uint256 id, FuseFixtures.Fixture memory f) = _fresh(0); // same netlist, new circuit id
        vm.prank(designer);
        uint256 copy = registry.list(address(processor), id, f.socket, f.netlistHash, 0, "");
        assertEq(registry.originalOf(f.netlistHash), fuseIds[0]);
        assertTrue(copy != fuseIds[0]);
    }

    function test_only_the_circuit_owner_can_list() public {
        (uint256 id, FuseFixtures.Fixture memory f) = _fresh(0);
        vm.prank(scammer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.NotCircuitOwner.selector, scammer, designer));
        registry.list(address(processor), id, f.socket, f.netlistHash, 0, "");
    }

    function test_a_circuit_is_listed_once() public {
        FuseFixtures.Fixture memory f = FuseFixtures.fixture(0);
        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.AlreadyListed.selector, fuseIds[0]));
        registry.list(address(processor), circuitIds[0], f.socket, f.netlistHash, 0, "");
    }

    function test_fake_processor_is_refused() public {
        FuseFixtures.Fixture memory f = FuseFixtures.fixture(0);
        vm.prank(scammer);
        FakeProcessor fake = new FakeProcessor(f.netlist, f.nIn);
        tapeFactory.setCPU(address(fake), true); // even if the factory were fooled
        vm.prank(scammer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.UntrustedProcessor.selector, address(fake)));
        registry.list(address(fake), 1, f.socket, f.netlistHash, 0, "");
    }

    function test_processor_not_registered_with_factory_is_refused() public {
        MockProcessor stray = new MockProcessor(address(tapeFactory)); // same code, not a factory CPU
        FuseFixtures.Fixture memory f = FuseFixtures.fixture(0);
        vm.prank(designer);
        uint256 id = stray.tapeout(f.netlist, f.nIn, f.nOut);
        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.UntrustedProcessor.selector, address(stray)));
        registry.list(address(stray), id, f.socket, f.netlistHash, 0, "");
    }

    function test_unattested_implementation_is_refused() public {
        (uint256 id, FuseFixtures.Fixture memory f) = _fresh(0);
        vm.prank(admin);
        registry.setTrustedImplementation(impl, false);
        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.UntrustedProcessor.selector, address(processor)));
        registry.list(address(processor), id, f.socket, f.netlistHash, 0, "");
    }

    function test_pinout_must_match_socket() public {
        (uint256 id, FuseFixtures.Fixture memory f) = _fresh(0); // 24 inputs
        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.PinoutMismatch.selector, Sockets.BREAKER, 24, 1));
        registry.list(address(processor), id, Sockets.BREAKER, f.netlistHash, 0, "");
        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(Sockets.UnknownSocket.selector, 99));
        registry.list(address(processor), id, 99, f.netlistHash, 0, "");
    }

    function test_netlist_hash_must_match_chain() public {
        (uint256 id, FuseFixtures.Fixture memory f) = _fresh(0);
        bytes32 wrong = keccak256("a different circuit");
        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.NetlistHashMismatch.selector, wrong, f.netlistHash));
        registry.list(address(processor), id, f.socket, wrong, 0, "");
    }

    function test_gate_budget_is_enforced() public {
        // 4-input circuit (breaker pinout) padded to 600 NANDs
        bytes memory nl;
        for (uint256 i; i < 600; ++i) {
            nl = bytes.concat(nl, hex"00000002000003");
        }
        vm.prank(designer);
        uint256 id = processor.tapeout(nl, 4, 1);
        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.TooManyGates.selector, 600));
        registry.list(address(processor), id, Sockets.BREAKER, keccak256(nl), 0, "");
    }

    function test_listing_owner_controls() public {
        vm.startPrank(scammer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.NotCircuitOwner.selector, scammer, designer));
        registry.setFee(fuseIds[0], 1);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.NotCircuitOwner.selector, scammer, designer));
        registry.setListed(fuseIds[0], false);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.NotCircuitOwner.selector, scammer, designer));
        registry.setMetadataURI(fuseIds[0], "x");
        vm.stopPrank();
        vm.startPrank(designer);
        registry.setFee(fuseIds[0], 7);
        registry.setMetadataURI(fuseIds[0], "ipfs://v2");
        vm.stopPrank();
        assertEq(registry.feeOf(fuseIds[0]), 7);
        assertEq(registry.metadataURI(fuseIds[0]), "ipfs://v2");
    }

    // ------------------------------------------------------------------ money

    function test_selling_the_circuit_nft_sells_the_income_stream() public {
        assertTrue(pay(supplier, 1 * USDT));
        uint256 owed = registry.earned(fuseIds[0]);
        assertEq(owed, FEE_CAP * 9 / 10);
        address buyer = makeAddr("buyer");
        vm.prank(designer);
        processor.transferFrom(designer, buyer, circuitIds[0]);
        assertEq(registry.designerOf(fuseIds[0]), buyer);

        vm.prank(designer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.NotCircuitOwner.selector, designer, buyer));
        registry.claim(fuseIds[0], designer);

        vm.prank(buyer);
        assertEq(registry.claim(fuseIds[0], buyer), owed);
        assertEq(usdt.balanceOf(buyer), owed);
        assertEq(registry.earned(fuseIds[0]), 0);
        // the buyer can also reprice and delist
        vm.prank(buyer);
        registry.setFee(fuseIds[0], 0);
    }

    function test_charge_accounting() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = fuseIds[0];
        ids[1] = fuseIds[1];
        uint256[] memory maxFees = new uint256[](2);
        maxFees[0] = FEE_CAP;
        maxFees[1] = FEE_PAYEE;
        address payer = makeAddr("payer");
        usdt.mint(payer, 1 * USDT);
        vm.startPrank(payer);
        usdt.approve(address(registry), type(uint256).max);
        registry.deposit(payer, 1 * USDT);
        uint256 total = registry.charge(ids, maxFees);
        vm.stopPrank();
        assertEq(total, FEE_CAP + FEE_PAYEE);
        assertEq(registry.feeBalance(payer), 1 * USDT - total);
        assertEq(registry.protocolEarned(), total / 10);

        vm.prank(payer);
        vm.expectRevert(FuseRegistry.LengthMismatch.selector);
        registry.charge(ids, new uint256[](1));
        ids[1] = 999;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.UnknownFuse.selector, 999));
        registry.charge(ids, maxFees);
        // a stranger with no balance cannot charge
        ids[1] = fuseIds[1];
        vm.prank(scammer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.InsufficientFeeBalance.selector, 0, total));
        registry.charge(ids, maxFees);
    }

    function test_withdraw_only_own_balance() public {
        vm.prank(scammer);
        vm.expectRevert(abi.encodeWithSelector(FuseRegistry.InsufficientFeeBalance.selector, 0, 1));
        registry.withdraw(1, scammer);
    }

    function test_protocol_fee_bounds_and_claim() public {
        vm.prank(admin);
        vm.expectRevert(FuseRegistry.FeeTooHigh.selector);
        registry.setProtocolFee(2_001);
        vm.prank(scammer);
        vm.expectRevert();
        registry.setProtocolFee(0);
        pay(supplier, 1 * USDT);
        address treasury = makeAddr("treasury");
        vm.prank(admin);
        uint256 got = registry.claimProtocol(treasury);
        assertEq(got, totalFee() / 10);
        assertEq(usdt.balanceOf(treasury), got);
    }

    /// @notice Whatever happens, the registry holds at least what it owes, and owes exactly the sum of its books.
    function testFuzz_solvency(uint8 payments, uint8 scams, bool claimAll) public {
        payments = uint8(bound(payments, 0, 6));
        scams = uint8(bound(scams, 0, 3));
        vm.prank(owner);
        wallet.removeFuse(2); // breaker: keep paying after scams
        for (uint256 i; i < payments; ++i) {
            pay(supplier, 1 * USDT);
        }
        for (uint256 i; i < scams; ++i) {
            pay(scammer, 1 * USDT);
        }
        uint256 owedEarnings;
        for (uint256 k; k < 4; ++k) {
            owedEarnings += registry.earned(fuseIds[k]);
        }
        if (claimAll) {
            for (uint256 k; k < 4; ++k) {
                vm.prank(designer);
                registry.claim(fuseIds[k], designer);
            }
            owedEarnings = 0;
        }
        uint256 books = registry.feeBalance(address(wallet)) + owedEarnings + registry.protocolEarned();
        assertEq(registry.totalOwed(), books);
        assertGe(usdt.balanceOf(address(registry)), registry.totalOwed());
    }
}
