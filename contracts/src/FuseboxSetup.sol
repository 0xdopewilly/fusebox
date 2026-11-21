// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {FuseRegistry} from "./FuseRegistry.sol";
import {FuseboxFactory} from "./FuseboxFactory.sol";
import {FuseboxWallet} from "./FuseboxWallet.sol";
import {Sockets} from "./libraries/Sockets.sol";

/// @title FuseboxSetup
/// @notice Wires up a new Fusebox wallet in one transaction, instead of one transaction per step:
///         it creates the wallet through the factory, lets it pay in a token, splices in the fuses,
///         saves the payees, seats the approvers, prepays fees, funds the wallet and sends the agent
///         its gas. The caller's token allowance can come from an EIP-2612 permit signed off-chain.
/// @dev    This contract owns the new wallet only inside `setUpWallet`. Before returning it starts the
///         wallet's two-step ownership handover to the caller, who completes it with
///         `wallet.acceptOwnership()`; nobody else can. The helper holds no funds between calls, keeps
///         no state, and has no function that touches any wallet other than the one it just created.
contract FuseboxSetup {
    using SafeERC20 for IERC20;

    FuseboxFactory public immutable factory;
    FuseRegistry public immutable registry;

    /// @notice One fuse to splice in, exactly as `FuseboxWallet.addFuse` takes it.
    struct FuseInstall {
        uint256 fuseId;
        Sockets.Params params;
        uint96 maxFee;
    }

    /// @notice Everything the setup wizard collects.
    struct Setup {
        address[] agents; // agent keys allowed to call pay(); agents[0] receives any OKB sent along
        bytes32 salt; // mixed with the caller, so nobody can front-run the wallet's address
        address token; // the token the wallet pays in (zero: enable none)
        FuseInstall[] fuses;
        address[] payees;
        address[3] approvers; // all zero: leave the seats empty
        uint256 feeDeposit; // fee token base units, prepaid in the registry for the new wallet
        uint256 walletFloat; // `token` base units, moved from the caller into the new wallet
    }

    /// @notice An EIP-2612 permit for the registry's fee token, owner = caller, spender = this contract.
    ///         `deadline == 0` skips it and relies on an existing allowance.
    struct Permit {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    event WalletSetUp(
        address indexed wallet,
        address indexed owner,
        uint256 fuses,
        uint256 payees,
        uint256 feeDeposit,
        uint256 walletFloat,
        uint256 agentGas
    );

    error NoAgentForGas();
    error NoTokenForFloat();
    error GasSendFailed();

    constructor(FuseboxFactory factory_) {
        factory = factory_;
        registry = factory_.registry();
    }

    /// @notice Create and configure a wallet for the caller. The caller must then call
    ///         `acceptOwnership()` on the returned wallet to become its owner.
    /// @dev    Any OKB sent along goes to `s.agents[0]` as gas for its payments.
    function setUpWallet(Setup calldata s, Permit calldata p) external payable returns (FuseboxWallet w) {
        w = factory.createWallet(address(this), s.agents, keccak256(abi.encode(msg.sender, s.salt)));

        if (s.token != address(0)) w.setToken(s.token, true);
        for (uint256 i; i < s.fuses.length; ++i) {
            w.addFuse(s.fuses[i].fuseId, s.fuses[i].params, s.fuses[i].maxFee);
        }
        for (uint256 i; i < s.payees.length; ++i) {
            w.addPayee(s.payees[i]);
        }
        if (s.approvers[0] != address(0) || s.approvers[1] != address(0) || s.approvers[2] != address(0)) {
            w.setApprovers(s.approvers);
        }

        IERC20 feeToken = registry.feeToken();
        if (p.deadline != 0) {
            // a permit someone already submitted (front-run) leaves the allowance in place: carry on
            try IERC20Permit(address(feeToken)).permit(msg.sender, address(this), p.value, p.deadline, p.v, p.r, p.s) {}
                catch {}
        }
        if (s.feeDeposit != 0) {
            feeToken.safeTransferFrom(msg.sender, address(this), s.feeDeposit);
            feeToken.forceApprove(address(registry), s.feeDeposit);
            registry.deposit(address(w), s.feeDeposit);
        }
        if (s.walletFloat != 0) {
            if (s.token == address(0)) revert NoTokenForFloat();
            IERC20(s.token).safeTransferFrom(msg.sender, address(w), s.walletFloat);
        }

        w.transferOwnership(msg.sender);

        if (msg.value != 0) {
            if (s.agents.length == 0) revert NoAgentForGas();
            (bool ok,) = s.agents[0].call{value: msg.value}("");
            if (!ok) revert GasSendFailed();
        }

        emit WalletSetUp(
            address(w), msg.sender, s.fuses.length, s.payees.length, s.feeDeposit, s.walletFloat, msg.value
        );
    }
}
