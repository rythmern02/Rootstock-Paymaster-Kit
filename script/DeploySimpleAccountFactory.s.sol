// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@account-abstraction/contracts/samples/SimpleAccountFactory.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

contract DeploySimpleAccountFactory is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("WALLET_PRIVATE_KEY");
        address entryPoint = vm.envAddress("ENTRY_POINT_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        SimpleAccountFactory factory = new SimpleAccountFactory(IEntryPoint(entryPoint));
        console.log("SimpleAccountFactory deployed to:", address(factory));
        console.log("Set FACTORY_ADDRESS=%s in .env", address(factory));

        vm.stopBroadcast();
    }
}
