// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/core/VerifyingPaymaster.sol";
import "../src/mock/MockToken.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DeployPaymaster
 * @notice One-shot deploy script for RootstockVerifyingPaymaster.
 *
 * Bug #25 fix: Requires PAYMASTER_OWNER != PAYMASTER_VERIFIER to enforce
 *             separation of ownership and signing authority.
 *
 * Bug #26 fix: If TOKEN_ADDRESS is set in .env, the script uses that existing
 *             token (e.g. a real stablecoin on mainnet). Otherwise it deploys
 *             a fresh MockToken (testnet only).
 *
 * Required .env vars:
 *   WALLET_PRIVATE_KEY   – deployer wallet (pays gas)
 *   ENTRY_POINT_ADDRESS  – ERC-4337 v0.7 EntryPoint
 *   PAYMASTER_OWNER      – address that will own the paymaster (not the signer)
 *   PAYMASTER_VERIFIER   – address of the off-chain signing key
 *
 * Optional .env vars:
 *   TOKEN_ADDRESS        – address of an existing ERC-20 token; if absent a
 *                          MockToken is deployed (testnet/demo only)
 */
contract DeployPaymaster is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("WALLET_PRIVATE_KEY");
        address entryPoint = vm.envAddress("ENTRY_POINT_ADDRESS");
        address verifyingSigner = vm.envAddress("PAYMASTER_VERIFIER");
        address owner = vm.envAddress("PAYMASTER_OWNER");

        // Bug #25: Enforce role separation at deploy time.
        require(
            owner != verifyingSigner,
            "DeployPaymaster: PAYMASTER_OWNER and PAYMASTER_VERIFIER must be different addresses"
        );
        require(
            owner != address(0),
            "DeployPaymaster: PAYMASTER_OWNER is zero address"
        );
        require(
            verifyingSigner != address(0),
            "DeployPaymaster: PAYMASTER_VERIFIER is zero address"
        );

        vm.startBroadcast(deployerPrivateKey);

        // Bug #26: Use existing token if TOKEN_ADDRESS is provided; deploy mock
        //          otherwise (testnet / demo deployments only).
        address tokenAddr = vm.envOr("TOKEN_ADDRESS", address(0));
        if (tokenAddr == address(0)) {
            MockToken mockToken = new MockToken();
            console.log("MockToken deployed to:", address(mockToken));
            console.log("  WARNING: MockToken is for TESTNET/DEMO use only.");
            console.log(
                "  Set TOKEN_ADDRESS in .env to use a real token on mainnet."
            );
            tokenAddr = address(mockToken);
        } else {
            console.log("Using existing token at:", tokenAddr);
        }

        // Deploy the Verifying Paymaster.
        RootstockVerifyingPaymaster paymaster = new RootstockVerifyingPaymaster(
            IEntryPoint(entryPoint),
            owner,
            verifyingSigner,
            IERC20(tokenAddr)
        );
        console.log("VerifyingPaymaster deployed to:", address(paymaster));
        console.log("  Owner:    ", owner);
        console.log("  Verifier: ", verifyingSigner);

        vm.stopBroadcast();

        // Print the env vars the operator needs to update.
        console.log("\nAdd to your .env:");
        console.log("  PAYMASTER_ADDRESS =", address(paymaster));
        console.log("  TOKEN_ADDRESS     =", tokenAddr);
    }
}
