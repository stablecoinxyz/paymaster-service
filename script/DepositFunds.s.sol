// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../contracts/SignatureVerifyingPaymasterV07.sol";
import "./PaymasterAddresses.sol";

contract DepositFundsScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Resolved from the chain being broadcast to, so the same command is correct
        // on every network. Override with DEPOSIT_AMOUNT_WEI if 0.01 is not wanted.
        address proxyAddress = PaymasterAddresses.proxy();
        uint256 depositAmount = vm.envOr("DEPOSIT_AMOUNT_WEI", uint256(0.01 ether));

        SignatureVerifyingPaymasterV07 paymaster = SignatureVerifyingPaymasterV07(payable(proxyAddress));

        console.log("Chain id:", block.chainid);
        console.log("Paymaster:", proxyAddress);
        console.log("EntryPoint:", address(paymaster.entryPoint()));
        console.log("Deposit (wei):", depositAmount);

        vm.startBroadcast(deployerPrivateKey);
        // deposit() forwards to the paymaster's own EntryPoint, so the destination
        // cannot drift from what the contract actually uses.
        paymaster.deposit{value: depositAmount}();
        vm.stopBroadcast();

        console.log("New deposit (wei):", paymaster.getDeposit());
    }
}
