// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

contract DeployEntryPoint is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("WALLET_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        EntryPoint ep = new EntryPoint();
        console.log("EntryPoint deployed to:", address(ep));
        console.log("Set ENTRY_POINT_ADDRESS=%s in .env", address(ep));

        vm.stopBroadcast();
    }
}
