// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ITapeoutBeacon, ITapeoutFactory, ITapeoutProcessor} from "./interfaces/ITapeout.sol";
import {Sockets} from "./libraries/Sockets.sol";

/// @title FuseRegistry
/// @notice The Fusebox marketplace and fee ledger.
///
///         Designers list TapeOut circuits as *fuses*: a pinned (processor, circuit id, netlist hash),
///         the socket it plugs into and a per-decision fee in USDT0. Wallets prepay a fee balance here;
///         every decision a fuse makes moves its fee from the wallet's balance to the fuse. Whoever
///         holds the circuit NFT (`ownerOf`) claims, so selling the NFT sells the income stream.
///
/// @dev Trust model:
///      - A processor is accepted only if its runtime code hash is allowlisted (all TapeOut processors are
///        identical beacon proxies, and the beacon address is part of that code), the factory lists it,
///        and the beacon currently points at an attested implementation. If TapeOut upgrades the
///        implementation, every fuse on it fails closed until the new implementation is attested.
///      - Listing reads circuitInfo and the netlist from the processor itself: the pinout must match the
///        socket, the gate count is bounded, and keccak256(netlist) must equal the hash the designer signed.
///      - Fee accounting never transfers tokens during a decision; `charge` only moves internal balances.
contract FuseRegistry is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Upper bound on gates per fuse, so one decision has a bounded gas cost.
    uint32 public constant MAX_GATES = 512;
    /// @notice Upper bound on LATCH state bits per fuse.
    uint32 public constant MAX_STATE_BITS = 64;
    /// @notice The protocol's share of each fee can never exceed 20%.
    uint16 public constant MAX_PROTOCOL_FEE_BPS = 2_000;

    struct Fuse {
        address processor;
        uint64 circuitId;
        uint32 socket;
        uint32 nIn;
        uint32 nOut;
        uint32 nState;
        uint32 gateCount;
        uint96 fee;
        bool listed;
        uint64 listedAt;
        bytes32 netlistHash;
    }

    /// @notice USDT0 on X Layer (6 decimals).
    IERC20 public immutable feeToken;
    /// @notice The TapeOut processor factory.
    ITapeoutFactory public immutable factory;

    uint256 public fuseCount;
    mapping(uint256 fuseId => Fuse) internal _fuses;
    mapping(uint256 fuseId => string) public metadataURI;
    mapping(address processor => mapping(uint256 circuitId => uint256 fuseId)) public fuseIdOf;
    /// @notice The first fuse listed with a given netlist: lets the marketplace mark copies of a design.
    mapping(bytes32 netlistHash => uint256 fuseId) public originalOf;

    /// @notice Allowlisted processor proxy code hash => the beacon that code delegates through.
    mapping(bytes32 codehash => address beacon) public beaconOfCodehash;
    /// @notice Processor implementations that have been reviewed and attested.
    mapping(address implementation => bool) public trustedImplementation;

    /// @notice Prepaid fee balance of each paying account (FuseboxWallets, or any contract).
    mapping(address account => uint256) public feeBalance;
    /// @notice Unclaimed designer earnings of each fuse; claimable by the circuit NFT's current owner.
    mapping(uint256 fuseId => uint256) public earned;
    mapping(uint256 fuseId => uint256) public lifetimeEarned;
    mapping(uint256 fuseId => uint64) public decisions;

    uint16 public protocolFeeBps;
    uint256 public protocolEarned;
    /// @notice Sum of everything owed: fee balances + unclaimed earnings + protocol earnings.
    uint256 public totalOwed;

    event FuseListed(
        uint256 indexed fuseId,
        address indexed processor,
        uint256 indexed circuitId,
        address designer,
        uint32 socket,
        uint32 gateCount,
        uint32 nState,
        uint96 fee,
        bytes32 netlistHash,
        string metadataURI
    );
    event FeeChanged(uint256 indexed fuseId, uint96 oldFee, uint96 newFee);
    event ListingChanged(uint256 indexed fuseId, bool listed);
    event MetadataChanged(uint256 indexed fuseId, string metadataURI);
    event Deposited(address indexed account, address indexed from, uint256 amount);
    event Withdrawn(address indexed account, address indexed to, uint256 amount);
    event Charged(address indexed payer, uint256 indexed fuseId, uint256 fee, uint256 designerShare);
    event Claimed(uint256 indexed fuseId, address indexed owner, address to, uint256 amount);
    event ProtocolClaimed(address indexed to, uint256 amount);
    event ProcessorCodehashSet(bytes32 indexed codehash, address beacon);
    event ImplementationTrusted(address indexed implementation, bool trusted);
    event ProtocolFeeSet(uint16 bps);

    error UntrustedProcessor(address processor);
    error NotCircuitOwner(address caller, address owner);
    error AlreadyListed(uint256 fuseId);
    error PinoutMismatch(uint32 socket, uint32 nIn, uint32 nOut);
    error TooManyGates(uint32 gateCount);
    error TooMuchState(uint32 nState);
    error NetlistHashMismatch(bytes32 expected, bytes32 actual);
    error StateMismatch(uint32 socket, uint32 nState);
    error RefNotAllowed(uint256 byteOffset);
    error MalformedNetlist(uint256 byteOffset);
    error BadCircuitId();
    error UnknownFuse(uint256 fuseId);
    error LengthMismatch();
    error InsufficientFeeBalance(uint256 balance, uint256 needed);
    error ZeroAddress();
    error FeeTooHigh();

    constructor(IERC20 feeToken_, ITapeoutFactory factory_, address admin, uint16 protocolFeeBps_) Ownable(admin) {
        if (address(feeToken_) == address(0) || address(factory_) == address(0)) revert ZeroAddress();
        if (protocolFeeBps_ > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        feeToken = feeToken_;
        factory = factory_;
        protocolFeeBps = protocolFeeBps_;
        emit ProtocolFeeSet(protocolFeeBps_);
    }

    // ---------------------------------------------------------------------------------------------
    // Listing (designers)
    // ---------------------------------------------------------------------------------------------

    /// @notice List a taped-out circuit as a fuse. Only the circuit NFT's owner may list it, once.
    /// @param processor The TapeOut processor holding the circuit.
    /// @param circuitId The circuit id on that processor.
    /// @param socket The socket (pinout) the circuit implements; see {Sockets}.
    /// @param netlistHash keccak256 of the netlist bytes; re-checked against the chain here.
    /// @param fee USDT0 (6 decimals) charged per decision.
    /// @param uri Off-chain metadata: title, description, source, proofs.
    function list(address processor, uint256 circuitId, uint32 socket, bytes32 netlistHash, uint96 fee, string calldata uri)
        external
        returns (uint256 fuseId)
    {
        if (circuitId == 0 || circuitId > type(uint64).max) revert BadCircuitId();
        if (!isTrustedProcessor(processor) || !factory.isCPU(processor)) revert UntrustedProcessor(processor);
        address circuitOwner = ITapeoutProcessor(processor).ownerOf(circuitId);
        if (circuitOwner != msg.sender) revert NotCircuitOwner(msg.sender, circuitOwner);
        uint256 existing = fuseIdOf[processor][circuitId];
        if (existing != 0) revert AlreadyListed(existing);

        (uint32 sIn, uint32 sOut) = Sockets.pinout(socket);
        if (sOut == 0) revert Sockets.UnknownSocket(socket);
        (uint32 nIn, uint32 nOut, uint32 nState, uint32 gates) = ITapeoutProcessor(processor).circuitInfo(circuitId);
        if (nIn != sIn || nOut != sOut) revert PinoutMismatch(socket, nIn, nOut);
        if (gates == 0 || gates > MAX_GATES) revert TooManyGates(gates);
        if (nState > MAX_STATE_BITS) revert TooMuchState(nState);
        if (Sockets.sequential(socket) ? nState == 0 : nState != 0) revert StateMismatch(socket, nState);
        bytes memory nl = ITapeoutProcessor(processor).netlist(circuitId);
        bytes32 actual = keccak256(nl);
        if (actual != netlistHash) revert NetlistHashMismatch(netlistHash, actual);
        _requireSelfContained(nl);

        fuseId = ++fuseCount;
        _fuses[fuseId] = Fuse({
            processor: processor,
            // forge-lint: disable-next-line(unsafe-typecast)
            circuitId: uint64(circuitId), // checked <= type(uint64).max above
            socket: socket,
            nIn: nIn,
            nOut: nOut,
            nState: nState,
            gateCount: gates,
            fee: fee,
            listed: true,
            listedAt: uint64(block.timestamp),
            netlistHash: netlistHash
        });
        fuseIdOf[processor][circuitId] = fuseId;
        if (originalOf[netlistHash] == 0) originalOf[netlistHash] = fuseId;
        metadataURI[fuseId] = uri;
        emit FuseListed(fuseId, processor, circuitId, msg.sender, socket, gates, nState, fee, netlistHash, uri);
    }

    /// @notice Change the per-decision fee. Payers pass the highest fee they accepted and are charged
    ///         min(fee, accepted): a decrease applies at once, an increase only once a payer accepts it,
    ///         and a price change can never block anyone's payments.
    function setFee(uint256 fuseId, uint96 fee) external {
        Fuse storage f = _ownedFuse(fuseId);
        emit FeeChanged(fuseId, f.fee, fee);
        f.fee = fee;
    }

    /// @notice Delist (or relist). Delisting stops new installs; existing installs keep working and paying.
    function setListed(uint256 fuseId, bool listed_) external {
        _ownedFuse(fuseId).listed = listed_;
        emit ListingChanged(fuseId, listed_);
    }

    function setMetadataURI(uint256 fuseId, string calldata uri) external {
        _ownedFuse(fuseId);
        metadataURI[fuseId] = uri;
        emit MetadataChanged(fuseId, uri);
    }

    /// @notice Pay out a fuse's unclaimed earnings to the circuit NFT's current owner (the caller).
    function claim(uint256 fuseId, address to) external nonReentrant returns (uint256 amount) {
        _ownedFuse(fuseId);
        if (to == address(0)) revert ZeroAddress();
        amount = earned[fuseId];
        if (amount == 0) return 0;
        earned[fuseId] = 0;
        totalOwed -= amount;
        feeToken.safeTransfer(to, amount);
        emit Claimed(fuseId, msg.sender, to, amount);
    }

    // ---------------------------------------------------------------------------------------------
    // Fee balances (wallets)
    // ---------------------------------------------------------------------------------------------

    /// @notice Top up `account`'s fee balance with USDT0 from the caller. Anyone may top up anyone.
    function deposit(address account, uint256 amount) external nonReentrant returns (uint256 received) {
        if (account == address(0)) revert ZeroAddress();
        uint256 before = feeToken.balanceOf(address(this));
        feeToken.safeTransferFrom(msg.sender, address(this), amount);
        received = feeToken.balanceOf(address(this)) - before;
        feeBalance[account] += received;
        totalOwed += received;
        emit Deposited(account, msg.sender, received);
    }

    /// @notice Withdraw from the caller's own fee balance.
    function withdraw(uint256 amount, address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = feeBalance[msg.sender];
        if (bal < amount) revert InsufficientFeeBalance(bal, amount);
        feeBalance[msg.sender] = bal - amount;
        totalOwed -= amount;
        feeToken.safeTransfer(to, amount);
        emit Withdrawn(msg.sender, to, amount);
    }

    /// @notice Pay for one decision of each fuse in `fuseIds`, from the caller's fee balance.
    /// @dev Moves internal balances only (no token transfer, no external call). Any caller can only spend
    ///      its own balance, so the registry does not need to trust wallets. Because anyone can call it,
    ///      `decisions` and `lifetimeEarned` are not proof of real usage; rank fuses by distinct paying wallets.
    /// @param maxFees The highest fee the caller accepted for each fuse; it is charged min(fee, maxFee).
    function charge(uint256[] calldata fuseIds, uint256[] calldata maxFees) external returns (uint256 total) {
        uint256 n = fuseIds.length;
        if (maxFees.length != n) revert LengthMismatch();
        uint16 bps = protocolFeeBps;
        uint256 protocolCut;
        for (uint256 i; i < n; ++i) {
            uint256 id = fuseIds[i];
            Fuse storage f = _fuses[id];
            if (f.processor == address(0)) revert UnknownFuse(id);
            uint256 fee = f.fee;
            if (fee > maxFees[i]) fee = maxFees[i];
            uint256 cut = (fee * bps) / 10_000;
            uint256 share = fee - cut;
            earned[id] += share;
            lifetimeEarned[id] += share;
            decisions[id] += 1;
            protocolCut += cut;
            total += fee;
            emit Charged(msg.sender, id, fee, share);
        }
        uint256 bal = feeBalance[msg.sender];
        if (bal < total) revert InsufficientFeeBalance(bal, total);
        feeBalance[msg.sender] = bal - total;
        protocolEarned += protocolCut;
        // totalOwed is unchanged: value moves from a fee balance to earnings.
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function fuse(uint256 fuseId) external view returns (Fuse memory f) {
        f = _fuses[fuseId];
        if (f.processor == address(0)) revert UnknownFuse(fuseId);
    }

    function feeOf(uint256 fuseId) external view returns (uint256) {
        return _fuses[fuseId].fee;
    }

    /// @notice Current owner of the fuse's circuit NFT: the address that receives its fees.
    function designerOf(uint256 fuseId) public view returns (address) {
        Fuse storage f = _fuses[fuseId];
        if (f.processor == address(0)) revert UnknownFuse(fuseId);
        return ITapeoutProcessor(f.processor).ownerOf(f.circuitId);
    }

    /// @notice True when `processor` runs allowlisted proxy code whose beacon points at an attested
    ///         implementation. Evaluated at every decision by FuseboxWallet.
    function isTrustedProcessor(address processor) public view returns (bool) {
        address beacon = beaconOfCodehash[processor.codehash];
        if (beacon == address(0)) return false;
        try ITapeoutBeacon(beacon).implementation() returns (address impl) {
            return trustedImplementation[impl];
        } catch {
            return false;
        }
    }

    /// @dev A fuse must be fully described by its own bytes: REF records would pull in other circuits whose
    ///      behaviour the netlist hash does not cover. Also re-checks record framing (TAP-02 §2).
    function _requireSelfContained(bytes memory nl) internal pure {
        uint256 p;
        uint256 len = nl.length;
        while (p < len) {
            uint8 op = uint8(nl[p]);
            if (op == 0x00) p += 7;
            else if (op == 0x01) p += 4;
            else if (op == 0x02) revert RefNotAllowed(p);
            else revert MalformedNetlist(p);
        }
        if (p != len) revert MalformedNetlist(len);
    }

    // ---------------------------------------------------------------------------------------------
    // Admin (trust configuration and protocol fee only; the admin cannot move anyone's funds)
    // ---------------------------------------------------------------------------------------------

    function setProcessorCodehash(bytes32 codehash, address beacon) external onlyOwner {
        beaconOfCodehash[codehash] = beacon;
        emit ProcessorCodehashSet(codehash, beacon);
    }

    function setTrustedImplementation(address implementation, bool trusted) external onlyOwner {
        trustedImplementation[implementation] = trusted;
        emit ImplementationTrusted(implementation, trusted);
    }

    function setProtocolFee(uint16 bps) external onlyOwner {
        if (bps > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        protocolFeeBps = bps;
        emit ProtocolFeeSet(bps);
    }

    function claimProtocol(address to) external onlyOwner nonReentrant returns (uint256 amount) {
        if (to == address(0)) revert ZeroAddress();
        amount = protocolEarned;
        protocolEarned = 0;
        totalOwed -= amount;
        feeToken.safeTransfer(to, amount);
        emit ProtocolClaimed(to, amount);
    }

    /// @dev Owner-only actions (claim, price, listing) also require the processor to be trusted now: an
    ///      unattested implementation could otherwise report any ownerOf and claim the earnings.
    function _ownedFuse(uint256 fuseId) internal view returns (Fuse storage f) {
        f = _fuses[fuseId];
        if (f.processor == address(0)) revert UnknownFuse(fuseId);
        if (!isTrustedProcessor(f.processor)) revert UntrustedProcessor(f.processor);
        address circuitOwner = ITapeoutProcessor(f.processor).ownerOf(f.circuitId);
        if (circuitOwner != msg.sender) revert NotCircuitOwner(msg.sender, circuitOwner);
    }
}
