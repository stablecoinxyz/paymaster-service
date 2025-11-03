#!/usr/bin/env tsx
import { parseEther, formatEther, getAddress, Address, createPublicClient, http, getContract } from 'viem';
import { config as dotenvConfig } from 'dotenv';
import { getDeployerWalletClient, getRPCUrl } from "../src/helpers/utils";
import { abi as PaymasterAbi } from "../contracts/abi/SignatureVerifyingPaymasterV07.json";

dotenvConfig();

const radiusTestnet = {
  id: 1223953,
  name: 'Radius Testnet',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.RADIUS_TESTNET_RPC_URL || 'https://rpc.testnet.radiustech.xyz'] },
  },
};

async function main() {
  try {
    const newGasLimitEth = process.env.NEW_GAS_LIMIT || "0.05";

    // Validate the new gas limit
    if (!newGasLimitEth || isNaN(parseFloat(newGasLimitEth))) {
      throw new Error('Invalid or missing gas limit. Set NEW_GAS_LIMIT env var (e.g., "0.05")');
    }

    // Get the proxy address from environment
    const proxyAddress = process.env.PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET as Address;
    if (!proxyAddress || !isValidAddress(proxyAddress)) {
      throw new Error('Invalid or missing PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET in .env file');
    }

    const newGasLimitWei = parseEther(newGasLimitEth);

    console.log('='.repeat(60));
    console.log('Updating Gas Limit for Radius Testnet Paymaster');
    console.log('='.repeat(60));
    console.log(`\nPaymaster: ${proxyAddress}`);
    console.log(`New gas limit: ${newGasLimitEth} USD`);

    // Setup clients
    const deployer = getDeployerWalletClient("radiusTestnet");
    const deployerAddress = deployer.account.address;
    const publicClient = createPublicClient({
      chain: radiusTestnet,
      transport: http(),
    });

    console.log(`\nUsing account: ${deployerAddress}`);

    // Get the paymaster contract
    const paymaster = getContract({
      address: proxyAddress,
      abi: PaymasterAbi,
      client: { public: publicClient, wallet: deployer },
    });

    // Check if the deployer is the owner
    const owner = await paymaster.read.owner() as Address;
    if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
      throw new Error(`The deployer (${deployerAddress}) is not the owner (${owner}) of the paymaster contract.`);
    }

    // Get current gas limit
    const currentGasLimit = await paymaster.read.maxAllowedGasCost() as bigint;
    console.log(`\nCurrent gas limit: ${formatEther(currentGasLimit)} USD`);

    // Validate new limit is within reasonable bounds
    const maxReasonableLimit = parseEther("1.0"); // 1 USD max
    const minReasonableLimit = parseEther("0.001"); // 0.001 USD min

    if (newGasLimitWei > maxReasonableLimit) {
      throw new Error(`Gas limit too high. Maximum allowed: ${formatEther(maxReasonableLimit)} USD`);
    }

    if (newGasLimitWei < minReasonableLimit) {
      throw new Error(`Gas limit too low. Minimum allowed: ${formatEther(minReasonableLimit)} USD`);
    }

    if (newGasLimitWei === currentGasLimit) {
      console.log('\n✅ Gas limit is already set to the desired value.');
      return;
    }

    // Update the gas limit
    console.log('\nUpdating gas limit...');
    const txHash = await paymaster.write.setMaxAllowedGasCost([newGasLimitWei]);

    console.log(`Transaction hash: ${txHash}`);
    console.log('Waiting for confirmation...');

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60000,
    });

    console.log(`Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`Status: ${receipt.status === 'success' ? 'Success' : 'Failed'}`);

    // Wait longer for blockchain to update
    console.log('\nWaiting for state update...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify the update
    const updatedGasLimit = await paymaster.read.maxAllowedGasCost() as bigint;

    console.log('\n' + '='.repeat(60));
    if (updatedGasLimit === newGasLimitWei) {
      console.log('✅ Gas Limit Updated Successfully!');
      console.log('='.repeat(60));
      console.log(`\nNew gas limit: ${formatEther(updatedGasLimit)} USD`);
      console.log(`Explorer: https://testnet.radius.xyz/tx/${txHash}`);
    } else {
      console.error('❌ Error: Gas limit update failed');
      console.log(`Expected: ${formatEther(newGasLimitWei)} USD`);
      console.log(`Got: ${formatEther(updatedGasLimit)} USD`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error updating gas limit:', error);
    process.exit(1);
  }
}

// Helper function to check if an address is valid
function isValidAddress(address: string): boolean {
  try {
    getAddress(address as Address);
    return true;
  } catch {
    return false;
  }
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
