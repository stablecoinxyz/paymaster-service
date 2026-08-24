// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../contracts/SignatureVerifyingPaymasterV07.sol";
import "./PaymasterAddresses.sol";

contract UpdateGasLimitScript is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address proxyAddress = PaymasterAddresses.proxy();
        
        // Get new gas limit from command line (in wei)
        uint256 newLimit = vm.envUint("NEW_LIMIT");
        
        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);
        
        // Get paymaster contract
        SignatureVerifyingPaymasterV07 paymaster = SignatureVerifyingPaymasterV07(payable(proxyAddress));
        
        // Update gas limit
        paymaster.setMaxAllowedGasCost(newLimit);
        
        console.log("Updated gas limit to:", newLimit, "wei");
        
        vm.stopBroadcast();
    }
}
