// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {FuseRegistry} from "./FuseRegistry.sol";
import {ITapeoutProcessor} from "./interfaces/ITapeout.sol";
import {Sockets} from "./libraries/Sockets.sol";

/// @title FuseboxWallet
/// @notice A minimal smart account for an AI agent. The agent's key can do exactly one thing: ask the
///         wallet to `pay`. Every payment is put to every fuse in the owner's ordered stack; each fuse is a
///         TapeOut circuit evaluated on chain. The payment executes only if every circuit outputs 1.
///         A blocked attempt is not a revert: it is recorded (event + counters), sequential fuses keep the
///         beat, and each fuse that decided is paid its fee, because "no" is the decision being bought.
///
/// @dev Roles:
///      - owner: installs and removes fuses, sets parameters, keeps the payee book, sets approvers,
///        resets breakers, pauses, moves funds (`execute`). The root of trust.
///      - agents: may call `pay` and `freeze` only.
///      - approvers (3 seats): record approvals for exact payments; may also `freeze`.
///      Fuse inputs are derived by this contract from (token, to, amount) and its own state; the agent
///      never supplies input bits. LATCH state is stored here and advanced only by payment beats (inputs
///      derived as above) and by owner control beats on sockets with owner pins (BREAKER: set / clear).
contract FuseboxWallet is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------------------------------
    // Types and constants
    // ---------------------------------------------------------------------------------------------

    uint8 public constant PASS = 0; // output all ones
    uint8 public constant BLEW = 1; // circuit answered 0
    uint8 public constant FAILED = 2; // call reverted or returned malformed data: fail closed
    uint8 public constant UNTRUSTED = 3; // processor no longer trusted by the registry: fail closed

    uint256 public constant MAX_FUSES = 8;
    /// @notice Gas forwarded to each processor call. 512 gates at ~2.3k gas each fits with room to spare.
    uint256 public constant FUSE_GAS = 2_000_000;
    uint256 internal constant MAX_RETURN = 1024;

    struct Slot {
        uint256 fuseId;
        address processor;
        uint64 circuitId;
        uint32 socket;
        uint32 nOut;
        uint32 nState;
        uint96 maxFee;
        Sockets.Params params;
        uint32 spentDay;
        uint256 spent;
        bytes state;
    }

    struct Approval {
        uint8 mask;
        /// fixed when the first approval lands; later TTL changes do not move it
        uint64 expiresAt;
    }

    struct Ctx {
        address token;
        address to;
        uint256 amount;
        uint32 today;
        bool listed;
        uint8 ageHours;
        uint8 approvalMask;
        bytes32 intent;
        bytes32 repeatKey;
        uint64 lastPaid;
        bool repeatCleared;
    }

    struct Verdict {
        bool allowed;
        uint256[] fuseIds;
        uint8[] status;
        bytes[] inputs;
        bytes[] outputs;
        bytes[] newStates;
    }

    // ---------------------------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------------------------

    FuseRegistry public immutable registry;

    address public owner;
    address public pendingOwner;
    mapping(address => bool) public isAgent;
    /// @notice Tokens the agent may pay with (address(0) = native OKB). `pay` reverts for any other token,
    ///         so the agent cannot use the token argument to make the wallet call arbitrary contracts.
    mapping(address token => bool) public tokenEnabled;
    bool public paused;

    Slot[] internal _stack;

    mapping(address payee => uint64 addedAt) public payeeAddedAt;

    address[3] internal _approvers;
    uint64 public approvalEpoch;
    uint32 public approvalTtl;
    mapping(bytes32 intent => Approval) public approvals;

    /// @notice When each exact payment (token, to, amount) last went out; the REPEAT_GUARD socket reads it.
    mapping(bytes32 repeatKey => uint64 at) public lastPaidAt;
    /// @notice Owner clearance for one repeat of an exact payment, valid until this time. Used up by the next
    ///         allowed payment of exactly that (token, to, amount).
    mapping(bytes32 repeatKey => uint64 until) public repeatClearedUntil;

    uint64 public decisionCount;
    uint64 public allowedCount;
    uint64 public blockedCount;
    /// UTC day the two counters below refer to
    uint32 public counterDay;
    uint32 public decisionsToday;
    uint32 public blockedToday;
    /// recorded (and charged) decisions per UTC day, allowed or blocked; bounds fees per day
    uint32 public maxDecisionsPerDay;
    /// recorded (and charged) blocked attempts per UTC day
    uint32 public maxBlockedPerDay;

    // ---------------------------------------------------------------------------------------------
    // Events and errors
    // ---------------------------------------------------------------------------------------------

    /// @notice One payment decision. `status[i]` is PASS, BLEW, FAILED or UNTRUSTED for fuse `fuseIds[i]`;
    ///         `inputs[i]` / `outputs[i]` are the packed bits sent to and returned by its circuit.
    event Decision(
        uint256 indexed decisionId,
        address indexed agent,
        address indexed to,
        address token,
        uint256 amount,
        bool allowed,
        uint256[] fuseIds,
        uint8[] status,
        bytes[] inputs,
        bytes[] outputs,
        uint256 feePaid,
        bytes32 intent,
        string memo
    );
    /// @notice Emitted for every fuse that stopped a payment: "the fuse blew".
    event FuseBlew(uint256 indexed decisionId, uint256 indexed fuseId, uint256 slot, uint8 status);
    event ControlBeat(uint256 indexed slot, uint256 indexed fuseId, address indexed by, bytes inputs, bytes newState);
    event FuseAdded(uint256 indexed slot, uint256 indexed fuseId, Sockets.Params params, uint96 maxFee);
    event FuseRemoved(uint256 indexed slot, uint256 indexed fuseId);
    event FuseParamsSet(uint256 indexed slot, Sockets.Params params);
    event FuseMaxFeeSet(uint256 indexed slot, uint96 maxFee);
    event AgentSet(address indexed agent, bool enabled);
    event TokenSet(address indexed token, bool enabled);
    event PayeeAdded(address indexed payee, uint64 at);
    event PayeeRemoved(address indexed payee);
    event ApproversSet(address[3] approvers, uint64 epoch);
    event ApprovalTtlSet(uint32 ttl);
    event Approved(bytes32 indexed intent, address indexed approver, uint8 mask);
    event ApprovalRevoked(bytes32 indexed intent, address indexed approver, uint8 mask);
    event RepeatCleared(bytes32 indexed repeatKey, address indexed to, address token, uint256 amount, uint64 until);
    event PausedSet(bool paused);
    event DailyLimitsSet(uint32 maxDecisions, uint32 maxBlocked);
    event BreakerSkipped(uint256 indexed slot, uint8 status);
    event Executed(address indexed target, uint256 value, bytes data);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotAgent();
    error NotApprover();
    error NotAllowedToFreeze();
    error IsPaused();
    error NoFuses();
    error TooManyFuses();
    error BadIndex();
    error BadPayee();
    error TokenNotEnabled(address token);
    error ZeroAmount();
    error ZeroAddress();
    error BlockedLimitReached(uint32 limit);
    error DecisionLimitReached(uint32 limit);
    error AgentCannotApprove(address who);
    error FuseNotListed(uint256 fuseId);
    error FeeAboveMax(uint256 fee, uint256 maxFee);
    error NoOwnerPins(uint256 slot);
    error NoBreaker();
    error ControlBeatFailed(uint256 slot, uint8 status);
    error InsufficientGas();
    error DuplicateApprover();
    error AlreadyListed();
    error NativeTransferFailed();
    error CallFailed(bytes reason);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (!isAgent[msg.sender]) revert NotAgent();
        _;
    }

    constructor(FuseRegistry registry_, address owner_, address[] memory agents) {
        if (address(registry_) == address(0) || owner_ == address(0)) revert ZeroAddress();
        registry = registry_;
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
        for (uint256 i; i < agents.length; ++i) {
            if (agents[i] == address(0)) revert ZeroAddress();
            isAgent[agents[i]] = true;
            emit AgentSet(agents[i], true);
        }
        approvalTtl = 1 days;
        maxDecisionsPerDay = 100;
        maxBlockedPerDay = 20;
    }

    receive() external payable {}

    // ---------------------------------------------------------------------------------------------
    // The agent's one capability
    // ---------------------------------------------------------------------------------------------

    /// @notice Attempt a payment. Every fuse decides; the payment executes only if all output 1.
    /// @param token ERC-20 to pay, or address(0) for native OKB.
    /// @param memo The agent's reason, recorded in the Decision event.
    /// @return allowed Whether the payment executed.
    /// @return decisionId The id of the recorded decision.
    function pay(address token, address to, uint256 amount, string calldata memo)
        external
        nonReentrant
        onlyAgent
        returns (bool allowed, uint256 decisionId)
    {
        if (paused) revert IsPaused();
        if (to == address(0) || to == address(this)) revert BadPayee();
        if (amount == 0) revert ZeroAmount();
        if (!tokenEnabled[token]) revert TokenNotEnabled(token);
        uint256 n = _stack.length;
        if (n == 0) revert NoFuses();
        // forge-lint: disable-next-line(unsafe-typecast)
        uint32 today = uint32(block.timestamp / 1 days); // day index fits u32 for 11M years
        bool sameDay = counterDay == today;
        // Daily budgets bound what a looping or hijacked agent can spend on fees: past either limit the
        // attempt reverts, so nothing is recorded or charged.
        if ((sameDay ? decisionsToday : 0) >= maxDecisionsPerDay) revert DecisionLimitReached(maxDecisionsPerDay);

        Ctx memory c = _context(token, to, amount, today);
        Verdict memory v = _decide(c);
        allowed = v.allowed;
        // Past the blocked limit a refused attempt reverts; allowed payments still go through.
        if (!allowed && (sameDay ? blockedToday : 0) >= maxBlockedPerDay) revert BlockedLimitReached(maxBlockedPerDay);

        // effects: fuse state (every decision is one beat, allowed or blocked), counters, cap, approvals
        uint256 charged;
        for (uint256 i; i < n; ++i) {
            if (v.status[i] > BLEW) continue;
            charged++;
            Slot storage s = _stack[i];
            if (s.nState != 0) s.state = v.newStates[i];
        }
        decisionId = ++decisionCount;
        if (!sameDay) {
            counterDay = today;
            decisionsToday = 0;
            blockedToday = 0;
        }
        decisionsToday++;
        if (allowed) {
            allowedCount++;
            for (uint256 i; i < n; ++i) {
                Slot storage s = _stack[i];
                if (s.socket == Sockets.DAILY_CAP && s.params.token == token) {
                    if (s.spentDay != today) {
                        s.spentDay = today;
                        s.spent = 0;
                    }
                    s.spent += amount;
                }
            }
            if (c.approvalMask != 0) delete approvals[c.intent];
            lastPaidAt[c.repeatKey] = uint64(block.timestamp);
            if (c.repeatCleared) delete repeatClearedUntil[c.repeatKey];
        } else {
            blockedCount++;
            blockedToday++;
        }

        uint256 fee = _charge(v, charged);
        emit Decision(
            decisionId,
            msg.sender,
            to,
            token,
            amount,
            allowed,
            v.fuseIds,
            v.status,
            v.inputs,
            v.outputs,
            fee,
            c.intent,
            memo
        );
        if (!allowed) {
            for (uint256 i; i < n; ++i) {
                if (v.status[i] != PASS) emit FuseBlew(decisionId, v.fuseIds[i], i, v.status[i]);
            }
            return (false, decisionId);
        }

        // interaction last
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /// @notice Dry run: what every fuse would answer right now. Changes nothing, charges nothing.
    function check(address token, address to, uint256 amount)
        external
        view
        returns (bool allowed, uint8[] memory status, bytes[] memory inputs, bytes[] memory outputs)
    {
        if (_stack.length == 0) return (false, status, inputs, outputs);
        Verdict memory v = _decide(_context(token, to, amount, uint32(block.timestamp / 1 days)));
        return (v.allowed && !paused, v.status, v.inputs, v.outputs);
    }

    // ---------------------------------------------------------------------------------------------
    // Freeze / breaker control beats
    // ---------------------------------------------------------------------------------------------

    /// @notice Blow every breaker fuse (set pulse). Owner, agents and approvers may freeze; only the owner
    ///         may reset. Best effort per breaker: one that cannot be stepped (processor untrusted or failing)
    ///         is skipped with an event, and if no breaker latched, the wallet is paused instead, so a freeze
    ///         never depends on a processor being healthy.
    /// @return latched Number of breakers that latched.
    function freeze() external nonReentrant returns (uint256 latched) {
        if (msg.sender != owner && !isAgent[msg.sender] && !_isApprover(msg.sender)) revert NotAllowedToFreeze();
        latched = _pulseAllBreakers(true, false);
        if (latched == 0) {
            paused = true;
            emit PausedSet(true);
        }
    }

    /// @notice Reset every breaker fuse (clear pulse). Does not lift a pause: use setPaused.
    function unfreeze() external onlyOwner nonReentrant {
        if (_pulseAllBreakers(false, true) == 0) revert NoBreaker();
    }

    /// @notice One owner control beat on a single sequential fuse with owner pins.
    function pulse(uint256 slot, bool set, bool clear) external onlyOwner nonReentrant {
        if (slot >= _stack.length) revert BadIndex();
        _pulse(slot, set, clear);
    }

    // ---------------------------------------------------------------------------------------------
    // Approvals (2-of-3 socket)
    // ---------------------------------------------------------------------------------------------

    /// @notice Approve one exact payment. The approval is bound to this wallet, this chain, the current
    ///         approver epoch, and (token, to, amount); it expires `approvalTtl` after the first approval
    ///         and is consumed when the payment executes.
    function approvePayment(address token, address to, uint256 amount) external returns (bytes32 intent) {
        uint256 k = _approverIndex(msg.sender);
        intent = intentHash(token, to, amount);
        Approval storage a = approvals[intent];
        if (a.mask != 0 && block.timestamp > a.expiresAt) a.mask = 0;
        if (a.mask == 0) a.expiresAt = uint64(block.timestamp + approvalTtl);
        // forge-lint: disable-next-line(unsafe-typecast)
        a.mask |= uint8(1 << k); // k < 3
        emit Approved(intent, msg.sender, a.mask);
    }

    function revokeApproval(address token, address to, uint256 amount) external {
        uint256 k = _approverIndex(msg.sender);
        bytes32 intent = intentHash(token, to, amount);
        Approval storage a = approvals[intent];
        // forge-lint: disable-next-line(unsafe-typecast)
        a.mask &= ~uint8(1 << k); // k < 3
        emit ApprovalRevoked(intent, msg.sender, a.mask);
    }

    function intentHash(address token, address to, uint256 amount) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), approvalEpoch, token, to, amount));
    }

    /// @notice The key the Repeat Guard remembers a payment by: the exact token, payee and amount.
    function repeatKey(address token, address to, uint256 amount) public pure returns (bytes32) {
        return keccak256(abi.encode(token, to, amount));
    }

    /// @notice Approver bits currently valid for a payment, as the 2-of-3 socket will see them.
    function approvalMaskOf(address token, address to, uint256 amount) public view returns (uint8) {
        Approval memory a = approvals[intentHash(token, to, amount)];
        if (a.mask == 0 || block.timestamp > a.expiresAt) return 0;
        return a.mask;
    }

    function approvers() external view returns (address[3] memory) {
        return _approvers;
    }

    // ---------------------------------------------------------------------------------------------
    // Owner: fuse stack
    // ---------------------------------------------------------------------------------------------

    /// @notice Append a listed fuse to the stack.
    /// @param maxFee Highest per-decision fee the owner accepts for this fuse (USDT0, 6 decimals).
    function addFuse(uint256 fuseId, Sockets.Params calldata params, uint96 maxFee)
        external
        onlyOwner
        returns (uint256 slot)
    {
        if (_stack.length >= MAX_FUSES) revert TooManyFuses();
        FuseRegistry.Fuse memory f = registry.fuse(fuseId);
        if (!f.listed) revert FuseNotListed(fuseId);
        if (f.fee > maxFee) revert FeeAboveMax(f.fee, maxFee);
        Sockets.validate(f.socket, params);
        slot = _stack.length;
        Slot storage s = _stack.push();
        s.fuseId = fuseId;
        s.processor = f.processor;
        s.circuitId = f.circuitId;
        s.socket = f.socket;
        s.nOut = f.nOut;
        s.nState = f.nState;
        s.maxFee = maxFee;
        s.params = params;
        s.state = new bytes((uint256(f.nState) + 7) / 8);
        emit FuseAdded(slot, fuseId, params, maxFee);
    }

    /// @notice Remove a fuse; the order of the others is kept.
    function removeFuse(uint256 slot) external onlyOwner {
        uint256 n = _stack.length;
        if (slot >= n) revert BadIndex();
        uint256 fuseId = _stack[slot].fuseId;
        for (uint256 i = slot; i + 1 < n; ++i) {
            _stack[i] = _stack[i + 1];
        }
        _stack.pop();
        emit FuseRemoved(slot, fuseId);
    }

    function setFuseParams(uint256 slot, Sockets.Params calldata params) external onlyOwner {
        if (slot >= _stack.length) revert BadIndex();
        Slot storage s = _stack[slot];
        Sockets.validate(s.socket, params);
        if (params.token != s.params.token || params.unit != s.params.unit) {
            s.spentDay = 0;
            s.spent = 0;
        }
        s.params = params;
        emit FuseParamsSet(slot, params);
    }

    /// @notice Accept a designer's new fee (or lower the ceiling).
    function setFuseMaxFee(uint256 slot, uint96 maxFee) external onlyOwner {
        if (slot >= _stack.length) revert BadIndex();
        _stack[slot].maxFee = maxFee;
        emit FuseMaxFeeSet(slot, maxFee);
    }

    // ---------------------------------------------------------------------------------------------
    // Owner: people and settings
    // ---------------------------------------------------------------------------------------------

    function setAgent(address agent, bool enabled) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        if (enabled && _isApprover(agent)) revert AgentCannotApprove(agent);
        isAgent[agent] = enabled;
        emit AgentSet(agent, enabled);
    }

    function setToken(address token, bool enabled) external onlyOwner {
        tokenEnabled[token] = enabled;
        emit TokenSet(token, enabled);
    }

    /// @notice Let the next payment of exactly (token, to, amount) past the Repeat Guard once, for the approval
    ///         TTL: the owner saying "yes, this really is a second payment". `clear = false` withdraws it.
    function clearRepeat(address token, address to, uint256 amount, bool clear) external onlyOwner {
        bytes32 k = repeatKey(token, to, amount);
        uint64 until = clear ? uint64(block.timestamp + approvalTtl) : 0;
        repeatClearedUntil[k] = until;
        emit RepeatCleared(k, to, token, amount, until);
    }

    /// @notice Add a payee. Its cooling-off clock starts now.
    function addPayee(address payee) external onlyOwner {
        if (payee == address(0) || payee == address(this)) revert BadPayee();
        if (payeeAddedAt[payee] != 0) revert AlreadyListed();
        payeeAddedAt[payee] = uint64(block.timestamp);
        emit PayeeAdded(payee, uint64(block.timestamp));
    }

    function removePayee(address payee) external onlyOwner {
        delete payeeAddedAt[payee];
        emit PayeeRemoved(payee);
    }

    /// @notice Set the three approver seats (address(0) = empty seat). Invalidates every open approval.
    function setApprovers(address[3] calldata seats) external onlyOwner {
        for (uint256 i; i < 3; ++i) {
            if (isAgent[seats[i]]) revert AgentCannotApprove(seats[i]);
            for (uint256 j = i + 1; j < 3; ++j) {
                if (seats[i] != address(0) && seats[i] == seats[j]) revert DuplicateApprover();
            }
        }
        _approvers = seats;
        approvalEpoch++;
        emit ApproversSet(seats, approvalEpoch);
    }

    function setApprovalTtl(uint32 ttl) external onlyOwner {
        approvalTtl = ttl;
        emit ApprovalTtlSet(ttl);
    }

    /// @notice Kill switch: while paused, `pay` reverts before any fuse is evaluated (no fees).
    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// @notice Daily budgets (UTC days). `maxDecisions`: recorded decisions of any outcome; beyond it every
    ///         attempt reverts. `maxBlocked`: recorded blocked attempts; beyond it refused attempts revert
    ///         while allowed payments continue. Reverted attempts are never charged, so the fee spend per day
    ///         is at most maxDecisions * sum of the accepted fees.
    function setDailyLimits(uint32 maxDecisions, uint32 maxBlocked) external onlyOwner {
        maxDecisionsPerDay = maxDecisions;
        maxBlockedPerDay = maxBlocked;
        emit DailyLimitsSet(maxDecisions, maxBlocked);
    }

    /// @notice Withdraw unused prepaid fees from the registry.
    function withdrawFeeBalance(uint256 amount, address to) external onlyOwner nonReentrant {
        registry.withdraw(amount, to);
    }

    /// @notice Arbitrary call by the owner (move funds, top up fees, recover tokens).
    function execute(address target, uint256 value, bytes calldata data)
        external
        onlyOwner
        nonReentrant
        returns (bytes memory result)
    {
        bool ok;
        (ok, result) = target.call{value: value}(data);
        if (!ok) revert CallFailed(result);
        emit Executed(target, value, data);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function fuseCount() external view returns (uint256) {
        return _stack.length;
    }

    function slotAt(uint256 slot) external view returns (Slot memory) {
        return _stack[slot];
    }

    /// @notice Raw spend recorded today by a DAILY_CAP slot.
    function spentToday(uint256 slot) public view returns (uint256) {
        Slot storage s = _stack[slot];
        // forge-lint: disable-next-line(unsafe-typecast)
        return s.spentDay == uint32(block.timestamp / 1 days) ? s.spent : 0; // day index fits u32 for 11M years
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    function _context(address token, address to, uint256 amount, uint32 today) internal view returns (Ctx memory c) {
        c.token = token;
        c.to = to;
        c.amount = amount;
        c.today = today;
        uint64 added = payeeAddedAt[to];
        c.listed = added != 0;
        if (c.listed) {
            uint256 hrs = (block.timestamp - added) / 1 hours;
            // forge-lint: disable-next-line(unsafe-typecast)
            c.ageHours = hrs > 255 ? 255 : uint8(hrs); // saturated
        }
        c.intent = intentHash(token, to, amount);
        c.approvalMask = approvalMaskOf(token, to, amount);
        c.repeatKey = repeatKey(token, to, amount);
        c.lastPaid = lastPaidAt[c.repeatKey];
        c.repeatCleared = block.timestamp <= repeatClearedUntil[c.repeatKey];
    }

    function _decide(Ctx memory c) internal view returns (Verdict memory v) {
        uint256 n = _stack.length;
        v.fuseIds = new uint256[](n);
        v.status = new uint8[](n);
        v.inputs = new bytes[](n);
        v.outputs = new bytes[](n);
        v.newStates = new bytes[](n);
        v.allowed = true;
        address lastProcessor;
        bool lastTrusted;
        for (uint256 i; i < n; ++i) {
            Slot storage s = _stack[i];
            v.fuseIds[i] = s.fuseId;
            v.inputs[i] = _paymentInputs(s, c);
            if (s.processor != lastProcessor) {
                lastProcessor = s.processor;
                lastTrusted = registry.isTrustedProcessor(s.processor);
            }
            if (!lastTrusted) {
                v.status[i] = UNTRUSTED;
            } else {
                (v.status[i], v.outputs[i], v.newStates[i]) = _evaluate(s, v.inputs[i]);
            }
            if (v.status[i] != PASS) v.allowed = false;
        }
    }

    function _paymentInputs(Slot storage s, Ctx memory c) internal view returns (bytes memory) {
        uint32 socket = s.socket;
        Sockets.Params memory p = s.params;
        if (socket == Sockets.DAILY_CAP) {
            uint256 spent = s.spentDay == c.today ? s.spent : 0;
            return Sockets.dailyCapInputs(Sockets.amountPin(p, c.token, c.amount), Sockets.quantise(spent, p.unit), p.a);
        }
        if (socket == Sockets.PAYEE_GUARD) {
            return Sockets.payeeGuardInputs(c.listed, c.ageHours, p.a, Sockets.amountPin(p, c.token, c.amount), p.b);
        }
        if (socket == Sockets.BREAKER) {
            return Sockets.breakerInputs(false, false, true, !c.listed);
        }
        if (socket == Sockets.APPROVAL_2OF3) {
            return Sockets.approvalInputs(c.approvalMask, Sockets.amountPin(p, c.token, c.amount), p.a);
        }
        if (socket == Sockets.REPEAT_GUARD) {
            bool repeat = c.lastPaid != 0 && block.timestamp < uint256(c.lastPaid) + uint256(p.a) * 1 hours;
            return Sockets.repeatInputs(repeat, c.repeatCleared);
        }
        revert Sockets.UnknownSocket(socket);
    }

    /// @dev One beat of one fuse. Never reverts on a misbehaving processor: it fails closed instead.
    function _evaluate(Slot storage s, bytes memory inputs)
        internal
        view
        returns (uint8 status, bytes memory out, bytes memory newState)
    {
        bool sequential = s.nState != 0;
        bytes memory data = sequential
            ? abi.encodeCall(ITapeoutProcessor.step, (s.circuitId, s.state, inputs))
            : abi.encodeCall(ITapeoutProcessor.eval, (s.circuitId, inputs));
        // the caller must not be able to starve a fuse into failing: require the full allowance (EIP-150)
        if (gasleft() < FUSE_GAS + FUSE_GAS / 63 + 20_000) revert InsufficientGas();
        (bool ok, bytes memory ret) = _boundedStaticcall(s.processor, data);
        if (!ok) return (FAILED, out, newState);
        bool good;
        // TAP-02 §5: outputs and new state are exactly ceil(n / 8) bytes; anything else is malformed
        if (sequential) {
            (good, newState) = _readBytes(ret, 0);
            if (!good || newState.length != (uint256(s.nState) + 7) / 8) return (FAILED, "", "");
            Sockets.maskTail(newState, s.nState);
            (good, out) = _readBytes(ret, 1);
        } else {
            (good, out) = _readBytes(ret, 0);
        }
        if (!good || out.length != (uint256(s.nOut) + 7) / 8) return (FAILED, "", "");
        status = Sockets.allOnes(out, s.nOut) ? PASS : BLEW;
    }

    /// @dev staticcall with a fixed gas allowance; a return larger than MAX_RETURN counts as failure.
    function _boundedStaticcall(address target, bytes memory data) internal view returns (bool ok, bytes memory ret) {
        uint256 gasAllowance = FUSE_GAS;
        uint256 maxRet = MAX_RETURN;
        assembly ("memory-safe") {
            ok := staticcall(gasAllowance, target, add(data, 0x20), mload(data), 0, 0)
            let size := returndatasize()
            if gt(size, maxRet) {
                ok := 0
                size := 0
            }
            ret := mload(0x40)
            mstore(ret, size)
            returndatacopy(add(ret, 0x20), 0, size)
            mstore(0x40, add(add(ret, 0x20), and(add(size, 0x1f), not(0x1f))))
        }
    }

    /// @dev Bounds-checked ABI decoding of the `head`-th dynamic `bytes` value in `ret`.
    function _readBytes(bytes memory ret, uint256 head) internal pure returns (bool ok, bytes memory out) {
        uint256 len = ret.length;
        if (len < 32 * (head + 1)) return (false, out);
        uint256 offset;
        assembly ("memory-safe") {
            offset := mload(add(add(ret, 0x20), mul(head, 0x20)))
        }
        if (offset > len || len - offset < 32) return (false, out);
        uint256 size;
        assembly ("memory-safe") {
            size := mload(add(add(ret, 0x20), offset))
        }
        if (size > len - offset - 32) return (false, out);
        out = new bytes(size);
        for (uint256 i; i < size; ++i) {
            out[i] = ret[offset + 32 + i];
        }
        ok = true;
    }

    function _charge(Verdict memory v, uint256 charged) internal returns (uint256 fee) {
        if (charged == 0) return 0;
        uint256[] memory ids = new uint256[](charged);
        uint256[] memory maxFees = new uint256[](charged);
        uint256 k;
        for (uint256 i; i < v.fuseIds.length; ++i) {
            if (v.status[i] > BLEW) continue;
            ids[k] = v.fuseIds[i];
            maxFees[k] = _stack[i].maxFee;
            k++;
        }
        fee = registry.charge(ids, maxFees);
    }

    /// @return done Breakers stepped successfully; failing ones are skipped with BreakerSkipped.
    function _pulseAllBreakers(bool set, bool clear) internal returns (uint256 done) {
        uint256 n = _stack.length;
        for (uint256 i; i < n; ++i) {
            Slot storage s = _stack[i];
            if (!Sockets.hasOwnerPins(s.socket) || s.nState == 0) continue;
            uint8 status = _tryPulse(i, set, clear);
            if (status > BLEW) emit BreakerSkipped(i, status);
            else done++;
        }
    }

    function _pulse(uint256 slot, bool set, bool clear) internal {
        Slot storage s = _stack[slot];
        if (!Sockets.hasOwnerPins(s.socket) || s.nState == 0) revert NoOwnerPins(slot);
        uint8 status = _tryPulse(slot, set, clear);
        if (status > BLEW) revert ControlBeatFailed(slot, status);
    }

    /// @dev One control beat; commits the new state only if the processor answered well-formed.
    function _tryPulse(uint256 slot, bool set, bool clear) internal returns (uint8 status) {
        Slot storage s = _stack[slot];
        if (!registry.isTrustedProcessor(s.processor)) return UNTRUSTED;
        bytes memory inputs = Sockets.breakerInputs(set, clear, false, false);
        bytes memory newState;
        (status,, newState) = _evaluate(s, inputs);
        if (status > BLEW) return status;
        s.state = newState;
        emit ControlBeat(slot, s.fuseId, msg.sender, inputs, newState);
    }

    function _approverIndex(address who) internal view returns (uint256) {
        if (who != address(0)) {
            for (uint256 i; i < 3; ++i) {
                if (_approvers[i] == who) return i;
            }
        }
        revert NotApprover();
    }

    function _isApprover(address who) internal view returns (bool) {
        return who != address(0) && (_approvers[0] == who || _approvers[1] == who || _approvers[2] == who);
    }
}
