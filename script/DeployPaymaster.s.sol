// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../contracts/SignatureVerifyingPaymasterV07.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployPaymasterScript is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address entryPointAddress = vm.envAddress("ENTRY_POINT_V07_ADDRESS");
        address trustedSigner = vm.envAddress("TRUSTED_SIGNER");
        
        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy implementation
        SignatureVerifyingPaymasterV07 implementation = new SignatureVerifyingPaymasterV07(
            IEntryPoint(entryPointAddress)
        );
        
        // Prepare initialization data
        bytes memory initData = abi.encodeWithSelector(
            SignatureVerifyingPaymasterV07.initialize.selector,
            trustedSigner,
            vm.addr(deployerPrivateKey)
        );
        
        // Deploy proxy
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            initData
        );
        
        // Log addresses
        console.log("Implementation deployed at:", address(implementation));
        console.log("Proxy deployed at:", address(proxy));
        
        vm.stopBroadcast();
    }
}