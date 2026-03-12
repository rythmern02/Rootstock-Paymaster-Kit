// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";
import "@account-abstraction/contracts/samples/SimpleAccountFactory.sol";
import "../src/core/VerifyingPaymaster.sol";
import "../src/mock/MockToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DeployAllTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("WALLET_PRIVATE_KEY");
        address owner = vm.envAddress("PAYMASTER_OWNER");
        address verifyingSigner = vm.envAddress("PAYMASTER_VERIFIER");

        require(owner != verifyingSigner, "Owner and signer must differ");
        require(owner != address(0), "Invalid owner");
        require(verifyingSigner != address(0), "Invalid signer");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy v0.7 EntryPoint
        EntryPoint entryPoint = new EntryPoint();
        console.log("EntryPoint (v0.7) deployed to:", address(entryPoint));

        // 2. Deploy SimpleAccountFactory
        SimpleAccountFactory factory = new SimpleAccountFactory(
            IEntryPoint(address(entryPoint))
        );
        console.log("SimpleAccountFactory deployed to:", address(factory));

        // 3. Deploy MockToken for gas
        MockToken mockToken = new MockToken();
        console.log("MockToken deployed to:", address(mockToken));

        // 4. Deploy VerifyingPaymaster
        RootstockVerifyingPaymaster paymaster = new RootstockVerifyingPaymaster(
            IEntryPoint(address(entryPoint)),
            owner,
            verifyingSigner,
            IERC20(address(mockToken))
        );
        console.log("VerifyingPaymaster deployed to:", address(paymaster));

        vm.stopBroadcast();

        console.log("\n=== UPDATE YOUR .env FILE WITH THESE VALUES ===");
        console.log('ENTRY_POINT_ADDRESS="%s"', address(entryPoint));
        console.log('FACTORY_ADDRESS="%s"', address(factory));
        console.log('TOKEN_ADDRESS="%s"', address(mockToken));
        console.log('PAYMASTER_ADDRESS="%s"', address(paymaster));
        console.log("===============================================\n");
    }
}
