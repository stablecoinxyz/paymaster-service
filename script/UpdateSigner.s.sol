// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../contracts/SignatureVerifyingPaymasterV07.sol";

contract UpdateSignerScript is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address proxyAddress = vm.envAddress("PROXY_ADDRESS");
        
        // Get new signer address from command line
        address newSigner = vm.envAddress("TRUSTED_SIGNER");
        
        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);
        
        // Get paymaster contract
        SignatureVerifyingPaymasterV07 paymaster = SignatureVerifyingPaymasterV07(payable(proxyAddress));
        
        // Update signer
        paymaster.setVerifyingSigner(newSigner);
        
        console.log("Updated trusted signer to:", newSigner);
        
        vm.stopBroadcast();
    }
}
