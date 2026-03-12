// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockToken
 * @notice Test / demo ERC-20 token for the Rootstock Paymaster Kit.
 *
 * Bug #17 fix: `mint()` is now restricted to `onlyOwner`. On a real mainnet
 * deployment the deployer controls minting; on testnet the coordinator (owner)
 * mints tokens for the smart account during setup.
 *
 * WARNING: This contract is for TESTNET / DEMO use only.
 * For mainnet, replace this with a real, audited ERC-20 token and pass its
 * address via TOKEN_ADDRESS in the deploy script.
 */
contract MockToken is ERC20, Ownable {
    constructor() ERC20("Rootstock USD", "rUSD") Ownable(msg.sender) {}

    /**
     * @notice Mint tokens to a recipient. Restricted to the contract owner.
     * @param to     Recipient address.
     * @param amount Amount to mint (18 decimals).
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
