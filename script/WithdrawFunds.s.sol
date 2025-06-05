// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../contracts/SignatureVerifyingPaymasterV07.sol";

contract WithdrawFundsScript is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address proxyAddress = vm.envAddress("PROXY_ADDRESS");
        
        // Get withdrawal amount from command line or use default
        uint256 withdrawAmount = vm.envOr("AMOUNT", uint256(0.05 ether));
        
        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);
        
        // Get paymaster contract
        SignatureVerifyingPaymasterV07 paymaster = SignatureVerifyingPaymasterV07(payable(proxyAddress));
        
        // Withdraw funds
        paymaster.withdrawTo(payable(vm.addr(deployerPrivateKey)), withdrawAmount);
        
        console.log("Withdrawn", withdrawAmount / 1e18, "ETH from EntryPoint");
        
        vm.stopBroadcast();
    }
}
