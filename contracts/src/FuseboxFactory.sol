// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FuseRegistry} from "./FuseRegistry.sol";
import {FuseboxWallet} from "./FuseboxWallet.sol";

/// @title FuseboxFactory
/// @notice Deploys FuseboxWallets bound to one registry and remembers them, so indexers and the UI can
///         tell a genuine Fusebox wallet (and its Decision events) from a look-alike.
contract FuseboxFactory {
    FuseRegistry public immutable registry;
    mapping(address => bool) public isWallet;
    address[] internal _wallets;

    event WalletCreated(address indexed wallet, address indexed owner, address indexed creator, address[] agents);

    constructor(FuseRegistry registry_) {
        registry = registry_;
    }

    /// @param salt Combined with the caller, so nobody can take another creator's address.
    function createWallet(address owner, address[] calldata agents, bytes32 salt) external returns (FuseboxWallet w) {
        w = new FuseboxWallet{salt: keccak256(abi.encode(msg.sender, salt))}(registry, owner, agents);
        isWallet[address(w)] = true;
        _wallets.push(address(w));
        emit WalletCreated(address(w), owner, msg.sender, agents);
    }

    function walletCount() external view returns (uint256) {
        return _wallets.length;
    }

    function walletAt(uint256 i) external view returns (address) {
        return _wallets[i];
    }
}
