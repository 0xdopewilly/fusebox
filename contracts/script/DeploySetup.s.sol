// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

import {FuseboxFactory} from "../src/FuseboxFactory.sol";
import {FuseboxSetup} from "../src/FuseboxSetup.sol";

/// @notice Deploys FuseboxSetup (one-transaction wallet setup) for the v2 factory on X Layer mainnet.
///         forge script script/DeploySetup.s.sol --rpc-url https://rpc.xlayer.tech --broadcast
contract DeploySetup is Script {
    FuseboxFactory constant FACTORY_V2 = FuseboxFactory(0xdFc9b1d715efB2bCDAd8f848A5E3b4e2c243EE9B);

    function run() external returns (FuseboxSetup setup) {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        setup = new FuseboxSetup(FACTORY_V2);
        vm.stopBroadcast();
        console.log("FuseboxSetup", address(setup));
    }
}
