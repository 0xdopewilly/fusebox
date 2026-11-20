// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {FuseRegistry} from "../src/FuseRegistry.sol";
import {FuseboxFactory} from "../src/FuseboxFactory.sol";
import {ITapeoutBeacon, ITapeoutFactory, ITapeoutProcessor, ITapeoutTransistors} from "../src/interfaces/ITapeout.sol";
import {FuseFixtures} from "../test/fixtures/FuseFixtures.sol";
import {XLayer} from "./XLayer.sol";

/// @notice Fusebox v2 on X Layer: a registry whose socket pinouts are data (so new fuse types never need
///         another registry), a factory whose wallets drive the Repeat Guard (socket 5), the four v1 circuits
///         (#15-#18) re-listed with their v1 fees and metadata, and the Repeat Guard taped out and listed.
///         v1 (registry 0x852a…20d7, factory 0x192C…E3E7a5, Atlas) is untouched and keeps working.
///
///         The broadcaster must own circuits #15-#18 (the v1 deployer does). Costs: 2 NAND transistors, one
///         mint fee, one tape-out fee, plus gas; the script prints the total and refuses if the balance is short.
///
///         Rehearse on a fork first (no keys):
///           anvil --fork-url https://rpc.xlayer.tech --auto-impersonate --port 8547
///           forge script script/DeployV2.s.sol --rpc-url http://127.0.0.1:8547 --broadcast --unlocked \
///             --sender 0x1e91db86a9e468A4D98b24034b2c74E68705379d
///         The mainnet broadcast is a separate step that needs the owner's go.
///
///         Env: REPEAT_FEE (USDT0 base units per decision, default 500 = 0.0005), PROTOCOL_FEE_BPS (default 1000).
contract DeployV2 is Script {
    FuseRegistry internal constant V1 = FuseRegistry(0x852a278322667BB86A2665a38CbC5Bfd551B20d7);
    uint256 internal constant FIRST_V1_CIRCUIT = 15;

    function run() external returns (FuseRegistry registry, FuseboxFactory factory, uint256 repeatCircuit) {
        require(block.chainid == XLayer.CHAIN_ID, "not X Layer");
        require(XLayer.ORDERGUARD_PROCESSOR.codehash == XLayer.PROCESSOR_CODEHASH, "processor code changed");
        require(ITapeoutBeacon(XLayer.TAPEOUT_BEACON).implementation() == XLayer.TAPEOUT_CIRCUIT_IMPL, "impl changed");
        require(ITapeoutFactory(XLayer.TAPEOUT_FACTORY).isCPU(XLayer.ORDERGUARD_PROCESSOR), "not a CPU");
        ITapeoutProcessor processor = ITapeoutProcessor(XLayer.ORDERGUARD_PROCESSOR);
        for (uint256 c = FIRST_V1_CIRCUIT; c < FIRST_V1_CIRCUIT + 4; ++c) {
            require(processor.ownerOf(c) == msg.sender, "broadcaster must own circuits 15-18");
        }

        FuseFixtures.Fixture memory rg = FuseFixtures.fixture(FuseFixtures.REPEAT_GUARD);
        ITapeoutTransistors t = ITapeoutTransistors(processor.transistors());
        uint256 held = t.balanceOf(msg.sender, 0);
        uint256 needNand = rg.nand > held ? rg.nand - held : 0;
        uint256 mintCost = needNand > 0 ? t.mintPrice() * needNand + t.protocolFee() : 0;
        uint256 tapeFee = processor.TAPEOUT_FEE();
        console.log("OKB fees before gas (wei):", mintCost + tapeFee);
        require(msg.sender.balance > mintCost + tapeFee, "not enough OKB for the fees");
        uint256 startBalance = msg.sender.balance;

        uint16 bps = uint16(vm.envOr("PROTOCOL_FEE_BPS", uint256(1_000)));
        // forge-lint: disable-next-line(unsafe-typecast)
        uint96 repeatFee = uint96(vm.envOr("REPEAT_FEE", uint256(500))); // a few hundred base units

        vm.startBroadcast();
        registry = new FuseRegistry(IERC20(XLayer.USDT0), ITapeoutFactory(XLayer.TAPEOUT_FACTORY), msg.sender, bps);
        registry.setProcessorCodehash(XLayer.PROCESSOR_CODEHASH, XLayer.TAPEOUT_BEACON);
        registry.setTrustedImplementation(XLayer.TAPEOUT_CIRCUIT_IMPL, true);
        factory = new FuseboxFactory(registry);

        // the four v1 circuits, same order, fees and metadata, so v2 fuse ids 1-4 match v1's
        for (uint256 i; i < 4; ++i) {
            FuseRegistry.Fuse memory f = V1.fuse(i + 1);
            require(f.circuitId == FIRST_V1_CIRCUIT + i, "v1 fuse order");
            registry.list(f.processor, f.circuitId, f.socket, f.netlistHash, f.fee, V1.metadataURI(i + 1));
        }

        if (needNand > 0) t.mint{value: mintCost}(0, needNand);
        repeatCircuit = processor.tapeout{value: tapeFee}(rg.netlist, rg.nIn, rg.nOut);
        uint256 repeatFuse =
            registry.list(address(processor), repeatCircuit, rg.socket, rg.netlistHash, repeatFee, repeatMetadata());
        vm.stopBroadcast();

        require(repeatFuse == 5, "repeat guard should be fuse 5");
        console.log("FuseRegistry v2", address(registry));
        console.log("FuseboxFactory v2", address(factory));
        console.log("Repeat Guard circuit id", repeatCircuit);
        console.log("OKB fees paid in the run (wei, gas not included):", startBalance - msg.sender.balance);
    }

    function repeatMetadata() internal pure returns (string memory) {
        bytes memory json = abi.encodePacked(
            '{"schema":"fusebox-fuse/1","name":"Repeat Guard","summary":"The same invoice sent twice gets paid once.",',
            '"description":"The wallet remembers when each exact payment (token, payee and amount) last went out. ',
            "A second one inside the owner's window is refused, so a resent invoice, a replayed request or an agent ",
            "stuck in a loop can't pay twice. A real repeat goes through once the owner clears it, and the clearance ",
            'is used up by that one payment. Two NAND gates; stateless: the wallet supplies the two bits.",',
            '"rule":"allow iff not repeat or cleared","designer":"Fusebox",',
            '"source":"https://github.com/0xdopewilly/fusebox/blob/main/circuits/src/fuses.ts",',
            '"external_url":"https://fusebox-xlayer.vercel.app/app/fuse/5"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }
}
