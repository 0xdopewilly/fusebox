// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The DeWEB hub's send: a message from the container of (circuits, tokenId), whose holder must be the caller.
interface ITapeSendHub {
    function send(address circuits, uint256 tokenId, bytes32 to, bytes32 ref, bytes calldata payload)
        external
        returns (uint256 inboxIndex);
}

/// @title FuseboxHerald
/// @notice Holds Fusebox's TapeOut circuit (#15, whose container is open) so a hot "crier" key can post fuse alerts
///         over TapeSend as that circuit, while the circuit itself stays out of the crier's reach.
///
///         TapeSend only lets the circuit's holder send (`ownerOf == msg.sender`). Keeping the holder key on a server
///         would put the circuit, its designer fees and its DeWEB site one leaked key away. Here the server holds only
///         the crier key: it can call `post` and nothing else, so a leak costs spam, and the admin swaps the crier.
///         The admin (a cold key) does everything a holder does through `execute`: claim the fuse's designer fees,
///         update the DeWEB site, or move the circuit out again.
contract FuseboxHerald {
    ITapeSendHub public immutable hub;
    /// @notice TapeOut processor (the circuits' ERC-721) and the circuit id this contract holds
    address public immutable circuits;
    uint256 public immutable tokenId;

    address public admin;
    address public pendingAdmin;
    address public crier;

    event CrierSet(address indexed crier);
    event AdminTransferStarted(address indexed pendingAdmin);
    event AdminTransferred(address indexed admin);
    event Executed(address indexed target, uint256 value, bytes data);

    error NotAdmin();
    error NotCrier();
    error NotPendingAdmin();
    error ZeroAddress();
    error LengthMismatch();
    error CallFailed(bytes reason);

    constructor(ITapeSendHub hub_, address circuits_, uint256 tokenId_, address admin_, address crier_) {
        if (address(hub_) == address(0) || circuits_ == address(0) || admin_ == address(0) || crier_ == address(0)) {
            revert ZeroAddress();
        }
        hub = hub_;
        circuits = circuits_;
        tokenId = tokenId_;
        admin = admin_;
        crier = crier_;
        emit AdminTransferred(admin_);
        emit CrierSet(crier_);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyCrier() {
        if (msg.sender != crier) revert NotCrier();
        _;
    }

    // ---- crier: alerts ------------------------------------------------------------------------------------------

    /// @notice Post one message to a TapeSend endpoint (uint32(0) ‖ uint64(chainId) ‖ address) as the held circuit.
    function post(bytes32 to, bytes32 ref, bytes calldata payload) external onlyCrier returns (uint256 inboxIndex) {
        return hub.send(circuits, tokenId, to, ref, payload);
    }

    /// @notice Several messages in one transaction (a sweep that found more than one stop).
    function postMany(bytes32[] calldata to, bytes[] calldata payloads) external onlyCrier {
        if (to.length != payloads.length) revert LengthMismatch();
        for (uint256 i; i < to.length; ++i) {
            hub.send(circuits, tokenId, to[i], bytes32(0), payloads[i]);
        }
    }

    // ---- admin ----------------------------------------------------------------------------------------------------

    function setCrier(address crier_) external onlyAdmin {
        if (crier_ == address(0)) revert ZeroAddress();
        crier = crier_;
        emit CrierSet(crier_);
    }

    function transferAdmin(address next) external onlyAdmin {
        pendingAdmin = next;
        emit AdminTransferStarted(next);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotPendingAdmin();
        admin = msg.sender;
        pendingAdmin = address(0);
        emit AdminTransferred(msg.sender);
    }

    /// @notice Anything the circuit's holder can do: claim designer fees, write the DeWEB site, move the circuit.
    function execute(address target, uint256 value, bytes calldata data)
        external
        payable
        onlyAdmin
        returns (bytes memory result)
    {
        bool ok;
        (ok, result) = target.call{value: value}(data);
        if (!ok) revert CallFailed(result);
        emit Executed(target, value, data);
    }

    /// @notice Accepts the circuit (and anything else sent with safeTransferFrom).
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {}
}
