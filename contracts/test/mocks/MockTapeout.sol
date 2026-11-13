// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice A TapeOut processor stand-in that runs the same TAP-02 semantics (NAND and LATCH; no REF),
///         for unit tests. Its outputs are checked against the TypeScript simulator's vectors in
///         MockProcessor.t.sol and against the real processor in the fork tests.
contract MockProcessor is ERC721 {
    struct Circuit {
        bytes netlist;
        uint32 nIn;
        uint32 nOut;
        uint32 nState;
        uint32 gates;
    }

    event TapedOut(uint256 indexed circuitId, address indexed author, uint32 gateCount, uint32 nState);

    uint256 public constant TAPEOUT_FEE = 0;
    uint256 public nextId = 1;
    address public factory;
    mapping(uint256 => Circuit) internal _c;

    constructor(address factory_) ERC721("Mock processor", "MOCK") {
        factory = factory_;
    }

    function tapeout(bytes calldata nl, uint32 nIn, uint32 nOut) external payable returns (uint256 id) {
        require(nOut >= 1 && nOut <= 65536 && nIn <= 65536, "too many pins");
        (uint256 nElems, uint256 nLatch) = _analyze(nl, nIn);
        require(nElems >= nOut, "too few signals for outputs");
        id = nextId++;
        _c[id] = Circuit(nl, nIn, nOut, uint32(nLatch), uint32(nElems));
        _mint(msg.sender, id);
        emit TapedOut(id, msg.sender, uint32(nElems), uint32(nLatch));
    }

    function circuitInfo(uint256 id) external view returns (uint32, uint32, uint32, uint32) {
        Circuit storage c = _c[id];
        require(c.nOut != 0, "no circuit");
        return (c.nIn, c.nOut, c.nState, c.gates);
    }

    function netlist(uint256 id) external view returns (bytes memory) {
        require(_c[id].nOut != 0, "no circuit");
        return _c[id].netlist;
    }

    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory outputs) {
        Circuit storage c = _c[id];
        require(c.nOut != 0, "no circuit");
        require(c.nState == 0, "has latch: use step");
        (, outputs) = _beat(c, "", inputs);
    }

    function step(uint256 id, bytes calldata state, bytes calldata inputs)
        external
        view
        returns (bytes memory newState, bytes memory outputs)
    {
        Circuit storage c = _c[id];
        require(c.nOut != 0, "no circuit");
        return _beat(c, state, inputs);
    }

    function _analyze(bytes calldata nl, uint32 nIn) internal pure returns (uint256 nElems, uint256 nLatch) {
        uint256 p;
        uint256 total;
        // first pass: count signals
        while (p < nl.length) {
            uint8 op = uint8(nl[p]);
            if (op == 0) p += 7;
            else if (op == 1) p += 4;
            else revert("bad opcode");
            require(p <= nl.length, "truncated");
            total++;
        }
        uint256 nSig = 2 + uint256(nIn) + total;
        p = 0;
        uint256 next = 2 + uint256(nIn);
        while (p < nl.length) {
            uint8 op = uint8(nl[p]);
            if (op == 0) {
                require(_u24(nl, p + 1) < next && _u24(nl, p + 4) < next, "NAND: future signal");
                p += 7;
            } else {
                require(_u24(nl, p + 1) < nSig, "LATCH d out of range");
                nLatch++;
                p += 4;
            }
            next++;
        }
        nElems = total;
    }

    function _u24(bytes memory nl, uint256 p) internal pure returns (uint256) {
        return (uint256(uint8(nl[p])) << 16) | (uint256(uint8(nl[p + 1])) << 8) | uint256(uint8(nl[p + 2]));
    }

    function _bit(bytes memory v, uint256 i) internal pure returns (uint8) {
        return i / 8 < v.length ? (uint8(v[i / 8]) >> (i % 8)) & 1 : 0;
    }

    function _beat(Circuit storage c, bytes memory state, bytes memory inputs)
        internal
        view
        returns (bytes memory newState, bytes memory outputs)
    {
        bytes memory nl = c.netlist;
        uint256 nIn = c.nIn;
        uint256 nSig = 2 + nIn + c.gates;
        uint8[] memory s = new uint8[](nSig);
        s[1] = 1;
        for (uint256 i; i < nIn; ++i) {
            s[2 + i] = _bit(inputs, i);
        }
        uint256 p;
        uint256 k = 2 + nIn;
        uint256 latch;
        while (p < nl.length) {
            if (uint8(nl[p]) == 0) {
                s[k] = 1 - (s[_u24(nl, p + 1)] & s[_u24(nl, p + 4)]);
                p += 7;
            } else {
                s[k] = _bit(state, latch++);
                p += 4;
            }
            k++;
        }
        newState = new bytes((uint256(c.nState) + 7) / 8);
        p = 0;
        latch = 0;
        while (p < nl.length) {
            if (uint8(nl[p]) == 0) {
                p += 7;
            } else {
                if (s[_u24(nl, p + 1)] == 1) newState[latch / 8] |= bytes1(uint8(1 << (latch % 8)));
                latch++;
                p += 4;
            }
        }
        uint256 nOut = c.nOut;
        outputs = new bytes((nOut + 7) / 8);
        for (uint256 i; i < nOut; ++i) {
            if (s[nSig - nOut + i] == 1) outputs[i / 8] |= bytes1(uint8(1 << (i % 8)));
        }
    }
}

contract MockFactory {
    mapping(address => bool) public isCPU;

    function setCPU(address cpu, bool v) external {
        isCPU[cpu] = v;
    }

    function isSealed() external pure returns (bool) {
        return false;
    }
}

contract MockBeacon {
    address public implementation;

    constructor(address impl) {
        implementation = impl;
    }

    function upgradeTo(address impl) external {
        implementation = impl;
    }
}
