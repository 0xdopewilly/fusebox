// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FuseRegistry} from "../../src/FuseRegistry.sol";
import {FuseboxWallet} from "../../src/FuseboxWallet.sol";
import {Sockets} from "../../src/libraries/Sockets.sol";

import {Base} from "../Base.t.sol";
import {FuseFixtures} from "../fixtures/FuseFixtures.sol";
import {MockBeacon} from "../mocks/MockTapeout.sol";
import {MockUSDT0} from "../mocks/MockTokens.sol";

/// @notice Plays every role against one FuseboxWallet that runs all five shipped fuses (the real netlists, on a
///         TAP-02 processor): the agent paying, the owner changing anything, three approver seats and a former
///         approver, the designer repricing, TapeOut upgrading its processor, an attacker, and the clock.
///
///         Alongside, it keeps its own model of what the fuses promise, written from the socket definitions
///         rather than from the wallet's code. Before every payment the model predicts allow / block / revert
///         and the exact fee; the wallet must agree. Each promise is also counted directly (a payment to an
///         unsaved payee, one past a blown breaker, ...), so the invariants read as the promises themselves.
contract WalletHandler is Test {
    uint256 internal constant U = 1e6; // one USD₮0
    uint256 internal constant CAP = 0;
    uint256 internal constant PAYEE = 1;
    uint256 internal constant BREAKER = 2;
    uint256 internal constant APPROVAL = 3;
    uint256 internal constant REPEAT = 4;

    struct Env {
        FuseboxWallet wallet;
        FuseRegistry registry;
        MockUSDT0 usdt;
        MockBeacon beacon;
        address trustedImpl;
        address owner;
        address agent;
        address designer;
        address admin;
        address supplier;
        address[3] approvers;
        uint256[5] fuseIds;
    }

    FuseboxWallet internal immutable w;
    FuseRegistry internal immutable reg;
    MockUSDT0 internal immutable usdt;
    MockBeacon internal immutable beacon;
    address internal immutable trustedImpl;
    address internal immutable badImpl = makeAddr("unattestedImplementation");
    address internal immutable owner;
    address internal immutable agent;
    address internal immutable designer;
    address internal immutable admin;
    address internal immutable attacker = makeAddr("attacker");
    uint256[5] internal fuseIds;
    address[4] internal pool; // three seated approvers and one outsider; setApprovers reshuffles who sits
    address[4] internal payees; // supplier (saved), fresh, stranger: the owner may save them; scammer: never

    uint256[15] internal AMOUNTS = [
        uint256(1), 500_000, U, U + 1, 2 * U, 2 * U + 1, 3 * U, 10 * U, 20 * U, 20 * U + 1, 25 * U, 50 * U, 51 * U, 254 * U, 300 * U
    ];

    // ------------------------------------------------------------------ the model
    struct Appr {
        uint8 mask;
        uint64 expires;
    }

    uint8 internal mCap = 50;
    uint8 internal mCool = 24;
    uint8 internal mTrial = 2;
    uint8 internal mThr = 20;
    uint8 internal mWin = 6;
    uint256 internal mSpent;
    uint32 internal mSpentDay;
    mapping(address => uint64) internal mAdded;
    bool internal mBlown;
    bool internal mPaused;
    bool internal mTrusted = true;
    address[3] internal mSeats;
    uint64 internal mEpoch;
    uint32 internal mTtl;
    mapping(bytes32 => Appr) internal mAppr;
    mapping(bytes32 => uint64) internal mLastPaid;
    mapping(bytes32 => uint64) internal mClearedUntil;
    uint32 internal mCounterDay;
    uint32 internal mDecToday;
    uint32 internal mBlkToday;
    uint32 internal mMaxDec = 100;
    uint32 internal mMaxBlk = 20;
    uint256[5] internal mFee;
    uint256[5] internal mMaxFee;
    /// a freeze happened and the owner hasn't unfrozen or unpaused since
    bool internal mFrozen;

    // ------------------------------------------------------------------ ghosts read by the invariants
    uint256 public paidOut; // USD₮0 that left through pay
    uint256 public movedOut; // USD₮0 the owner moved out with execute
    uint256 public startTopUps; // USD₮0 minted into the wallet during the run
    uint32 public payDay;
    uint256 public paidToday;
    uint8 public maxCapToday;
    uint256 public decisions;

    uint256 public mismatches;
    string public firstMismatch;
    uint256 public paidToUnsaved;
    uint256 public paidCoolingOverTrial;
    uint256 public paidPastBreaker;
    uint256 public paidWhileFrozen;
    uint256 public paidBigWithoutTwo;
    uint256 public paidRepeatUncleared;
    uint256 public paidWhileUntrusted;
    uint256 public chargedWhileUntrusted;
    uint256 public overcharged;
    uint256 public unauthorized;
    string public firstUnauthorized;

    // coverage, for the summary
    uint256 public nAllowed;
    uint256 public nBlocked;
    uint256 public nReverted;
    uint256 public nAllowedWithApprovals;
    uint256 public nAllowedClearedRepeat;
    uint256 public nBlockedUntrusted;
    uint256 public nFreezes;
    /// why predicted reverts happened: paused, decision budget, blocked budget, fee balance, wallet balance
    uint256[5] public revertWhy;
    /// payments stopped by fuse i alone (every other fuse said yes)
    uint256[5] public stoppedAlone;

    constructor(Env memory e) {
        w = e.wallet;
        reg = e.registry;
        usdt = e.usdt;
        beacon = e.beacon;
        trustedImpl = e.trustedImpl;
        owner = e.owner;
        agent = e.agent;
        designer = e.designer;
        admin = e.admin;
        fuseIds = e.fuseIds;
        pool = [e.approvers[0], e.approvers[1], e.approvers[2], makeAddr("formerApprover")];
        payees = [e.supplier, makeAddr("freshPayee"), makeAddr("stranger"), makeAddr("scammer")];
        // the starting state, as the test set it up
        mAdded[e.supplier] = w.payeeAddedAt(e.supplier);
        mSeats = e.approvers;
        mEpoch = w.approvalEpoch();
        mTtl = w.approvalTtl();
        for (uint256 i; i < 5; ++i) {
            mFee[i] = reg.feeOf(fuseIds[i]);
            mMaxFee[i] = w.slotAt(i).maxFee;
        }
        payDay = _today();
        maxCapToday = mCap;
    }

    // =====================================================================================================
    // The agent
    // =====================================================================================================

    struct Pre {
        uint8 amt;
        bool listed;
        uint8 age;
        uint8 mask;
        bytes32 rk;
        bool repeat;
        bool cleared;
        bool allowed;
        bool reverts;
        uint8 why;
        uint8 failed; // bit i: fuse i says no
        uint256 fee;
    }

    function pay(uint256 toSeed, uint256 amountSeed, uint256 tokenSeed) external {
        address token = tokenSeed % 12 == 0 ? address(0) : address(usdt); // now and then, native OKB
        uint256 r = toSeed % 16; // mostly the saved supplier, sometimes someone else
        _pay(token, r < 13 ? payees[0] : payees[1 + r % 3], AMOUNTS[amountSeed % AMOUNTS.length]);
    }

    function _pay(address token, address to, uint256 amount) internal {
        _rollDay();
        Pre memory p = _predict(token, to, amount);
        uint256 feeBefore = reg.feeBalance(address(w));
        bool frozenBefore = mFrozen;
        bool blownBefore = mBlown;

        vm.prank(agent);
        try w.pay(token, to, amount, "fuzz") returns (bool allowed, uint256) {
            if (p.reverts) return _mismatch("the wallet decided a payment the spec says must revert");
            if (allowed != p.allowed) {
                return _mismatch(allowed ? "the wallet allowed a payment the spec blocks" : "the wallet blocked a payment the spec allows");
            }
            uint256 charged = feeBefore - reg.feeBalance(address(w));
            if (charged != p.fee) _mismatch("the fee differs from the spec");
            uint256 accepted;
            for (uint256 i; i < 5; ++i) accepted += mMaxFee[i];
            if (charged > accepted) overcharged++;
            if (!mTrusted && charged != 0) chargedWhileUntrusted++;

            if (allowed) {
                // the promises, each counted on its own
                if (!p.listed) paidToUnsaved++;
                if (p.listed && p.age < mCool && p.amt > mTrial) paidCoolingOverTrial++;
                if (blownBefore) paidPastBreaker++;
                if (frozenBefore) paidWhileFrozen++;
                if (p.amt > mThr && _bits(p.mask) < 2) paidBigWithoutTwo++;
                if (p.repeat && !p.cleared) paidRepeatUncleared++;
                if (!mTrusted) paidWhileUntrusted++;
                nAllowed++;
                if (p.amt > mThr) nAllowedWithApprovals++;
                if (p.repeat) nAllowedClearedRepeat++;
            } else {
                nBlocked++;
                if (!mTrusted) nBlockedUntrusted++;
                for (uint256 i; i < 5; ++i) if (p.failed == 1 << i) stoppedAlone[i]++;
            }
            _apply(token, to, amount, p);
        } catch (bytes memory err) {
            nReverted++;
            if (p.reverts) revertWhy[p.why]++;
            if (!p.reverts) {
                _mismatch(
                    string.concat(
                        "the wallet reverted a payment the spec says goes through: ", vm.toString(err), " amount ",
                        vm.toString(amount), " allowed ", p.allowed ? "yes" : "no", " fee ", vm.toString(p.fee),
                        " feeBalance ", vm.toString(reg.feeBalance(address(w))), " trusted ", mTrusted ? "yes" : "no"
                    )
                );
            }
        }
    }

    /// @dev The spec: each socket's meaning, the wallet's daily budgets, and what reverts.
    function _predict(address token, address to, uint256 amount) internal view returns (Pre memory p) {
        uint256 t = block.timestamp;
        uint32 today = _today();
        bool sameDay = mCounterDay == today;
        p.amt = token == address(usdt) ? _q(amount) : 255; // another token reads as saturated: fails closed
        p.listed = mAdded[to] != 0;
        if (p.listed) p.age = (t - mAdded[to]) / 1 hours > 255 ? 255 : uint8((t - mAdded[to]) / 1 hours);
        p.mask = _validMask(token, to, amount);
        p.rk = keccak256(abi.encode(token, to, amount));
        p.repeat = mLastPaid[p.rk] != 0 && t < uint256(mLastPaid[p.rk]) + uint256(mWin) * 1 hours;
        p.cleared = t <= mClearedUntil[p.rk];

        if (mPaused || (sameDay ? mDecToday : 0) >= mMaxDec) {
            p.reverts = true;
            p.why = mPaused ? 0 : 1;
            return p;
        }
        if (mTrusted) {
            uint256 spentPin = _q(mSpentDay == today ? mSpent : 0);
            bool capOk = spentPin + p.amt <= mCap; // spent + amount fits the cap
            bool payeeOk = p.listed && (p.age >= mCool || p.amt <= mTrial); // saved; cooled off or a trial
            bool breakerOk = !mBlown && p.listed; // a stranger trips it, and it stays blown
            bool approvalOk = p.amt <= mThr || _bits(p.mask) >= 2; // small, or two of three signed
            bool repeatOk = !p.repeat || p.cleared; // not the same payment again, unless cleared
            p.allowed = capOk && payeeOk && breakerOk && approvalOk && repeatOk;
            p.failed = (capOk ? 0 : 1) | (payeeOk ? 0 : 2) | (breakerOk ? 0 : 4) | (approvalOk ? 0 : 8) | (repeatOk ? 0 : 16);
            for (uint256 i; i < 5; ++i) p.fee += mFee[i] < mMaxFee[i] ? mFee[i] : mMaxFee[i];
        }
        // an untrusted processor: every fuse fails closed, nothing is charged
        if (!p.allowed && (sameDay ? mBlkToday : 0) >= mMaxBlk) (p.reverts, p.why) = (true, 2);
        else if (p.fee > reg.feeBalance(address(w))) (p.reverts, p.why) = (true, 3);
        else if (p.allowed && amount > usdt.balanceOf(address(w))) (p.reverts, p.why) = (true, 4);
    }

    function _apply(address token, address to, uint256 amount, Pre memory p) internal {
        uint32 today = _today();
        if (mCounterDay != today) {
            mCounterDay = today;
            mDecToday = 0;
            mBlkToday = 0;
        }
        mDecToday++;
        decisions++;
        if (mTrusted && !p.listed) mBlown = true; // the breaker steps on every decision it answers
        if (!p.allowed) {
            mBlkToday++;
            return;
        }
        if (token == address(usdt)) {
            if (mSpentDay != today) {
                mSpentDay = today;
                mSpent = 0;
            }
            mSpent += amount;
            paidOut += amount;
            paidToday += amount;
        }
        if (p.mask != 0) delete mAppr[_intent(token, to, amount)]; // approvals are used up
        mLastPaid[p.rk] = uint64(block.timestamp);
        if (p.cleared) delete mClearedUntil[p.rk]; // so is a repeat clearance
    }

    // =====================================================================================================
    // Approvers, freeze
    // =====================================================================================================

    function approve(uint256 whoSeed, uint256 toSeed, uint256 amountSeed) external {
        _approve(pool[whoSeed % 4], payees[toSeed % payees.length], AMOUNTS[amountSeed % AMOUNTS.length]);
    }

    function _approve(address who, address to, uint256 amount) internal {
        int256 k = _seat(who);
        vm.prank(who);
        try w.approvePayment(address(usdt), to, amount) {
            if (k < 0) return _unauthorized("someone without a seat approved a payment");
            Appr storage a = mAppr[_intent(address(usdt), to, amount)];
            if (a.mask != 0 && block.timestamp > a.expires) a.mask = 0;
            if (a.mask == 0) a.expires = uint64(block.timestamp + mTtl);
            a.mask |= uint8(1 << uint256(k));
        } catch {
            if (k >= 0) _mismatch("a seated approver could not approve");
        }
    }

    function revoke(uint256 whoSeed, uint256 toSeed, uint256 amountSeed) external {
        address who = pool[whoSeed % 4];
        address to = payees[toSeed % payees.length];
        uint256 amount = AMOUNTS[amountSeed % AMOUNTS.length];
        int256 k = _seat(who);
        vm.prank(who);
        try w.revokeApproval(address(usdt), to, amount) {
            if (k < 0) return _unauthorized("someone without a seat revoked an approval");
            mAppr[_intent(address(usdt), to, amount)].mask &= ~uint8(1 << uint256(k));
        } catch {
            if (k >= 0) _mismatch("a seated approver could not revoke");
        }
    }

    /// @notice Owner, agents and seated approvers may freeze; anyone else is refused.
    function freeze(uint256 whoSeed) external {
        address who = [owner, agent, pool[(whoSeed / 4) % 4], attacker][whoSeed % 4];
        bool may = who == owner || who == agent || _seat(who) >= 0;
        vm.prank(who);
        try w.freeze() returns (uint256 latched) {
            if (!may) return _unauthorized("someone without the right froze the wallet");
            nFreezes++;
            mFrozen = true;
            if (mTrusted) {
                mBlown = true;
                if (latched != 1) _mismatch("freeze did not latch the breaker");
            } else {
                mPaused = true; // no breaker can be stepped: the freeze pauses instead
                if (latched != 0 || !w.paused()) _mismatch("freeze with no working breaker did not pause");
            }
        } catch {
            if (may) _mismatch("an allowed freeze reverted");
        }
    }

    // =====================================================================================================
    // The owner
    // =====================================================================================================

    function ownerUnfreeze() external {
        vm.prank(owner);
        try w.unfreeze() {
            if (!mTrusted) _mismatch("unfreeze stepped an untrusted breaker");
            mBlown = false;
            mFrozen = false;
        } catch {
            if (mTrusted) _mismatch("unfreeze reverted with a working breaker");
        }
    }

    function ownerSetPaused(bool paused_) external {
        vm.prank(owner);
        w.setPaused(paused_);
        mPaused = paused_;
        if (!paused_) mFrozen = false;
    }

    function ownerSavePayee(uint256 seed) external {
        address p = payees[seed % 3]; // never the scammer
        vm.prank(owner);
        try w.addPayee(p) {
            if (mAdded[p] != 0) _mismatch("a saved payee was saved twice");
            mAdded[p] = uint64(block.timestamp);
        } catch {
            if (mAdded[p] == 0) _mismatch("saving a new payee reverted");
        }
    }

    function ownerRemovePayee(uint256 seed) external {
        address p = payees[seed % 3];
        vm.prank(owner);
        w.removePayee(p);
        delete mAdded[p];
    }

    function ownerSetCap(uint256 seed) external {
        uint8[6] memory caps = [0, 5, 20, 50, 100, 254];
        uint8 cap = caps[seed % 6];
        vm.prank(owner);
        w.setFuseParams(CAP, Sockets.Params({token: address(usdt), unit: uint128(U), a: cap, b: 0}));
        mCap = cap;
        _rollDay();
        if (cap > maxCapToday) maxCapToday = cap;
    }

    function ownerSetPayeeRule(uint256 coolSeed, uint256 trialSeed) external {
        uint8[5] memory cools = [0, 1, 24, 72, 255];
        uint8[4] memory trials = [0, 2, 10, 254];
        uint8 c = cools[coolSeed % 5];
        uint8 tr = trials[trialSeed % 4];
        vm.prank(owner);
        w.setFuseParams(PAYEE, Sockets.Params({token: address(usdt), unit: uint128(U), a: c, b: tr}));
        (mCool, mTrial) = (c, tr);
    }

    function ownerSetThreshold(uint256 seed) external {
        uint8[4] memory ts = [0, 3, 20, 254];
        uint8 thr = ts[seed % 4];
        vm.prank(owner);
        w.setFuseParams(APPROVAL, Sockets.Params({token: address(usdt), unit: uint128(U), a: thr, b: 0}));
        mThr = thr;
    }

    function ownerSetRepeatWindow(uint256 seed) external {
        uint8[4] memory ws = [1, 6, 24, 254];
        uint8 win = ws[seed % 4];
        vm.prank(owner);
        w.setFuseParams(REPEAT, Sockets.Params({token: address(0), unit: 0, a: win, b: 0}));
        mWin = win;
    }

    function ownerClearRepeat(uint256 toSeed, uint256 amountSeed, bool clear) external {
        _clearRepeat(payees[toSeed % payees.length], AMOUNTS[amountSeed % AMOUNTS.length], clear);
    }

    function _clearRepeat(address to, uint256 amount, bool clear) internal {
        vm.prank(owner);
        w.clearRepeat(address(usdt), to, amount, clear);
        mClearedUntil[keccak256(abi.encode(address(usdt), to, amount))] = clear ? uint64(block.timestamp + mTtl) : 0;
    }

    function ownerSetApprovers(uint256 seed) external {
        address[3][4] memory cfgs = [
            [pool[0], pool[1], pool[2]],
            [pool[1], pool[2], pool[3]],
            [pool[0], address(0), pool[2]],
            [pool[2], pool[0], pool[1]]
        ];
        address[3] memory s = cfgs[seed % 4];
        vm.prank(owner);
        w.setApprovers(s);
        mSeats = s;
        mEpoch++; // every open approval is void
    }

    function ownerSetTtl(uint256 seed) external {
        uint32[3] memory ts = [uint32(1 hours), 6 hours, 1 days];
        uint32 ttl = ts[seed % 3];
        vm.prank(owner);
        w.setApprovalTtl(ttl);
        mTtl = ttl;
    }

    function ownerSetLimits(uint256 decSeed, uint256 blkSeed) external {
        uint32[4] memory ds = [uint32(2), 12, 100, 100];
        uint32[4] memory bs = [uint32(1), 5, 20, 20];
        (uint32 d, uint32 b) = (ds[decSeed % 4], bs[blkSeed % 4]);
        vm.prank(owner);
        w.setDailyLimits(d, b);
        (mMaxDec, mMaxBlk) = (d, b);
    }

    function ownerSetMaxFee(uint256 slotSeed, uint256 seed) external {
        uint256 slot = slotSeed % 5;
        uint256 base = reg.feeOf(fuseIds[slot]);
        uint96[4] memory fs = [uint96(0), uint96(base / 2), uint96(base), uint96(base * 3)];
        uint96 m = fs[seed % 4];
        vm.prank(owner);
        w.setFuseMaxFee(slot, m);
        mMaxFee[slot] = m;
    }

    function ownerMoveFunds(uint256 seed) external {
        uint256 bal = usdt.balanceOf(address(w));
        // now and then nearly everything, so the agent's next payment can't be covered
        uint256 amount = seed % 4 == 0 ? (bal > U ? bal - U : 0) : bound(seed, 0, bal / 4);
        vm.prank(owner);
        w.execute(address(usdt), 0, abi.encodeCall(IERC20.transfer, (owner, amount)));
        movedOut += amount;
    }

    function ownerWithdrawFees(uint256 seed) external {
        uint256 bal = reg.feeBalance(address(w));
        // now and then all but a few decisions' worth, so the fee balance runs dry
        uint256 amount = seed % 3 == 0 ? (bal > 8_000 ? bal - 8_000 : 0) : bound(seed, 0, bal / 2);
        vm.prank(owner);
        w.withdrawFeeBalance(amount, owner);
    }

    function ownerTopUpFees(uint256 seed) external {
        uint256 amount = bound(seed, 0, 2 * U);
        if (seed % 5 == 0) usdt.mint(address(w), 200 * U); // and refill the wallet itself
        if (seed % 5 == 0) startTopUps += 200 * U;
        usdt.mint(owner, amount);
        vm.prank(owner);
        reg.deposit(address(w), amount);
    }

    // =====================================================================================================
    // Scenarios: the deep paths random single calls rarely line up
    // =====================================================================================================

    /// Two seated approvers sign one exact payment above the threshold, then the agent sends it.
    function approvedBigPayment(uint256 toSeed, uint256 amountSeed, uint256 pairSeed) external {
        address to = payees[toSeed % 4 == 0 ? 1 : 0]; // mostly the supplier, sometimes the fresh payee
        uint256 amount = [10 * U, 20 * U + 1, 25 * U, 50 * U][amountSeed % 4];
        uint256 a = pairSeed % 3;
        _approve(mSeats[a] == address(0) ? pool[3] : mSeats[a], to, amount);
        uint256 b = (a + 1 + (pairSeed / 3) % 2) % 3;
        _approve(mSeats[b] == address(0) ? pool[3] : mSeats[b], to, amount);
        _pay(address(usdt), to, amount);
    }

    /// An approved payment goes out; later, past the Repeat Guard's window but before the approval would have
    /// expired, the agent sends the same payment again. The approval was used up: it must be refused.
    function approvedPaymentAgain(uint256 toSeed, uint256 amountSeed, uint256 pairSeed) external {
        address to = payees[toSeed % 4 == 0 ? 1 : 0];
        uint256 amount = [20 * U + 1, 25 * U][amountSeed % 2];
        uint256 a = pairSeed % 3;
        uint256 b = (a + 1 + (pairSeed / 3) % 2) % 3;
        _approve(mSeats[a] == address(0) ? pool[3] : mSeats[a], to, amount);
        _approve(mSeats[b] == address(0) ? pool[3] : mSeats[b], to, amount);
        _pay(address(usdt), to, amount);
        uint256 gap = uint256(mWin) * 1 hours + 1 minutes;
        if (gap >= mTtl) gap = mTtl > 2 minutes ? mTtl - 1 minutes : 1 minutes;
        vm.warp(block.timestamp + gap);
        _rollDay();
        _pay(address(usdt), to, amount);
    }

    /// The same invoice twice: the second one inside the window must be refused.
    function sameInvoiceTwice(uint256 toSeed, uint256 amountSeed) external {
        address to = payees[toSeed % payees.length];
        uint256 amount = AMOUNTS[amountSeed % 8]; // small enough to pass the other fuses
        _pay(address(usdt), to, amount);
        vm.warp(block.timestamp + 10 minutes);
        _pay(address(usdt), to, amount);
    }

    /// The owner clears one repeat of a payment that just went out; the agent sends it again.
    function clearedRepeat(uint256 toSeed, uint256 amountSeed) external {
        address to = payees[toSeed % payees.length];
        uint256 amount = AMOUNTS[amountSeed % 8];
        _pay(address(usdt), to, amount);
        _clearRepeat(to, amount, true);
        _pay(address(usdt), to, amount);
        _pay(address(usdt), to, amount); // the clearance was used up: this one must be refused
    }

    // =====================================================================================================
    // Designer, TapeOut, registry admin, the clock
    // =====================================================================================================

    function designerSetFee(uint256 slotSeed, uint256 seed) external {
        uint256 slot = slotSeed % 5;
        uint96[5] memory base = [uint96(1_000), 2_000, 500, 1_500, 300];
        uint96[4] memory fs = [uint96(0), base[slot] / 2, base[slot], base[slot] * 5];
        uint96 fee = fs[seed % 4];
        vm.prank(designer);
        try reg.setFee(fuseIds[slot], fee) {
            if (!mTrusted) _mismatch("a fee changed through an untrusted processor");
            mFee[slot] = fee;
        } catch {
            if (mTrusted) _mismatch("the designer could not reprice");
        }
    }

    function designerClaim(uint256 slotSeed) external {
        vm.prank(designer);
        try reg.claim(fuseIds[slotSeed % 5], designer) {
            if (!mTrusted) _mismatch("earnings claimed through an untrusted processor");
        } catch {
            if (mTrusted) _mismatch("the designer could not claim");
        }
    }

    function adminClaimProtocol() external {
        vm.prank(admin);
        reg.claimProtocol(admin);
    }

    /// @notice TapeOut upgrades its processors to an implementation nobody attested, or back.
    function tapeoutUpgrade(bool toTrusted) external {
        beacon.upgradeTo(toTrusted ? trustedImpl : badImpl);
        mTrusted = toTrusted;
    }

    function warp(uint256 seed) external {
        vm.warp(block.timestamp + bound(seed, 1 minutes, 3 days));
        _rollDay();
    }

    // =====================================================================================================
    // Everyone who must be refused
    // =====================================================================================================

    /// @notice A hijacked agent, an approver, a former approver or a stranger tries what only the owner (or only
    ///         the agent, or only a seated approver, or only the designer) may do. Every attempt must revert.
    function attack(uint256 whoSeed, uint256 what) external {
        address[3] memory cast = [agent, pool[(whoSeed / 3) % 4], attacker];
        address who = cast[whoSeed % 3];
        address target = address(w);
        bytes memory data;
        uint256 k = what % 19;
        if (k == 0) {
            data = abi.encodeCall(
                FuseboxWallet.execute,
                (address(usdt), 0, abi.encodeCall(IERC20.transfer, (who, usdt.balanceOf(address(w)))))
            );
        } else if (k == 1) {
            data = abi.encodeCall(FuseboxWallet.setPaused, (false));
        } else if (k == 2) {
            data = abi.encodeCall(FuseboxWallet.unfreeze, ());
        } else if (k == 3) {
            data = abi.encodeCall(FuseboxWallet.addPayee, (who));
        } else if (k == 4) {
            data = abi.encodeCall(FuseboxWallet.setApprovers, ([who, address(0), address(0)]));
        } else if (k == 5) {
            data = abi.encodeCall(FuseboxWallet.clearRepeat, (address(usdt), who, U, true));
        } else if (k == 6) {
            data = abi.encodeCall(FuseboxWallet.withdrawFeeBalance, (1, who));
        } else if (k == 7) {
            data = abi.encodeCall(
                FuseboxWallet.setFuseParams, (CAP, Sockets.Params({token: address(usdt), unit: uint128(U), a: 254, b: 0}))
            );
        } else if (k == 8) {
            data = abi.encodeCall(FuseboxWallet.removeFuse, (CAP));
        } else if (k == 9) {
            data = abi.encodeCall(FuseboxWallet.setAgent, (who, true));
        } else if (k == 10) {
            data = abi.encodeCall(FuseboxWallet.transferOwnership, (who));
        } else if (k == 11) {
            data = abi.encodeCall(FuseboxWallet.setDailyLimits, (type(uint32).max, type(uint32).max));
        } else if (k == 12) {
            data = abi.encodeCall(FuseboxWallet.pulse, (BREAKER, false, true));
        } else if (k == 13) {
            data = abi.encodeCall(FuseboxWallet.setFuseMaxFee, (CAP, type(uint96).max));
        } else if (k == 14) {
            if (who == agent) who = attacker; // only the agent may pay
            data = abi.encodeCall(FuseboxWallet.pay, (address(usdt), who, U, "let me"));
        } else if (k == 15) {
            if (_seat(who) >= 0) who = attacker; // only a seated approver may approve
            data = abi.encodeCall(FuseboxWallet.approvePayment, (address(usdt), who, 300 * U));
        } else if (k == 16) {
            target = address(reg); // a fee balance can only be withdrawn by its own account
            data = abi.encodeCall(FuseRegistry.withdraw, (reg.feeBalance(address(w)) + 1, who));
        } else if (k == 17) {
            target = address(reg); // earnings go only to the circuit's owner
            data = abi.encodeCall(FuseRegistry.claim, (fuseIds[whoSeed % 5], who));
        } else {
            target = address(reg); // only the circuit's owner may reprice
            data = abi.encodeCall(FuseRegistry.setFee, (fuseIds[whoSeed % 5], type(uint96).max));
        }
        vm.prank(who);
        (bool ok,) = target.call(data);
        if (ok) _unauthorized(string.concat("attack ", vm.toString(k), " succeeded"));
    }

    // =====================================================================================================
    // Helpers
    // =====================================================================================================

    function _rollDay() internal {
        uint32 today = _today();
        if (today != payDay) {
            payDay = today;
            paidToday = 0;
            maxCapToday = mCap;
        }
    }

    function _today() internal view returns (uint32) {
        return uint32(block.timestamp / 1 days);
    }

    /// ceil(amount / 1 USD₮0), saturating at 255
    function _q(uint256 amount) internal pure returns (uint8) {
        if (amount == 0) return 0;
        uint256 q = (amount + U - 1) / U;
        return q > 255 ? 255 : uint8(q);
    }

    function _bits(uint8 m) internal pure returns (uint256 n) {
        for (uint256 i; i < 3; ++i) n += (m >> i) & 1;
    }

    function _intent(address token, address to, uint256 amount) internal view returns (bytes32) {
        return keccak256(abi.encode(mEpoch, token, to, amount));
    }

    function _validMask(address token, address to, uint256 amount) internal view returns (uint8) {
        Appr memory a = mAppr[_intent(token, to, amount)];
        return a.mask == 0 || block.timestamp > a.expires ? 0 : a.mask;
    }

    function _seat(address who) internal view returns (int256) {
        if (who == address(0)) return -1;
        for (uint256 i; i < 3; ++i) {
            if (mSeats[i] == who) return int256(i);
        }
        return -1;
    }

    function _mismatch(string memory why) internal {
        if (mismatches == 0) firstMismatch = why;
        mismatches++;
    }

    function _unauthorized(string memory why) internal {
        if (unauthorized == 0) firstUnauthorized = why;
        unauthorized++;
    }
}

/// @notice The wallet's promises, checked after every call of every random sequence.
contract WalletInvariants is Base {
    WalletHandler internal h;
    uint256 internal startUsdt;
    uint256 internal startNative;

    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        wallet.addFuse(fuseIds[FuseFixtures.REPEAT_GUARD], repeatParams(6), FEE_REPEAT);
        h = new WalletHandler(
            WalletHandler.Env({
                wallet: wallet,
                registry: registry,
                usdt: usdt,
                beacon: beacon,
                trustedImpl: impl,
                owner: owner,
                agent: agent,
                designer: designer,
                admin: admin,
                supplier: supplier,
                approvers: [approver1, approver2, approver3],
                fuseIds: fuseIds
            })
        );
        startUsdt = usdt.balanceOf(address(wallet));
        startNative = address(wallet).balance;
        targetContract(address(h));
        // weights: a selector listed n times is picked n times as often
        bytes4[] memory sel = new bytes4[](64);
        uint256 n;
        for (uint256 i; i < 8; ++i) sel[n++] = WalletHandler.pay.selector;
        for (uint256 i; i < 3; ++i) sel[n++] = WalletHandler.approvedBigPayment.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.sameInvoiceTwice.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.approvedPaymentAgain.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.clearedRepeat.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.approve.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.warp.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.ownerUnfreeze.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.attack.selector;
        bytes4[19] memory once = [
            WalletHandler.revoke.selector,
            WalletHandler.freeze.selector,
            WalletHandler.ownerSetPaused.selector,
            WalletHandler.ownerSavePayee.selector,
            WalletHandler.ownerRemovePayee.selector,
            WalletHandler.ownerSetCap.selector,
            WalletHandler.ownerSetPayeeRule.selector,
            WalletHandler.ownerSetThreshold.selector,
            WalletHandler.ownerSetRepeatWindow.selector,
            WalletHandler.ownerClearRepeat.selector,
            WalletHandler.ownerSetApprovers.selector,
            WalletHandler.ownerSetTtl.selector,
            WalletHandler.ownerSetLimits.selector,
            WalletHandler.ownerSetMaxFee.selector,
            WalletHandler.ownerMoveFunds.selector,
            WalletHandler.ownerWithdrawFees.selector,
            WalletHandler.ownerTopUpFees.selector,
            WalletHandler.designerSetFee.selector,
            WalletHandler.tapeoutUpgrade.selector
        ];
        for (uint256 i; i < once.length; ++i) sel[n++] = once[i];
        sel[n++] = WalletHandler.designerClaim.selector;
        sel[n++] = WalletHandler.adminClaimProtocol.selector;
        assembly ("memory-safe") {
            mstore(sel, n)
        }
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
    }

    /// Every promise above, at once.
    function _checkAll() internal view {
        invariant_wallet_matches_the_spec();
        invariant_daily_cap_is_never_exceeded();
        invariant_only_saved_payees_get_paid();
        invariant_breaker_and_freeze_stop_everything();
        invariant_big_payments_need_two_approvals();
        invariant_no_repeat_without_clearance();
        invariant_untrusted_processor_fails_closed();
        invariant_nobody_exceeds_their_role();
        invariant_money_is_conserved();
        invariant_fees_never_exceed_what_was_accepted();
        invariant_registry_is_solvent();
        invariant_decisions_add_up();
    }

    /// Long walks: 8 fixed seeds × 600 steps, every promise checked after every step, and every deep path
    /// (approved big payments, cleared repeats, refused repeats, the untrusted processor, freezes, reverts)
    /// must actually have been exercised, so a green run can't mean "never got there".
    function test_long_walks_reach_every_path_and_keep_every_promise() public {
        // 4,800 steps in one test transaction add up past the block gas limit; each payment still gets full gas
        vm.pauseGasMetering();
        uint256[8] memory total;
        uint256[5] memory why;
        uint256[5] memory alone;
        for (uint256 walk; walk < 8; ++walk) {
            uint256 snap = vm.snapshotState();
            uint256 seed = uint256(keccak256(abi.encode("walk", walk)));
            for (uint256 step; step < 600; ++step) {
                seed = uint256(keccak256(abi.encode(seed)));
                _step(seed);
                _checkAll();
            }
            total[0] += h.nAllowed();
            total[1] += h.nBlocked();
            total[2] += h.nReverted();
            total[3] += h.nAllowedWithApprovals();
            total[4] += h.nAllowedClearedRepeat();
            total[5] += h.nBlockedUntrusted();
            total[6] += h.nFreezes();
            total[7] += h.decisions();
            for (uint256 i; i < 5; ++i) why[i] += h.revertWhy(i);
            for (uint256 i; i < 5; ++i) alone[i] += h.stoppedAlone(i);
            vm.revertToState(snap);
        }
        console.log(
            string.concat(
                "4800 steps: ", vm.toString(total[7]), " decisions, ", vm.toString(total[0]), " allowed, ",
                vm.toString(total[1]), " blocked, ", vm.toString(total[2]), " reverted; ", vm.toString(total[3]),
                " approved big payments, ", vm.toString(total[4]), " cleared repeats, ", vm.toString(total[5]),
                " blocked by an untrusted processor, ", vm.toString(total[6]), " freezes"
            )
        );
        console.log(
            string.concat(
                "reverts: paused ", vm.toString(why[0]), ", decision budget ", vm.toString(why[1]), ", blocked budget ",
                vm.toString(why[2]), ", fee balance ", vm.toString(why[3]), ", wallet balance ", vm.toString(why[4])
            )
        );
        console.log(
            string.concat(
                "stopped alone: daily cap ", vm.toString(alone[0]), ", payee guard ", vm.toString(alone[1]), ", breaker ",
                vm.toString(alone[2]), ", two of three ", vm.toString(alone[3]), ", repeat guard ", vm.toString(alone[4])
            )
        );
        for (uint256 i; i < 5; ++i) assertGt(alone[i], 0, string.concat("fuse never stopped a payment alone: ", vm.toString(i)));
        for (uint256 i; i < 5; ++i) assertGt(why[i], 0, string.concat("revert path never exercised: ", vm.toString(i)));
        for (uint256 i; i < 7; ++i) assertGt(total[i], 0, string.concat("path never exercised: ", vm.toString(i)));
    }

    function _step(uint256 r) internal {
        uint256 a = r % 100;
        uint256 x = r >> 8;
        uint256 y = r >> 72;
        uint256 z = r >> 136;
        if (a < 22) h.pay(x, y, z);
        else if (a < 27) h.approvedBigPayment(x, y, z);
        else if (a < 30) h.approvedPaymentAgain(x, y, z);
        else if (a < 34) h.sameInvoiceTwice(x, y);
        else if (a < 38) h.clearedRepeat(x, y);
        else if (a < 42) h.approve(x, y, z);
        else if (a < 44) h.revoke(x, y, z);
        else if (a < 49) h.warp(x);
        else if (a < 50) h.freeze(x);
        else if (a < 56) h.ownerUnfreeze();
        else if (a < 59) h.ownerSetPaused(x % 6 == 0);
        else if (a < 62) h.ownerSavePayee(x);
        else if (a < 63) h.ownerRemovePayee(x);
        else if (a < 65) h.ownerSetCap(x);
        else if (a < 67) h.ownerSetPayeeRule(x, y);
        else if (a < 69) h.ownerSetThreshold(x);
        else if (a < 70) h.ownerSetRepeatWindow(x);
        else if (a < 72) h.ownerClearRepeat(x, y, z % 4 != 0);
        else if (a < 73) h.ownerSetApprovers(x);
        else if (a < 74) h.ownerSetTtl(x);
        else if (a < 75) h.ownerSetLimits(x, y);
        else if (a < 76) h.pay(x, y, z);
        else if (a < 78) h.ownerSetMaxFee(x, y);
        else if (a < 79) h.ownerMoveFunds(x);
        else if (a < 80) h.ownerWithdrawFees(x);
        else if (a < 82) h.ownerTopUpFees(x);
        else if (a < 84) h.designerSetFee(x, y);
        else if (a < 85) h.designerClaim(x);
        else if (a < 86) h.adminClaimProtocol();
        else if (a < 89) h.tapeoutUpgrade(x % 4 != 0);
        else h.attack(x, y);
    }

    /// The wallet, running the real circuits, decides every payment exactly as the spec says, charges exactly
    /// the spec's fee, and reverts exactly when the spec says it must.
    function invariant_wallet_matches_the_spec() public view {
        assertEq(h.mismatches(), 0, h.firstMismatch());
    }

    /// No more than the cap (the highest it was set to that day) leaves in one UTC day.
    function invariant_daily_cap_is_never_exceeded() public view {
        assertLe(h.paidToday(), uint256(h.maxCapToday()) * USDT);
    }

    /// Only saved payees are paid; one still cooling off gets no more than the trial amount.
    function invariant_only_saved_payees_get_paid() public view {
        assertEq(h.paidToUnsaved(), 0, "paid someone who isn't saved");
        assertEq(h.paidCoolingOverTrial(), 0, "paid a cooling-off payee more than the trial");
    }

    /// A blown breaker, or any freeze, stops every payment until the owner unfreezes or unpauses.
    function invariant_breaker_and_freeze_stop_everything() public view {
        assertEq(h.paidPastBreaker(), 0, "paid past a blown breaker");
        assertEq(h.paidWhileFrozen(), 0, "paid while frozen");
    }

    /// Above the threshold, two of the three seated approvers signed this exact payment, and it was still valid.
    function invariant_big_payments_need_two_approvals() public view {
        assertEq(h.paidBigWithoutTwo(), 0);
    }

    /// The same (token, payee, amount) inside the window goes out again only on the owner's clearance.
    function invariant_no_repeat_without_clearance() public view {
        assertEq(h.paidRepeatUncleared(), 0);
    }

    /// When TapeOut's processor runs an unattested implementation, nothing is paid and nothing is charged.
    function invariant_untrusted_processor_fails_closed() public view {
        assertEq(h.paidWhileUntrusted(), 0, "paid through an untrusted processor");
        assertEq(h.chargedWhileUntrusted(), 0, "charged for an untrusted processor");
    }

    /// The agent can only pay; only seated approvers approve; only the owner changes anything or moves funds;
    /// only the circuit owner claims or reprices; nobody withdraws another account's fee balance.
    function invariant_nobody_exceeds_their_role() public view {
        assertEq(h.unauthorized(), 0, h.firstUnauthorized());
    }

    /// Every USD₮0 that left the wallet went through an allowed payment or the owner's own transfer; no native
    /// OKB ever left (the fuses read another token as a saturated amount).
    function invariant_money_is_conserved() public view {
        assertEq(usdt.balanceOf(address(wallet)), startUsdt + h.startTopUps() - h.paidOut() - h.movedOut());
        assertEq(address(wallet).balance, startNative);
    }

    /// A decision never costs more than the fees the owner accepted, whatever the designer sets.
    function invariant_fees_never_exceed_what_was_accepted() public view {
        assertEq(h.overcharged(), 0);
    }

    /// The registry holds every token it owes: fee balances, unclaimed earnings and the protocol's share.
    function invariant_registry_is_solvent() public view {
        uint256 owed = registry.feeBalance(address(wallet)) + registry.protocolEarned();
        for (uint256 i; i < 5; ++i) owed += registry.earned(fuseIds[i]);
        assertEq(registry.totalOwed(), owed, "totalOwed is not the sum of what is owed");
        assertGe(usdt.balanceOf(address(registry)), registry.totalOwed(), "the registry can't pay what it owes");
    }

    /// Every recorded decision is allowed or blocked, and the wallet recorded exactly the decisions made.
    function invariant_decisions_add_up() public view {
        assertEq(wallet.decisionCount(), wallet.allowedCount() + wallet.blockedCount());
        assertEq(wallet.decisionCount(), h.decisions());
    }

    function afterInvariant() public view {
        if (vm.envOr("FUSEBOX_INVARIANT_SUMMARY", false)) {
            console.log(
                string.concat(
                    "summary allowed=", vm.toString(h.nAllowed()), " blocked=", vm.toString(h.nBlocked()),
                    " reverted=", vm.toString(h.nReverted()), " bigWithApprovals=", vm.toString(h.nAllowedWithApprovals()),
                    " clearedRepeats=", vm.toString(h.nAllowedClearedRepeat()), " blockedUntrusted=",
                    vm.toString(h.nBlockedUntrusted()), " freezes=", vm.toString(h.nFreezes())
                )
            );
        }
    }
}
