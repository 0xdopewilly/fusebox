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

/// @notice Plays every role against one FuseboxWallet running the shipped fuses (the real netlists, on a TAP-02
///         processor): two agents paying (one may be switched off), two owners handing the wallet over, three
///         approver seats and a former approver, the designer repricing, TapeOut upgrading its processor, an
///         attacker, and the clock. The owner can remove fuses, reinstall them (duplicates too, up to 8), and
///         change what each one measures, including switching a cap to native OKB.
///
///         Alongside, it keeps its own model of the wallet, one entry per installed slot, written from the socket
///         definitions rather than from the wallet's code. Before every payment the model predicts allow / block /
///         revert and the exact fee; the wallet must agree, and after every call its stored state must match the
///         model's. Each promise is also counted directly, so the invariants read as the promises themselves.
contract WalletHandler is Test {
    uint256 internal constant U = 1e6; // one USD₮0
    // slot kinds, by shipped-fuse index (fuseIds[kind])
    uint8 internal constant CAP = 0;
    uint8 internal constant PAYEE = 1;
    uint8 internal constant BREAKER = 2;
    uint8 internal constant APPROVAL = 3;
    uint8 internal constant REPEAT = 4;

    struct Env {
        FuseboxWallet wallet;
        FuseRegistry registry;
        MockUSDT0 usdt;
        MockBeacon beacon;
        address trustedImpl;
        address[2] owners; // owners[0] owns the wallet at the start
        address[2] agents; // agents[0] is an agent at the start
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
    address internal immutable designer;
    address internal immutable admin;
    address internal immutable attacker = makeAddr("attacker");
    uint256[5] internal fuseIds;
    address[2] internal owners;
    address[2] internal agents;
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

    /// one installed fuse, as the model sees it
    struct MSlot {
        uint8 kind;
        address token;
        uint128 unit;
        uint8 a;
        uint8 b;
        uint256 maxFee;
        uint256 spent; // CAP: raw spend on spentDay
        uint32 spentDay;
        bool blown; // BREAKER: the latch
        // CAP promise: what left through this slot since its spend last reset, against the highest cap*unit since
        uint32 epochDay;
        uint256 epochPaid;
        uint256 epochLimit;
    }

    MSlot[] internal mStack;
    address internal curOwner;
    address internal pending;
    mapping(address => bool) internal mIsAgent;
    mapping(address => uint64) internal mAdded;
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
    uint256[5] internal mFee; // the designer's current fee, by kind
    /// a freeze happened and the owner hasn't unfrozen, unpaused or removed a breaker since
    bool internal mFrozen;

    // ------------------------------------------------------------------ ghosts read by the invariants
    uint256 public paidOut; // USD₮0 that left through pay
    uint256 public paidOutNative; // OKB that left through pay
    uint256 public movedOut; // USD₮0 the owner moved out with execute
    uint256 public toppedUp; // USD₮0 minted into the wallet during the run
    uint256 public decisions;

    uint256 public mismatches;
    string public firstMismatch;
    uint256 public capOverruns;
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

    // coverage, for the long walks
    uint256 public nAllowed;
    uint256 public nBlocked;
    uint256 public nReverted;
    uint256 public nAllowedWithApprovals;
    uint256 public nAllowedClearedRepeat;
    uint256 public nBlockedUntrusted;
    uint256 public nFreezes;
    uint256 public nReinstalls;
    uint256 public nRemovals;
    uint256 public nHandovers;
    uint256 public nPaidBySecondAgent;
    uint256 public nNativePaid;
    uint256 public nMeasureChanges;
    /// predicted reverts: paused, decision budget, blocked budget, fee balance, wallet balance, not an agent, no fuses
    uint256[7] public revertWhy;
    /// payments stopped by one fuse alone (every other installed fuse said yes), by kind
    uint256[5] public stoppedAlone;

    constructor(Env memory e) {
        w = e.wallet;
        reg = e.registry;
        usdt = e.usdt;
        beacon = e.beacon;
        trustedImpl = e.trustedImpl;
        designer = e.designer;
        admin = e.admin;
        fuseIds = e.fuseIds;
        owners = e.owners;
        agents = e.agents;
        pool = [e.approvers[0], e.approvers[1], e.approvers[2], makeAddr("formerApprover")];
        payees = [e.supplier, makeAddr("freshPayee"), makeAddr("stranger"), makeAddr("scammer")];
        // the starting state, read once from the wallet as the test set it up
        curOwner = w.owner();
        for (uint256 i; i < 2; ++i) mIsAgent[agents[i]] = w.isAgent(agents[i]);
        mAdded[e.supplier] = w.payeeAddedAt(e.supplier);
        mSeats = e.approvers;
        mEpoch = w.approvalEpoch();
        mTtl = w.approvalTtl();
        for (uint256 k; k < 5; ++k) mFee[k] = reg.feeOf(fuseIds[k]);
        for (uint256 i; i < w.fuseCount(); ++i) {
            FuseboxWallet.Slot memory s = w.slotAt(i);
            MSlot storage m = mStack.push();
            m.kind = _kindOf(s.fuseId);
            (m.token, m.unit, m.a, m.b, m.maxFee) = (s.params.token, s.params.unit, s.params.a, s.params.b, s.maxFee);
            m.epochDay = _today();
            m.epochLimit = uint256(m.a) * m.unit;
        }
    }

    // =====================================================================================================
    // The agents
    // =====================================================================================================

    struct Pre {
        bool listed;
        uint8 age;
        uint8 mask;
        bytes32 rk;
        bool repeatSeen; // inside some installed Repeat Guard's window
        bool cleared;
        bool allowed;
        bool reverts;
        uint8 why;
        uint256 fee;
        uint256 accepted; // sum of the owner's accepted max fees
        int256 soleFail; // the one slot that said no, or -1
        uint256 nFail;
        // promises a payment would break if it went through
        bool vUnsaved;
        bool vCooling;
        bool vBlown;
        bool vBigNoTwo;
        bool vRepeat;
        bool bigApproved;
    }

    function pay(uint256 callerSeed, uint256 toSeed, uint256 amountSeed, uint256 tokenSeed) external {
        address token = tokenSeed % 12 == 0 ? address(0) : address(usdt); // now and then, native OKB
        uint256 r = toSeed % 16; // mostly the saved supplier, sometimes someone else
        _pay(agents[callerSeed % 5 == 0 ? 1 : 0], token, r < 13 ? payees[0] : payees[1 + r % 3], AMOUNTS[amountSeed % AMOUNTS.length]);
    }

    function _pay(address caller, address token, address to, uint256 amount) internal {
        Pre memory p = _predict(caller, token, to, amount);
        uint256 feeBefore = reg.feeBalance(address(w));
        bool frozenBefore = mFrozen;

        vm.prank(caller);
        try w.pay(token, to, amount, "fuzz") returns (bool allowed, uint256) {
            if (p.reverts) return _mismatch("the wallet decided a payment the spec says must revert");
            if (allowed != p.allowed) {
                return _mismatch(allowed ? "the wallet allowed a payment the spec blocks" : "the wallet blocked a payment the spec allows");
            }
            uint256 charged = feeBefore - reg.feeBalance(address(w));
            if (charged != p.fee) _mismatch("the fee differs from the spec");
            if (charged > p.accepted) overcharged++;
            if (!mTrusted && charged != 0) chargedWhileUntrusted++;

            if (allowed) {
                // the promises, each counted on its own
                if (p.vUnsaved) paidToUnsaved++;
                if (p.vCooling) paidCoolingOverTrial++;
                if (p.vBlown) paidPastBreaker++;
                if (frozenBefore) paidWhileFrozen++;
                if (p.vBigNoTwo) paidBigWithoutTwo++;
                if (p.vRepeat) paidRepeatUncleared++;
                if (!mTrusted) paidWhileUntrusted++;
                nAllowed++;
                if (p.bigApproved) nAllowedWithApprovals++;
                if (p.repeatSeen) nAllowedClearedRepeat++;
                if (caller == agents[1]) nPaidBySecondAgent++;
                if (token == address(0)) nNativePaid++;
            } else {
                nBlocked++;
                if (!mTrusted) nBlockedUntrusted++;
                if (p.nFail == 1) stoppedAlone[mStack[uint256(p.soleFail)].kind]++;
            }
            _apply(token, to, amount, p);
        } catch (bytes memory err) {
            nReverted++;
            if (p.reverts) revertWhy[p.why]++;
            else {
                _mismatch(
                    string.concat(
                        "the wallet reverted a payment the spec says goes through: ", vm.toString(err), " amount ",
                        vm.toString(amount), p.allowed ? " allowed" : " blocked"
                    )
                );
            }
        }
    }

    /// @dev The spec: each socket's meaning, slot by slot, the wallet's daily budgets, and what reverts.
    function _predict(address caller, address token, address to, uint256 amount) internal view returns (Pre memory p) {
        uint256 t = block.timestamp;
        uint32 today = _today();
        bool sameDay = mCounterDay == today;
        p.listed = mAdded[to] != 0;
        if (p.listed) p.age = (t - mAdded[to]) / 1 hours > 255 ? 255 : uint8((t - mAdded[to]) / 1 hours);
        p.mask = _validMask(token, to, amount);
        p.rk = keccak256(abi.encode(token, to, amount));
        p.cleared = t <= mClearedUntil[p.rk];
        p.soleFail = -1;
        for (uint256 i; i < mStack.length; ++i) p.accepted += mStack[i].maxFee;

        if (!mIsAgent[caller]) return _reverts(p, 5);
        if (mPaused) return _reverts(p, 0);
        if (mStack.length == 0) return _reverts(p, 6);
        if ((sameDay ? mDecToday : 0) >= mMaxDec) return _reverts(p, 1);

        p.allowed = true;
        for (uint256 i; i < mStack.length; ++i) {
            MSlot storage s = mStack[i];
            // amount fuses read another token as saturated, so it fails closed (breaker and repeat have no unit)
            uint8 amt = s.unit != 0 && token == s.token ? _q(amount, s.unit) : 255;
            bool ok;
            if (s.kind == CAP) {
                ok = uint256(_q(s.spentDay == today ? s.spent : 0, s.unit)) + amt <= s.a; // spent + amount fits
            } else if (s.kind == PAYEE) {
                ok = p.listed && (p.age >= s.a || amt <= s.b); // saved; cooled off, or within the trial
                if (!p.listed) p.vUnsaved = true;
                if (p.listed && p.age < s.a && amt > s.b) p.vCooling = true;
            } else if (s.kind == BREAKER) {
                ok = !s.blown && p.listed; // a stranger trips it, and it stays blown
                if (!p.listed) p.vUnsaved = true;
                if (s.blown) p.vBlown = true;
            } else if (s.kind == APPROVAL) {
                ok = amt <= s.a || _bits(p.mask) >= 2; // small, or two of three signed
                if (amt > s.a && _bits(p.mask) < 2) p.vBigNoTwo = true;
                if (amt > s.a && _bits(p.mask) >= 2) p.bigApproved = true;
            } else {
                bool rep = mLastPaid[p.rk] != 0 && t < uint256(mLastPaid[p.rk]) + uint256(s.a) * 1 hours;
                ok = !rep || p.cleared; // not the same payment again, unless cleared
                if (rep) p.repeatSeen = true;
                if (rep && !p.cleared) p.vRepeat = true;
            }
            if (mTrusted) {
                p.fee += mFee[s.kind] < s.maxFee ? mFee[s.kind] : s.maxFee;
                if (!ok) {
                    p.allowed = false;
                    p.nFail++;
                    p.soleFail = int256(i);
                }
            }
        }
        // an untrusted processor: every fuse fails closed, nothing is charged
        if (!mTrusted) p.allowed = false;
        if (!p.allowed && (sameDay ? mBlkToday : 0) >= mMaxBlk) return _reverts(p, 2);
        if (p.fee > reg.feeBalance(address(w))) return _reverts(p, 3);
        if (p.allowed && amount > (token == address(0) ? address(w).balance : usdt.balanceOf(address(w)))) {
            return _reverts(p, 4);
        }
    }

    function _reverts(Pre memory p, uint8 why) internal pure returns (Pre memory) {
        p.reverts = true;
        p.why = why;
        return p;
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
        if (mTrusted && !p.listed) {
            for (uint256 i; i < mStack.length; ++i) if (mStack[i].kind == BREAKER) mStack[i].blown = true;
        }
        if (!p.allowed) {
            mBlkToday++;
            return;
        }
        for (uint256 i; i < mStack.length; ++i) {
            MSlot storage s = mStack[i];
            if (s.kind != CAP || s.token != token) continue;
            if (s.spentDay != today) {
                s.spentDay = today;
                s.spent = 0;
            }
            s.spent += amount;
            if (s.epochDay != today) {
                s.epochDay = today;
                s.epochPaid = 0;
                s.epochLimit = uint256(s.a) * s.unit;
            }
            s.epochPaid += amount;
            if (s.epochPaid > s.epochLimit) capOverruns++;
        }
        if (token == address(0)) paidOutNative += amount;
        else paidOut += amount;
        if (p.mask != 0) delete mAppr[_intent(token, to, amount)]; // approvals are used up
        mLastPaid[p.rk] = uint64(block.timestamp);
        if (p.cleared) delete mClearedUntil[p.rk]; // so is a repeat clearance
    }

    // =====================================================================================================
    // Approvers, freeze
    // =====================================================================================================

    function approve(uint256 whoSeed, uint256 toSeed, uint256 amountSeed) external {
        _approve(pool[whoSeed % 4], address(usdt), payees[toSeed % payees.length], AMOUNTS[amountSeed % AMOUNTS.length]);
    }

    function _approve(address who, address token, address to, uint256 amount) internal {
        int256 k = _seat(who);
        vm.prank(who);
        try w.approvePayment(token, to, amount) {
            if (k < 0) return _unauthorized("someone without a seat approved a payment");
            Appr storage a = mAppr[_intent(token, to, amount)];
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

    /// @notice The owner, an agent or a seated approver may freeze; anyone else (a switched-off agent, a former
    ///         owner, a stranger) is refused.
    function freeze(uint256 whoSeed) external {
        address who = [curOwner, agents[(whoSeed / 5) % 2], pool[(whoSeed / 10) % 4], attacker, _formerOwner()][whoSeed % 5];
        bool may = who == curOwner || mIsAgent[who] || _seat(who) >= 0;
        uint256 breakers = _count(BREAKER);
        vm.prank(who);
        try w.freeze() returns (uint256 latched) {
            if (!may) return _unauthorized("someone without the right froze the wallet");
            nFreezes++;
            mFrozen = true;
            if (mTrusted && breakers != 0) {
                for (uint256 i; i < mStack.length; ++i) if (mStack[i].kind == BREAKER) mStack[i].blown = true;
                if (latched != breakers) _mismatch("freeze did not latch every breaker");
            } else {
                mPaused = true; // no breaker can be stepped: the freeze pauses instead
                if (latched != 0 || !w.paused()) _mismatch("freeze with no working breaker did not pause");
            }
        } catch {
            if (may) _mismatch("an allowed freeze reverted");
        }
    }

    // =====================================================================================================
    // The owner: fuses
    // =====================================================================================================

    function ownerRemoveFuse(uint256 slotSeed) external {
        uint256 n = mStack.length;
        uint256 slot = n == 0 ? 0 : slotSeed % n;
        vm.prank(curOwner);
        try w.removeFuse(slot) {
            if (n == 0) return _mismatch("removed a fuse from an empty line");
            if (mStack[slot].kind == BREAKER) mFrozen = false; // the owner chose to take a breaker off
            for (uint256 i = slot; i + 1 < n; ++i) mStack[i] = mStack[i + 1];
            mStack.pop();
            nRemovals++;
        } catch {
            if (n != 0) _mismatch("removing an installed fuse reverted");
        }
    }

    /// @notice Install a shipped fuse again (a duplicate is allowed), with fresh settings and an accepted max fee.
    function ownerAddFuse(uint256 kindSeed, uint256 paramSeed, uint256 feeSeed) external {
        uint8 kind = uint8(kindSeed % 5);
        if ((kindSeed / 5) % 2 == 0) {
            for (uint8 k; k < 5; ++k) {
                if (_count(k) == 0) {
                    kind = k; // half the time, put back what's missing
                    break;
                }
            }
        }
        Sockets.Params memory prm = _paramsFor(kind, paramSeed);
        uint256 maxFee = [mFee[kind], mFee[kind] * 2, mFee[kind] / 2][feeSeed % 3];
        bool expectRevert = mStack.length >= 8 || mFee[kind] > maxFee;
        vm.prank(curOwner);
        try w.addFuse(fuseIds[kind], prm, uint96(maxFee)) {
            if (expectRevert) return _mismatch("a fuse was installed past the limit or above its accepted fee");
            MSlot storage m = mStack.push();
            m.kind = kind;
            (m.token, m.unit, m.a, m.b, m.maxFee) = (prm.token, prm.unit, prm.a, prm.b, maxFee);
            m.epochDay = _today();
            m.epochLimit = uint256(m.a) * m.unit;
            nReinstalls++;
        } catch {
            if (!expectRevert) _mismatch("installing a fuse reverted");
        }
    }

    /// @notice Change one installed fuse's settings: its limit, and for amount fuses what it measures (unit, token).
    function ownerSetFuse(uint256 slotSeed, uint256 paramSeed) external {
        uint256 n = mStack.length;
        if (n == 0) return;
        uint256 slot = slotSeed % n;
        MSlot storage s = mStack[slot];
        Sockets.Params memory prm = _paramsFor(s.kind, paramSeed);
        vm.prank(curOwner);
        w.setFuseParams(slot, prm);
        _setModelParams(s, prm);
    }

    /// @notice The owner moves every amount fuse to native OKB, the agent pays the supplier in OKB, and the
    ///         owner moves them back to USD₮0. Each switch resets the caps' running spend.
    function nativeRound(uint256 amountSeed) external {
        for (uint256 i; i < mStack.length; ++i) {
            MSlot storage s = mStack[i];
            if (s.kind == BREAKER || s.kind == REPEAT) continue;
            Sockets.Params memory prm = Sockets.Params({token: address(0), unit: uint128(U), a: s.a, b: s.b});
            vm.prank(curOwner);
            w.setFuseParams(i, prm);
            _setModelParams(s, prm);
        }
        _pay(agents[0], address(0), payees[0], AMOUNTS[amountSeed % 8]);
        for (uint256 i; i < mStack.length; ++i) {
            MSlot storage s = mStack[i];
            if (s.kind == BREAKER || s.kind == REPEAT) continue;
            Sockets.Params memory prm = Sockets.Params({token: address(usdt), unit: uint128(U), a: s.a, b: s.b});
            vm.prank(curOwner);
            w.setFuseParams(i, prm);
            _setModelParams(s, prm);
        }
    }

    function _setModelParams(MSlot storage s, Sockets.Params memory prm) internal {
        uint32 today = _today();
        bool remeasured = prm.token != s.token || prm.unit != s.unit;
        if (remeasured && s.kind == CAP) {
            s.spent = 0; // a different measure starts a fresh count
            s.spentDay = 0;
            nMeasureChanges++;
        }
        (s.token, s.unit, s.a, s.b) = (prm.token, prm.unit, prm.a, prm.b);
        if (s.kind != CAP) return;
        uint256 limit = uint256(prm.a) * prm.unit;
        if (remeasured || s.epochDay != today) {
            s.epochDay = today;
            s.epochPaid = 0;
            s.epochLimit = limit;
        } else if (limit > s.epochLimit) {
            s.epochLimit = limit; // a raise counts from now; a cut can't undo what already left
        }
    }

    function _paramsFor(uint8 kind, uint256 seed) internal view returns (Sockets.Params memory p) {
        uint128 unit = seed % 4 == 0 ? uint128(U / 10) : uint128(U);
        address token = (seed / 4) % 6 == 0 ? address(0) : address(usdt);
        uint256 x = seed / 24;
        if (kind == CAP) {
            uint8[6] memory caps = [0, 5, 20, 50, 100, 254];
            return Sockets.Params({token: token, unit: unit, a: caps[x % 6], b: 0});
        }
        if (kind == PAYEE) {
            uint8[5] memory cools = [0, 1, 24, 72, 255];
            uint8[4] memory trials = [0, 2, 10, 254];
            return Sockets.Params({token: token, unit: unit, a: cools[x % 5], b: trials[(x / 5) % 4]});
        }
        if (kind == APPROVAL) {
            uint8[4] memory ts = [0, 3, 20, 254];
            return Sockets.Params({token: token, unit: unit, a: ts[x % 4], b: 0});
        }
        if (kind == REPEAT) {
            uint8[4] memory ws = [1, 6, 24, 254];
            return Sockets.Params({token: address(0), unit: 0, a: ws[x % 4], b: 0});
        }
        // BREAKER: no settings
    }

    function ownerSetMaxFee(uint256 slotSeed, uint256 seed) external {
        uint256 n = mStack.length;
        if (n == 0) return;
        uint256 slot = slotSeed % n;
        uint256 base = mFee[mStack[slot].kind];
        uint96 m = [uint96(0), uint96(base / 2), uint96(base), uint96(base * 3)][seed % 4];
        vm.prank(curOwner);
        w.setFuseMaxFee(slot, m);
        mStack[slot].maxFee = m;
    }

    // =====================================================================================================
    // The owner: everything else
    // =====================================================================================================

    function ownerUnfreeze() external {
        bool works = mTrusted && _count(BREAKER) != 0;
        vm.prank(curOwner);
        try w.unfreeze() {
            if (!works) _mismatch("unfreeze reported success with no working breaker");
            for (uint256 i; i < mStack.length; ++i) if (mStack[i].kind == BREAKER) mStack[i].blown = false;
            mFrozen = false;
        } catch {
            if (works) _mismatch("unfreeze reverted with a working breaker");
        }
    }

    function ownerSetPaused(bool paused_) external {
        vm.prank(curOwner);
        w.setPaused(paused_);
        mPaused = paused_;
        if (!paused_) mFrozen = false;
    }

    /// @notice Mostly switches the second agent; now and then the main one (which scenarios pay through).
    function ownerSetAgent(uint256 seed, bool enabled) external {
        address a = agents[seed % 4 == 0 ? 0 : 1];
        if (a == agents[0] && !enabled && seed % 8 != 0) enabled = true;
        vm.prank(curOwner);
        w.setAgent(a, enabled);
        mIsAgent[a] = enabled;
    }

    /// @notice Start handing the wallet to the other owner, or cancel a handover (to address zero).
    function ownerStartHandover(uint256 seed) external {
        address to = seed % 3 == 0 ? address(0) : _formerOwner();
        vm.prank(curOwner);
        w.transferOwnership(to);
        pending = to;
    }

    function acceptHandover(uint256 seed) external {
        address who = owners[seed % 2];
        vm.prank(who);
        try w.acceptOwnership() {
            if (who != pending || pending == address(0)) return _unauthorized("someone took the wallet without a handover");
            curOwner = who;
            pending = address(0);
            nHandovers++;
        } catch {
            if (who == pending && pending != address(0)) _mismatch("the named new owner could not accept");
        }
    }

    function ownerSavePayee(uint256 seed) external {
        address p = payees[seed % 3]; // never the scammer
        vm.prank(curOwner);
        try w.addPayee(p) {
            if (mAdded[p] != 0) _mismatch("a saved payee was saved twice");
            mAdded[p] = uint64(block.timestamp);
        } catch {
            if (mAdded[p] == 0) _mismatch("saving a new payee reverted");
        }
    }

    function ownerRemovePayee(uint256 seed) external {
        address p = payees[seed % 3];
        vm.prank(curOwner);
        w.removePayee(p);
        delete mAdded[p];
    }

    function ownerClearRepeat(uint256 toSeed, uint256 amountSeed, bool clear) external {
        _clearRepeat(payees[toSeed % payees.length], AMOUNTS[amountSeed % AMOUNTS.length], clear);
    }

    function _clearRepeat(address to, uint256 amount, bool clear) internal {
        vm.prank(curOwner);
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
        vm.prank(curOwner);
        w.setApprovers(s);
        mSeats = s;
        mEpoch++; // every open approval is void
    }

    function ownerSetTtl(uint256 seed) external {
        uint32 ttl = [uint32(1 hours), 6 hours, 1 days][seed % 3];
        vm.prank(curOwner);
        w.setApprovalTtl(ttl);
        mTtl = ttl;
    }

    function ownerSetLimits(uint256 decSeed, uint256 blkSeed) external {
        (uint32 d, uint32 b) = ([uint32(2), 12, 100, 100][decSeed % 4], [uint32(1), 5, 20, 20][blkSeed % 4]);
        vm.prank(curOwner);
        w.setDailyLimits(d, b);
        (mMaxDec, mMaxBlk) = (d, b);
    }

    function ownerMoveFunds(uint256 seed) external {
        uint256 bal = usdt.balanceOf(address(w));
        // now and then nearly everything, so the agent's next payment can't be covered
        uint256 amount = seed % 4 == 0 ? (bal > U ? bal - U : 0) : bound(seed, 0, bal / 4);
        vm.prank(curOwner);
        w.execute(address(usdt), 0, abi.encodeCall(IERC20.transfer, (curOwner, amount)));
        movedOut += amount;
    }

    function ownerWithdrawFees(uint256 seed) external {
        uint256 bal = reg.feeBalance(address(w));
        // now and then all but a few decisions' worth, so the fee balance runs dry
        uint256 amount = seed % 3 == 0 ? (bal > 8_000 ? bal - 8_000 : 0) : bound(seed, 0, bal / 2);
        vm.prank(curOwner);
        w.withdrawFeeBalance(amount, curOwner);
    }

    function ownerTopUpFees(uint256 seed) external {
        uint256 amount = bound(seed, 0, 2 * U);
        usdt.mint(curOwner, amount);
        vm.startPrank(curOwner);
        usdt.approve(address(reg), amount);
        reg.deposit(address(w), amount);
        vm.stopPrank();
        if (seed % 5 == 0) {
            usdt.mint(address(w), 200 * U); // and refill the wallet itself
            toppedUp += 200 * U;
        }
    }

    // =====================================================================================================
    // Scenarios: the deep paths random single calls rarely line up
    // =====================================================================================================

    /// Two seated approvers sign one exact payment above the threshold, then the agent sends it.
    function approvedBigPayment(uint256 toSeed, uint256 amountSeed, uint256 pairSeed) external {
        address to = payees[toSeed % 4 == 0 ? 1 : 0]; // mostly the supplier, sometimes the fresh payee
        uint256 amount = [10 * U, 20 * U + 1, 25 * U, 50 * U][amountSeed % 4];
        _approvePair(to, amount, pairSeed);
        _pay(agents[0], address(usdt), to, amount);
    }

    /// An approved payment goes out; later, past the Repeat Guard's window but before the approval would have
    /// expired, the agent sends the same payment again. The approval was used up: it must be refused.
    function approvedPaymentAgain(uint256 toSeed, uint256 amountSeed, uint256 pairSeed) external {
        address to = payees[toSeed % 4 == 0 ? 1 : 0];
        uint256 amount = [20 * U + 1, 25 * U][amountSeed % 2];
        _approvePair(to, amount, pairSeed);
        _pay(agents[0], address(usdt), to, amount);
        uint256 window = 6;
        for (uint256 i; i < mStack.length; ++i) if (mStack[i].kind == REPEAT && mStack[i].a > window) window = mStack[i].a;
        uint256 gap = window * 1 hours + 1 minutes;
        if (gap >= mTtl) gap = mTtl > 2 minutes ? mTtl - 1 minutes : 1 minutes;
        vm.warp(block.timestamp + gap);
        _pay(agents[0], address(usdt), to, amount);
    }

    function _approvePair(address to, uint256 amount, uint256 pairSeed) internal {
        uint256 a = pairSeed % 3;
        uint256 b = (a + 1 + (pairSeed / 3) % 2) % 3;
        _approve(mSeats[a] == address(0) ? pool[3] : mSeats[a], address(usdt), to, amount);
        _approve(mSeats[b] == address(0) ? pool[3] : mSeats[b], address(usdt), to, amount);
    }

    /// The same invoice twice: the second one inside the window must be refused.
    function sameInvoiceTwice(uint256 toSeed, uint256 amountSeed) external {
        address to = payees[toSeed % 4 == 0 ? 1 + (toSeed / 4) % 3 : 0]; // mostly the saved supplier
        uint256 amount = AMOUNTS[amountSeed % 8]; // small enough to pass the other fuses
        _pay(agents[0], address(usdt), to, amount);
        vm.warp(block.timestamp + 10 minutes);
        _pay(agents[0], address(usdt), to, amount);
    }

    /// The owner clears one repeat of a payment that just went out; the agent sends it again, then once more.
    function clearedRepeat(uint256 toSeed, uint256 amountSeed) external {
        address to = payees[toSeed % 4 == 0 ? 1 + (toSeed / 4) % 3 : 0]; // mostly the saved supplier
        uint256 amount = AMOUNTS[amountSeed % 8];
        _pay(agents[0], address(usdt), to, amount);
        _clearRepeat(to, amount, true);
        _pay(agents[0], address(usdt), to, amount);
        _pay(agents[0], address(usdt), to, amount); // the clearance was used up: this one must be refused
    }

    // =====================================================================================================
    // Designer, TapeOut, registry admin, the clock
    // =====================================================================================================

    function designerSetFee(uint256 kindSeed, uint256 seed) external {
        uint256 kind = kindSeed % 5;
        uint96[5] memory base = [uint96(1_000), 2_000, 500, 1_500, 300];
        uint96 fee = [uint96(0), base[kind] / 2, base[kind], base[kind] * 5][seed % 4];
        vm.prank(designer);
        try reg.setFee(fuseIds[kind], fee) {
            if (!mTrusted) _mismatch("a fee changed through an untrusted processor");
            mFee[kind] = fee;
        } catch {
            if (mTrusted) _mismatch("the designer could not reprice");
        }
    }

    function designerClaim(uint256 kindSeed) external {
        vm.prank(designer);
        try reg.claim(fuseIds[kindSeed % 5], designer) {
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
    }

    // =====================================================================================================
    // Everyone who must be refused
    // =====================================================================================================

    /// @notice An agent (on or switched off), an approver, a former approver, the former or pending owner, or a
    ///         stranger tries what only the owner (or only an agent, or only a seated approver, or only the
    ///         designer) may do. Every attempt must revert.
    function attack(uint256 whoSeed, uint256 what) external {
        address[5] memory cast = [agents[(whoSeed / 5) % 2], pool[(whoSeed / 10) % 4], attacker, _formerOwner(), agents[1]];
        address who = cast[whoSeed % 5];
        address target = address(w);
        bytes memory data;
        uint256 k = what % 20;
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
                FuseboxWallet.setFuseParams, (0, Sockets.Params({token: address(usdt), unit: uint128(U), a: 254, b: 0}))
            );
        } else if (k == 8) {
            data = abi.encodeCall(FuseboxWallet.removeFuse, (0));
        } else if (k == 9) {
            data = abi.encodeCall(FuseboxWallet.setAgent, (who, true));
        } else if (k == 10) {
            data = abi.encodeCall(FuseboxWallet.transferOwnership, (who));
        } else if (k == 11) {
            data = abi.encodeCall(FuseboxWallet.setDailyLimits, (type(uint32).max, type(uint32).max));
        } else if (k == 12) {
            data = abi.encodeCall(FuseboxWallet.pulse, (0, false, true));
        } else if (k == 13) {
            data = abi.encodeCall(FuseboxWallet.setFuseMaxFee, (0, type(uint96).max));
        } else if (k == 14) {
            if (mIsAgent[who]) who = attacker; // an agent that is on may pay
            data = abi.encodeCall(FuseboxWallet.pay, (address(usdt), who, U, "let me"));
        } else if (k == 15) {
            if (_seat(who) >= 0) who = attacker; // a seated approver may approve
            data = abi.encodeCall(FuseboxWallet.approvePayment, (address(usdt), who, 300 * U));
        } else if (k == 16) {
            data = abi.encodeCall(FuseboxWallet.addFuse, (fuseIds[0], Sockets.Params({token: address(usdt), unit: uint128(U), a: 254, b: 0}), type(uint96).max));
        } else if (k == 17) {
            target = address(reg); // a fee balance can only be withdrawn by its own account
            data = abi.encodeCall(FuseRegistry.withdraw, (reg.feeBalance(address(w)) + 1, who));
        } else if (k == 18) {
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
    // Checks the invariants call
    // =====================================================================================================

    /// @notice The wallet's stored state, compared with the model: the fuse line slot by slot (which fuse, its
    ///         settings and accepted fee, a cap's spend today, a breaker's latch), the owner and handover, the
    ///         agents, the pause. Returns "" when they agree.
    function stateDiff() external view returns (string memory) {
        uint256 n = w.fuseCount();
        if (n != mStack.length) return "the fuse line has a different length";
        for (uint256 i; i < n; ++i) {
            FuseboxWallet.Slot memory s = w.slotAt(i);
            MSlot storage m = mStack[i];
            if (s.fuseId != fuseIds[m.kind]) return string.concat("slot ", vm.toString(i), " holds another fuse");
            if (s.params.token != m.token || s.params.unit != m.unit || s.params.a != m.a || s.params.b != m.b) {
                return string.concat("slot ", vm.toString(i), " has other settings");
            }
            if (s.maxFee != m.maxFee) return string.concat("slot ", vm.toString(i), " accepts another fee");
            if (m.kind == CAP && w.spentToday(i) != (m.spentDay == _today() ? m.spent : 0)) {
                return string.concat("slot ", vm.toString(i), " counts a different spend today");
            }
            if (m.kind == BREAKER && ((uint8(s.state[0]) & 1) == 1) != m.blown) {
                return string.concat("slot ", vm.toString(i), " has a different breaker latch");
            }
        }
        if (w.owner() != curOwner) return "a different owner";
        if (w.pendingOwner() != pending) return "a different pending owner";
        if (w.isAgent(agents[0]) != mIsAgent[agents[0]] || w.isAgent(agents[1]) != mIsAgent[agents[1]]) return "different agents";
        if (w.paused() != mPaused) return "a different pause";
        return "";
    }

    // =====================================================================================================
    // Helpers
    // =====================================================================================================

    function _formerOwner() internal view returns (address) {
        return owners[0] == curOwner ? owners[1] : owners[0];
    }

    function _kindOf(uint256 fuseId) internal view returns (uint8) {
        for (uint8 k; k < 5; ++k) if (fuseIds[k] == fuseId) return k;
        revert("unknown fuse");
    }

    function _count(uint8 kind) internal view returns (uint256 n) {
        for (uint256 i; i < mStack.length; ++i) if (mStack[i].kind == kind) n++;
    }

    function _today() internal view returns (uint32) {
        return uint32(block.timestamp / 1 days);
    }

    /// ceil(amount / unit), saturating at 255
    function _q(uint256 amount, uint256 unit) internal pure returns (uint8) {
        if (amount == 0) return 0;
        uint256 q = (amount + unit - 1) / unit;
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
    address internal owner2 = makeAddr("nextOwner");
    address internal agent2 = makeAddr("secondAgent");

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
                owners: [owner, owner2],
                agents: [agent, agent2],
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
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.approvedPaymentAgain.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.sameInvoiceTwice.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.clearedRepeat.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.approve.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.warp.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.ownerUnfreeze.selector;
        for (uint256 i; i < 2; ++i) sel[n++] = WalletHandler.attack.selector;
        bytes4[28] memory once = [
            WalletHandler.revoke.selector,
            WalletHandler.freeze.selector,
            WalletHandler.ownerRemoveFuse.selector,
            WalletHandler.ownerAddFuse.selector,
            WalletHandler.ownerSetFuse.selector,
            WalletHandler.nativeRound.selector,
            WalletHandler.ownerSetMaxFee.selector,
            WalletHandler.ownerSetPaused.selector,
            WalletHandler.ownerSetAgent.selector,
            WalletHandler.ownerStartHandover.selector,
            WalletHandler.acceptHandover.selector,
            WalletHandler.ownerSavePayee.selector,
            WalletHandler.ownerRemovePayee.selector,
            WalletHandler.ownerClearRepeat.selector,
            WalletHandler.ownerSetApprovers.selector,
            WalletHandler.ownerSetTtl.selector,
            WalletHandler.ownerSetLimits.selector,
            WalletHandler.ownerMoveFunds.selector,
            WalletHandler.ownerWithdrawFees.selector,
            WalletHandler.ownerTopUpFees.selector,
            WalletHandler.designerSetFee.selector,
            WalletHandler.designerClaim.selector,
            WalletHandler.adminClaimProtocol.selector,
            WalletHandler.tapeoutUpgrade.selector,
            WalletHandler.ownerAddFuse.selector,
            WalletHandler.ownerSavePayee.selector,
            WalletHandler.acceptHandover.selector,
            WalletHandler.ownerSetAgent.selector
        ];
        for (uint256 i; i < once.length; ++i) sel[n++] = once[i];
        assembly ("memory-safe") {
            mstore(sel, n)
        }
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
    }

    /// The wallet, running the real circuits, decides every payment exactly as the spec says, charges exactly
    /// the spec's fee and reverts exactly when the spec says it must; and its stored state (the fuse line slot by
    /// slot, each cap's spend, each breaker's latch, the owner, the agents, the pause) matches the model's.
    function invariant_wallet_matches_the_spec() public view {
        assertEq(h.mismatches(), 0, h.firstMismatch());
        string memory diff = h.stateDiff();
        assertEq(bytes(diff).length, 0, diff);
    }

    /// No more than its cap (the highest it was set to since its count last reset) leaves through any cap in one
    /// UTC day.
    function invariant_daily_cap_is_never_exceeded() public view {
        assertEq(h.capOverruns(), 0);
    }

    /// Only saved payees are paid; one still cooling off gets no more than the trial amount.
    function invariant_only_saved_payees_get_paid() public view {
        assertEq(h.paidToUnsaved(), 0, "paid someone who isn't saved");
        assertEq(h.paidCoolingOverTrial(), 0, "paid a cooling-off payee more than the trial");
    }

    /// A blown breaker, or any freeze, stops every payment until the owner unfreezes, unpauses or removes the
    /// breaker.
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

    /// Only an agent that is switched on can pay; only seated approvers approve; only the current owner changes
    /// anything or moves funds (not the former or the pending one); only the circuit owner claims or reprices;
    /// nobody withdraws another account's fee balance or takes the wallet without a handover.
    function invariant_nobody_exceeds_their_role() public view {
        assertEq(h.unauthorized(), 0, h.firstUnauthorized());
    }

    /// Every token that left the wallet went through an allowed payment or the owner's own transfer.
    function invariant_money_is_conserved() public view {
        assertEq(usdt.balanceOf(address(wallet)), startUsdt + h.toppedUp() - h.paidOut() - h.movedOut());
        assertEq(address(wallet).balance, startNative - h.paidOutNative());
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

    /// Long walks: 8 fixed seeds × 600 steps, every promise checked after every step, and every deep path must
    /// actually have been exercised, so a green run can't mean "never got there".
    function test_long_walks_reach_every_path_and_keep_every_promise() public {
        // 4,800 steps in one test transaction add up past the block gas limit; each payment still gets full gas
        vm.pauseGasMetering();
        uint256[14] memory total;
        uint256[7] memory why;
        uint256[5] memory alone;
        for (uint256 walk; walk < 8; ++walk) {
            uint256 snap = vm.snapshotState();
            uint256 seed = uint256(keccak256(abi.encode("walk", walk)));
            for (uint256 step; step < 600; ++step) {
                seed = uint256(keccak256(abi.encode(seed)));
                _step(seed);
                _checkAll();
            }
            uint256[14] memory c = [
                h.decisions(), h.nAllowed(), h.nBlocked(), h.nReverted(), h.nAllowedWithApprovals(),
                h.nAllowedClearedRepeat(), h.nBlockedUntrusted(), h.nFreezes(), h.nRemovals(), h.nReinstalls(),
                h.nMeasureChanges(), h.nNativePaid(), h.nPaidBySecondAgent(), h.nHandovers()
            ];
            for (uint256 i; i < 14; ++i) total[i] += c[i];
            for (uint256 i; i < 7; ++i) why[i] += h.revertWhy(i);
            for (uint256 i; i < 5; ++i) alone[i] += h.stoppedAlone(i);
            vm.revertToState(snap);
        }
        string[14] memory names = [
            "decisions", "allowed", "blocked", "reverted", "approved big payments", "cleared repeats",
            "blocked by an untrusted processor", "freezes", "fuses removed", "fuses installed",
            "cap measure changes", "native OKB payments", "payments by the second agent", "ownership handovers"
        ];
        string memory line = "4800 steps:";
        for (uint256 i; i < 14; ++i) line = string.concat(line, " ", vm.toString(total[i]), " ", names[i], ";");
        console.log(line);
        console.log(
            string.concat(
                "reverts: paused ", vm.toString(why[0]), ", decision budget ", vm.toString(why[1]), ", blocked budget ",
                vm.toString(why[2]), ", fee balance ", vm.toString(why[3]), ", wallet balance ", vm.toString(why[4]),
                ", agent switched off ", vm.toString(why[5]), ", no fuses ", vm.toString(why[6])
            )
        );
        console.log(
            string.concat(
                "stopped alone: daily cap ", vm.toString(alone[0]), ", payee guard ", vm.toString(alone[1]), ", breaker ",
                vm.toString(alone[2]), ", two of three ", vm.toString(alone[3]), ", repeat guard ", vm.toString(alone[4])
            )
        );
        for (uint256 i; i < 14; ++i) assertGt(total[i], 0, string.concat("never exercised: ", names[i]));
        for (uint256 i; i < 7; ++i) assertGt(why[i], 0, string.concat("revert path never exercised: ", vm.toString(i)));
        for (uint256 i; i < 5; ++i) assertGt(alone[i], 0, string.concat("fuse never stopped a payment alone: ", vm.toString(i)));
    }

    function _step(uint256 r) internal {
        uint256 a = r % 100;
        uint256 x = r >> 8;
        uint256 y = r >> 72;
        uint256 z = r >> 136;
        uint256 v = r >> 200;
        if (a < 20) h.pay(v, x, y, z);
        else if (a < 24) h.approvedBigPayment(x, y, z);
        else if (a < 27) h.approvedPaymentAgain(x, y, z);
        else if (a < 30) h.sameInvoiceTwice(x, y);
        else if (a < 33) h.clearedRepeat(x, y);
        else if (a < 37) h.approve(x, y, z);
        else if (a < 38) h.revoke(x, y, z);
        else if (a < 43) h.warp(x);
        else if (a < 44) h.freeze(x);
        else if (a < 50) h.ownerUnfreeze();
        else if (a < 53) h.ownerSetPaused(x % 6 == 0);
        else if (a < 56) h.ownerSavePayee(x);
        else if (a < 57) h.ownerRemovePayee(x);
        else if (a < 59) h.ownerRemoveFuse(x);
        else if (a < 62) h.ownerAddFuse(x, y, z);
        else if (a < 65) h.ownerSetFuse(x, y);
        else if (a < 66) h.nativeRound(x);
        else if (a < 67) h.ownerSetMaxFee(x, y);
        else if (a < 69) h.ownerSetAgent(x, y % 3 != 0);
        else if (a < 70) h.ownerStartHandover(x);
        else if (a < 72) h.acceptHandover(x);
        else if (a < 74) h.ownerClearRepeat(x, y, z % 4 != 0);
        else if (a < 75) h.ownerSetApprovers(x);
        else if (a < 76) h.ownerSetTtl(x);
        else if (a < 77) h.ownerSetLimits(x, y);
        else if (a < 78) h.ownerMoveFunds(x);
        else if (a < 79) h.ownerWithdrawFees(x);
        else if (a < 81) h.ownerTopUpFees(x);
        else if (a < 83) h.designerSetFee(x, y);
        else if (a < 84) h.designerClaim(x);
        else if (a < 85) h.adminClaimProtocol();
        else if (a < 88) h.tapeoutUpgrade(x % 4 != 0);
        else h.attack(x, y);
    }
}
