// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {FuseboxHerald, ITapeSendHub} from "../../src/FuseboxHerald.sol";
import {FuseRegistry} from "../../src/FuseRegistry.sol";

interface IHubRead {
    function inboxCount(bytes32 to) external view returns (uint256);
    function outboxCount(address from) external view returns (uint256);
    function accountOf(address circuits, uint256 tokenId) external view returns (address);
    function digestOf(bytes32 ref, bytes calldata payload) external pure returns (bytes32);
}

interface ISiteRegistry {
    function setOperator(address container, address op, uint256 ttl) external;
}

/// @notice FuseboxHerald against the live TapeSend hub, TapeOut processor and v2 registry on an X Layer fork:
///         the herald holds circuit #15, the crier posts as #15's container, and only the admin can act as holder.
///         forge test --fork-url https://rpc.xlayer.tech --match-path test/fork/HeraldFork.t.sol
contract HeraldForkTest is Test {
    address constant HUB = 0xe61A9C7213a6Aa616C246a2B569e555B417b25ee;
    address constant ORDERGUARD = 0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355;
    address constant DEPLOYER = 0x1e91db86a9e468A4D98b24034b2c74E68705379d;
    address constant CONTAINER = 0x7af0647557909b07E0D92C4a8F63396120F8BDB3; // circuit #15's, opened for DeWEB
    address constant SITE_REGISTRY = 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6;
    FuseRegistry constant REGISTRY = FuseRegistry(0x2583928546a614A2fD993B5C106ED9aD0E781AB6);
    address constant USDT0 = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    address constant TWIN = 0x6292Ea57a1d50c74A5E918CfDC4Dc1Dbf87a577c; // a v2 Fusebox wallet

    FuseboxHerald herald;
    address crier = makeAddr("crier");

    event Sent(
        bytes32 indexed to, address indexed from, bytes32 indexed ref, uint256 inboxIndex, uint256 outboxIndex, bytes payload
    );

    function setUp() public {
        if (block.chainid != 196) {
            vm.skip(true);
            return;
        }
        herald = new FuseboxHerald(ITapeSendHub(HUB), ORDERGUARD, 15, DEPLOYER, crier);
        assertEq(IHubRead(HUB).accountOf(ORDERGUARD, 15), CONTAINER);
        vm.prank(DEPLOYER);
        IERC721(ORDERGUARD).safeTransferFrom(DEPLOYER, address(herald), 15);
        assertEq(IERC721(ORDERGUARD).ownerOf(15), address(herald));
    }

    function _endpoint(address a) internal pure returns (bytes32) {
        return bytes32((uint256(196) << 160) | uint256(uint160(a)));
    }

    function test_crierPostsAsCircuit15() public {
        bytes32 to = _endpoint(TWIN);
        bytes memory payload = abi.encodePacked(
            hex"54530200", '{"v":1,"kind":"message","subject":"Payment stopped","body":"Breaker said no."}'
        );
        uint256 inBefore = IHubRead(HUB).inboxCount(to);
        uint256 outBefore = IHubRead(HUB).outboxCount(CONTAINER);
        vm.expectEmit(true, true, true, true, HUB);
        emit Sent(to, CONTAINER, bytes32(0), inBefore, outBefore, payload);
        vm.prank(crier);
        uint256 idx = herald.post(to, bytes32(0), payload);
        assertEq(idx, inBefore);
        assertEq(IHubRead(HUB).inboxCount(to), inBefore + 1);
        assertEq(IHubRead(HUB).outboxCount(CONTAINER), outBefore + 1);
    }

    function test_crierPostsMany() public {
        bytes32[] memory to = new bytes32[](2);
        bytes[] memory p = new bytes[](2);
        to[0] = _endpoint(TWIN);
        to[1] = _endpoint(address(0xBEEF));
        p[0] = "one";
        p[1] = "two";
        uint256 outBefore = IHubRead(HUB).outboxCount(CONTAINER);
        vm.prank(crier);
        herald.postMany(to, p);
        assertEq(IHubRead(HUB).outboxCount(CONTAINER), outBefore + 2);
    }

    function test_onlyCrierPosts() public {
        vm.expectRevert(FuseboxHerald.NotCrier.selector);
        herald.post(_endpoint(TWIN), bytes32(0), "spam");
        vm.prank(DEPLOYER); // even the admin posts only by naming itself crier
        vm.expectRevert(FuseboxHerald.NotCrier.selector);
        herald.post(_endpoint(TWIN), bytes32(0), "spam");
    }

    function test_oldHolderCanNoLongerSendDirectly() public {
        vm.prank(DEPLOYER);
        vm.expectRevert(); // NotHolder
        ITapeSendHub(HUB).send(ORDERGUARD, 15, _endpoint(TWIN), bytes32(0), "x");
    }

    function test_crierCannotActAsHolder() public {
        vm.startPrank(crier);
        vm.expectRevert(FuseboxHerald.NotAdmin.selector);
        herald.execute(ORDERGUARD, 0, abi.encodeCall(IERC721.transferFrom, (address(herald), crier, 15)));
        vm.expectRevert(FuseboxHerald.NotAdmin.selector);
        herald.execute(address(REGISTRY), 0, abi.encodeCall(FuseRegistry.claim, (1, crier)));
        vm.expectRevert(FuseboxHerald.NotAdmin.selector);
        herald.setCrier(crier);
        vm.stopPrank();
        assertEq(IERC721(ORDERGUARD).ownerOf(15), address(herald));
    }

    function test_adminClaimsFuse1Fees() public {
        uint256 owed = REGISTRY.earned(1);
        uint256 before = IERC20(USDT0).balanceOf(DEPLOYER);
        vm.prank(DEPLOYER);
        herald.execute(address(REGISTRY), 0, abi.encodeCall(FuseRegistry.claim, (1, DEPLOYER)));
        assertEq(IERC20(USDT0).balanceOf(DEPLOYER), before + owed);
        assertEq(REGISTRY.earned(1), 0);
        assertEq(REGISTRY.designerOf(1), address(herald));
    }

    function test_adminRunsTheDeWebSite() public {
        vm.prank(DEPLOYER);
        herald.execute(SITE_REGISTRY, 0, abi.encodeCall(ISiteRegistry.setOperator, (CONTAINER, DEPLOYER, 1 days)));
    }

    function test_adminTakesTheCircuitBack() public {
        vm.prank(DEPLOYER);
        herald.execute(ORDERGUARD, 0, abi.encodeCall(IERC721.transferFrom, (address(herald), DEPLOYER, 15)));
        assertEq(IERC721(ORDERGUARD).ownerOf(15), DEPLOYER);
        vm.prank(crier);
        vm.expectRevert(); // the hub: herald no longer holds #15
        herald.post(_endpoint(TWIN), bytes32(0), "x");
    }

    function test_crierRotationAndAdminHandover() public {
        address next = makeAddr("nextCrier");
        vm.prank(DEPLOYER);
        herald.setCrier(next);
        vm.prank(crier);
        vm.expectRevert(FuseboxHerald.NotCrier.selector);
        herald.post(_endpoint(TWIN), bytes32(0), "x");
        vm.prank(next);
        herald.post(_endpoint(TWIN), bytes32(0), "x");

        address safe = makeAddr("safe");
        vm.prank(DEPLOYER);
        herald.transferAdmin(safe);
        assertEq(herald.admin(), DEPLOYER);
        vm.prank(DEPLOYER);
        vm.expectRevert(FuseboxHerald.NotPendingAdmin.selector);
        herald.acceptAdmin();
        vm.prank(safe);
        herald.acceptAdmin();
        assertEq(herald.admin(), safe);
        vm.prank(DEPLOYER);
        vm.expectRevert(FuseboxHerald.NotAdmin.selector);
        herald.setCrier(DEPLOYER);
    }

    function test_mismatchedBatchReverts() public {
        vm.prank(crier);
        vm.expectRevert(FuseboxHerald.LengthMismatch.selector);
        herald.postMany(new bytes32[](1), new bytes[](2));
    }
}
