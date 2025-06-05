// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../contracts/SignatureVerifyingPaymasterV07.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

contract CheckStatusScript is Script {
    function run() external view {
        // Load environment variables
        address proxyAddress = vm.envAddress("PROXY_ADDRESS");
        
        // Get paymaster contract
        SignatureVerifyingPaymasterV07 paymaster = SignatureVerifyingPaymasterV07(payable(proxyAddress));
        
        // Get EntryPoint
        IEntryPoint entryPoint = IEntryPoint(paymaster.entryPoint());
        
        // Get deposit info
        IStakeManager.DepositInfo memory info = entryPoint.getDepositInfo(proxyAddress);
        
        // Display info
        console.log("Paymaster address:", proxyAddress);
        console.log("Verifying signer:", paymaster.verifyingSigner());
        console.log("Max allowed gas cost:", paymaster.maxAllowedGasCost());
        console.log("Deposit:", info.deposit, "wei");
        console.log("Staked:", info.staked);
        console.log("Stake:", info.stake);
        console.log("Unstake delay:", info.unstakeDelaySec);
        console.log("Withdraw time:", info.withdrawTime);
    }
}
