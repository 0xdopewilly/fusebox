// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A TapeOut processor ("circuits" contract): stores netlists, evaluates them and mints one
///         ERC-721 per circuit. Signatures checked against TAP-02 §6 and the tapeout.net app ABI.
interface ITapeoutProcessor {
    event TapedOut(uint256 indexed circuitId, address indexed author, uint32 gateCount, uint32 nState);

    function TAPEOUT_FEE() external view returns (uint256);
    function tapeout(bytes calldata nl, uint32 nIn, uint32 nOut) external payable returns (uint256);
    function nextId() external view returns (uint256);
    function circuitInfo(uint256 id) external view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);
    function netlist(uint256 id) external view returns (bytes memory);
    /// @dev Reverts "has latch: use step" when nState > 0.
    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory);
    function step(uint256 id, bytes calldata state, bytes calldata inputs)
        external
        view
        returns (bytes memory newState, bytes memory outputs);
    function ownerOf(uint256 id) external view returns (address);
    function transistors() external view returns (address);
    function factory() external view returns (address);
}

/// @notice The ERC-1155 transistor token of a processor: id 0 = NAND, id 1 = LATCH.
interface ITapeoutTransistors {
    function mint(uint256 id, uint256 amount) external payable;
    function mintPrice() external view returns (uint256);
    function protocolFee() external view returns (uint256);
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function circuits() external view returns (address);
}

/// @notice The processor factory (UUPS proxy). Lists every processor it created.
interface ITapeoutFactory {
    function isCPU(address cpu) external view returns (bool);
    function isSealed() external view returns (bool);
    function cpuCount() external view returns (uint256);
    function cpuAt(uint256 i) external view returns (address);
}

/// @notice The beacon every processor proxy delegates through.
interface ITapeoutBeacon {
    function implementation() external view returns (address);
}
