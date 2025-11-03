// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../contracts/SignatureVerifyingPaymasterV07.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// Must change the implementation address to the one deployed by the DeployPaymasterScript
// This is because the nonce issue with forge scripts
// The first transaction succeeds, but subsequent ones fail
// So we deploy the implementation first, and then the proxy
// This is a workaround to avoid the nonce issue
// The nonce issue is because the forge scripts are not deterministic
contract DeployProxyOnlyScript is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address trustedSigner = vm.envAddress("TRUSTED_SIGNER");

        // Use the already deployed implementation
        address implementation = 0xe88c76De10099cCC623EAe15AE7Dd4b6AF9cCcda;

        console.log("Using existing implementation at:", implementation);

        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);

        // Prepare initialization data
        bytes memory initData = abi.encodeWithSelector(
            SignatureVerifyingPaymasterV07.initialize.selector,
            trustedSigner,
            vm.addr(deployerPrivateKey)
        );

        // Deploy proxy
        ERC1967Proxy proxy = new ERC1967Proxy(
            implementation,
            initData
        );

        // Log address
        console.log("Proxy deployed at:", address(proxy));

        vm.stopBroadcast();
    }
}
