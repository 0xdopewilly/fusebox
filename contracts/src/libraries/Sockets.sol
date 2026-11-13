// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Sockets
/// @notice The pinouts a FuseboxWallet drives. A socket fixes what every input bit of a fuse means;
///         the circuit taped out for it decides the policy. Several designers can compete on one socket.
/// @dev Must match circuits/src/fuses.ts. Bits are packed least-significant first (TAP-02 §5):
///      input i is bit (i % 8) of byte (i / 8). Every socket has exactly one output: 1 = allow.
library Sockets {
    /// Daily cap. in[0..7] amount, in[8..15] spent today, in[16..23] cap. 24 inputs.
    uint32 internal constant DAILY_CAP = 1;
    /// Payee book with cooling-off. in[0] listed, in[1..8] age (hours), in[9..16] cooldown (hours),
    /// in[17..24] amount, in[25..32] trial allowance. 33 inputs.
    uint32 internal constant PAYEE_GUARD = 2;
    /// Freeze / breaker (sequential). in[0] set, in[1] clear, in[2] attempt, in[3] suspect. 4 inputs.
    uint32 internal constant BREAKER = 3;
    /// Human approvals. in[0..2] approver bits, in[3..10] amount, in[11..18] threshold. 19 inputs.
    uint32 internal constant APPROVAL_2OF3 = 4;

    /// @notice Largest value an 8-bit owner parameter (cap, trial, threshold) may take. 255 is reserved
    ///         for "saturated" amounts, so a saturated amount can never satisfy amount <= parameter.
    uint8 internal constant MAX_PARAM = 254;

    /// @notice Owner-chosen parameters of one installed fuse.
    /// @param token The token the amount pins measure (address(0) = native OKB). Payments in any other
    ///        token read amount = 255, which fails closed.
    /// @param unit Token base units per quantisation step (e.g. 1e6 = 1 USDT0).
    /// @param a DAILY_CAP: cap. PAYEE_GUARD: cooldown hours. APPROVAL_2OF3: threshold. BREAKER: unused.
    /// @param b PAYEE_GUARD: trial allowance. Others: unused.
    struct Params {
        address token;
        uint128 unit;
        uint8 a;
        uint8 b;
    }

    error UnknownSocket(uint32 socket);
    error BadParams(uint32 socket);

    /// @return nIn Input count of the socket.
    /// @return nOut Output count (always 1), or 0 if the socket does not exist.
    function pinout(uint32 socket) internal pure returns (uint32 nIn, uint32 nOut) {
        if (socket == DAILY_CAP) return (24, 1);
        if (socket == PAYEE_GUARD) return (33, 1);
        if (socket == BREAKER) return (4, 1);
        if (socket == APPROVAL_2OF3) return (19, 1);
        return (0, 0);
    }

    function exists(uint32 socket) internal pure returns (bool) {
        (, uint32 nOut) = pinout(socket);
        return nOut != 0;
    }

    /// @notice Sockets whose state the owner may drive with control beats.
    function hasOwnerPins(uint32 socket) internal pure returns (bool) {
        return socket == BREAKER;
    }

    function validate(uint32 socket, Params memory p) internal pure {
        if (!exists(socket)) revert UnknownSocket(socket);
        if (socket == BREAKER) {
            if (p.token != address(0) || p.unit != 0 || p.a != 0 || p.b != 0) revert BadParams(socket);
            return;
        }
        if (p.unit == 0 || p.b > MAX_PARAM) revert BadParams(socket);
        if (socket != PAYEE_GUARD && (p.a > MAX_PARAM || p.b != 0)) revert BadParams(socket);
    }

    /// @notice ceil(amount / unit), saturating at 255.
    function quantise(uint256 amount, uint256 unit) internal pure returns (uint8) {
        if (amount == 0) return 0;
        uint256 q = (amount - 1) / unit + 1;
        // forge-lint: disable-next-line(unsafe-typecast)
        return q > 255 ? 255 : uint8(q); // q <= 255 on this branch
    }

    /// @notice The amount pin: quantised amount for the install's token, 255 for any other token.
    function amountPin(Params memory p, address token, uint256 amount) internal pure returns (uint8) {
        return token == p.token ? quantise(amount, p.unit) : 255;
    }

    function dailyCapInputs(uint8 amount, uint8 spent, uint8 cap) internal pure returns (bytes memory) {
        return pack(uint256(amount) | (uint256(spent) << 8) | (uint256(cap) << 16), 24);
    }

    function payeeGuardInputs(bool listed, uint8 ageHours, uint8 cooldown, uint8 amount, uint8 trial)
        internal
        pure
        returns (bytes memory)
    {
        uint256 v = (listed ? 1 : 0) | (uint256(ageHours) << 1) | (uint256(cooldown) << 9) | (uint256(amount) << 17)
            | (uint256(trial) << 25);
        return pack(v, 33);
    }

    function breakerInputs(bool set, bool clear, bool attempt, bool suspect) internal pure returns (bytes memory) {
        uint256 v = (set ? 1 : 0) | (clear ? 2 : 0) | (attempt ? 4 : 0) | (suspect ? 8 : 0);
        return pack(v, 4);
    }

    function approvalInputs(uint8 approvalMask, uint8 amount, uint8 threshold) internal pure returns (bytes memory) {
        return pack(uint256(approvalMask & 7) | (uint256(amount) << 3) | (uint256(threshold) << 11), 19);
    }

    /// @notice The low `nBits` of `v` as ceil(nBits / 8) bytes, least-significant byte first.
    function pack(uint256 v, uint256 nBits) internal pure returns (bytes memory out) {
        uint256 n = (nBits + 7) / 8;
        out = new bytes(n);
        for (uint256 i; i < n; ++i) {
            // forge-lint: disable-next-line(unsafe-typecast)
            out[i] = bytes1(uint8(v >> (8 * i))); // keep the low byte on purpose
        }
        if (nBits % 8 != 0) out[n - 1] = bytes1(uint8(out[n - 1]) & uint8((1 << (nBits % 8)) - 1));
    }

    /// @notice True when the first nOut bits of `out` are all 1.
    function allOnes(bytes memory out, uint256 nOut) internal pure returns (bool) {
        if (out.length * 8 < nOut || nOut == 0) return false;
        for (uint256 i; i < nOut; ++i) {
            if ((uint8(out[i / 8]) >> (i % 8)) & 1 == 0) return false;
        }
        return true;
    }
}
