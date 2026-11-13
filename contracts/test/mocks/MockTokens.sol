// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 6-decimal stand-in for USDT0.
contract MockUSDT0 is ERC20 {
    constructor() ERC20("USD0 mock", "USDT0") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

interface IPayable {
    function pay(address token, address to, uint256 amount, string calldata memo) external returns (bool, uint256);
}

/// @notice A token whose transfer tries to re-enter the wallet's `pay`.
contract ReentrantToken is ERC20 {
    IPayable public target;
    bool public attempted;
    bool public reentered;

    constructor() ERC20("Reentrant", "RE") {}

    function arm(IPayable t) external {
        target = t;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (address(target) != address(0) && from == address(target) && !attempted) {
            attempted = true;
            try target.pay(address(this), to, value, "again") {
                reentered = true;
            } catch {}
        }
    }
}
