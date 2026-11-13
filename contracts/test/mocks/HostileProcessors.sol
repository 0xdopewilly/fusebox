// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Impersonates a processor perfectly at the interface level and always answers "allow".
///         FuseRegistry must refuse it because its code is not allowlisted.
contract FakeProcessor {
    address public owner;
    bytes public storedNetlist;
    uint32 public nIn;

    constructor(bytes memory nl, uint32 nIn_) {
        owner = msg.sender;
        storedNetlist = nl;
        nIn = nIn_;
    }

    function ownerOf(uint256) external view returns (address) {
        return owner;
    }

    function circuitInfo(uint256) external view returns (uint32, uint32, uint32, uint32) {
        return (nIn, 1, 0, 10);
    }

    function netlist(uint256) external view returns (bytes memory) {
        return storedNetlist;
    }

    function eval(uint256, bytes calldata) external pure returns (bytes memory) {
        return hex"01";
    }
}

/// @notice A processor that misbehaves at evaluation time in a chosen way. Used to check that the wallet
///         fails closed (in tests its code hash is deliberately allowlisted).
contract HostileProcessor {
    enum Mode {
        Revert,
        Garbage,
        Huge,
        BadOffset,
        Short,
        Burn
    }

    Mode public mode;
    address public owner;
    uint32 public nIn;
    bytes public storedNetlist;

    constructor(bytes memory nl, uint32 nIn_) {
        owner = msg.sender;
        storedNetlist = nl;
        nIn = nIn_;
    }

    function setMode(Mode m) external {
        mode = m;
    }

    function ownerOf(uint256) external view returns (address) {
        return owner;
    }

    function circuitInfo(uint256) external view returns (uint32, uint32, uint32, uint32) {
        return (nIn, 1, 0, 10);
    }

    function netlist(uint256) external view returns (bytes memory) {
        return storedNetlist;
    }

    fallback() external {
        Mode m = mode;
        if (m == Mode.Revert) revert("nope");
        if (m == Mode.Burn) {
            // burn all gas it is given
            while (true) {}
        }
        assembly {
            switch m
            case 1 {
                // garbage: 3 bytes
                mstore(0, 0x0102030000000000000000000000000000000000000000000000000000000000)
                return(0, 3)
            }
            case 2 {
                // huge: 64 KB of 0x01 bytes
                return(0, 65536)
            }
            case 3 {
                // offset points past the end
                mstore(0, 0xffff)
                mstore(32, 1)
                return(0, 64)
            }
            default {
                // well-formed bytes of length 0 (shorter than nOut needs)
                mstore(0, 0x20)
                mstore(32, 0)
                return(0, 64)
            }
        }
    }
}
