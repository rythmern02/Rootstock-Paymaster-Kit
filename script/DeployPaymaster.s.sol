// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/core/VerifyingPaymaster.sol";
import "../src/mock/MockToken.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DeployPaymaster is Script {
    function run() external {
        // Load variables from .env
        uint256 deployerPrivateKey = vm.envUint("WALLET_PRIVATE_KEY");
        address entryPoint = vm.envAddress("ENTRY_POINT_ADDRESS");
        address verifyingSigner = vm.envAddress("PAYMASTER_VERIFIER");
        address owner = vm.envAddress("PAYMASTER_OWNER");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy the Mock Token first
        MockToken token = new MockToken();
        console.log("MockToken deployed to:", address(token));

        // 2. Deploy the Verifying Paymaster
        RootstockVerifyingPaymaster paymaster = new RootstockVerifyingPaymaster(
            IEntryPoint(entryPoint),
            owner,
            verifyingSigner,
            IERC20(address(token))
        );
        console.log("VerifyingPaymaster deployed to:", address(paymaster));

        vm.stopBroadcast();
    }
}