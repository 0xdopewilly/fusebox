// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice X Layer mainnet (chain 196) addresses, read from the chain on 2026-11-13.
///         Scripts re-check every value before using it.
library XLayer {
    uint256 internal constant CHAIN_ID = 196;
    /// TapeOut processor factory (UUPS proxy; not sealed as of 2026-11-13)
    address internal constant TAPEOUT_FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;
    /// beacon behind every processor proxy
    address internal constant TAPEOUT_BEACON = 0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C;
    /// circuit implementation the beacon pointed at on 2026-11-13 (same as TAP-10 lists)
    address internal constant TAPEOUT_CIRCUIT_IMPL = 0x977f217887E085D298Cb3819cDAD5A0ee35F29B2;
    /// runtime code hash shared by every processor proxy (TAP-10 Deployments)
    bytes32 internal constant PROCESSOR_CODEHASH = 0x57aa306fd0be97087da3534e03398f5ff4efd533b5be4e45a405ce86fa6717d5;
    /// "OrderGuard" (OGD): an existing processor whose transistors are priced in OKB
    address internal constant ORDERGUARD_PROCESSOR = 0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355;
    /// USD₮0, 6 decimals
    address internal constant USDT0 = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
}
