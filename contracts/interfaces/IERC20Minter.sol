// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20Minter {
    function mint(address to, uint256 amount) external;
}
