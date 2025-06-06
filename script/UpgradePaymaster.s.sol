// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../contracts/SignatureVerifyingPaymasterV07.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract UpgradePaymasterScript is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address entryPointAddress = vm.envAddress("ENTRY_POINT_V07_ADDRESS");
        address proxyAddress = vm.envAddress("PROXY_ADDRESS");
        
        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy new implementation
        SignatureVerifyingPaymasterV07 newImplementation = new SignatureVerifyingPaymasterV07(
            IEntryPoint(entryPointAddress)
        );
        
        // Add this function to re-initialize EIP712
        bytes memory initData = abi.encodeWithSignature(
            "reinitializeEIP712()",
            ""
        );

        UUPSUpgradeable(proxyAddress).upgradeToAndCall(
            address(newImplementation),
            initData // ✅ Proper initialization
        );
        
        console.log("New implementation deployed at:", address(newImplementation));
        console.log("Proxy upgraded at:", proxyAddress);
        
        vm.stopBroadcast();
    }
}