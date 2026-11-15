// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Script, console} from "forge-std/Script.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";

/// @notice Dev only (local fork): prints the storage slot of balanceOf(who) for a token.
contract FindSlot is Script {
    using stdStorage for StdStorage;
    function run(address token, address who) external {
        uint256 slot = stdstore.target(token).sig("balanceOf(address)").with_key(who).find();
        console.logBytes32(bytes32(slot));
    }
}
