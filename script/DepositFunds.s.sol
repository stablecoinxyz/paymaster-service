// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../contracts/SignatureVerifyingPaymasterV07.sol";

contract DepositFundsScript is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address proxyAddress = vm.envAddress("PROXY_ADDRESS");
        uint256 depositAmount = 0.02 ether; // Default amount
        
        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);
        
        // Get paymaster contract
        SignatureVerifyingPaymasterV07 paymaster = SignatureVerifyingPaymasterV07(payable(proxyAddress));
        
        // Deposit funds
        paymaster.deposit{value: depositAmount}();
        
        console.log("Deposited", depositAmount / 1e18, "ETH to EntryPoint");
        
        vm.stopBroadcast();
    }
}