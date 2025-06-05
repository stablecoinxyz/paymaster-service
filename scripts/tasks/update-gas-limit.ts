import { HardhatRuntimeEnvironment } from "hardhat/types";
import { parseEther, formatEther, getAddress, Address, createPublicClient, http } from 'viem';
import { config as dotenvConfig } from 'dotenv';
import { getChain, getDeployerWalletClient, getRPCUrl } from "../../src/helpers/utils";

dotenvConfig();

/**
 * Update the maximum allowed gas cost for the paymaster
 */
export async function main(hre: HardhatRuntimeEnvironment, newGasLimitEth: string): Promise<void> {
  try {
    const chain = hre.network.name;

    // Validate the new gas limit
    if (!newGasLimitEth || isNaN(parseFloat(newGasLimitEth))) {
      throw new Error('Invalid or missing gas limit in ETH (e.g., "0.02")');
    }
    
    // Get the proxy address from environment
    const proxyAddress = process.env.PROXY_ADDRESS;
    if (!proxyAddress || !isValidAddress(proxyAddress)) {
      throw new Error('Invalid or missing PROXY_ADDRESS in .env file');
    }

    const newGasLimitWei = parseEther(newGasLimitEth);

    console.log(`Updating gas limit for paymaster at address: ${proxyAddress}`);
    console.log(`New gas limit: ${newGasLimitEth} ETH`);

    // Setup clients
    const deployer = getDeployerWalletClient(chain);
    const deployerAddress = deployer.account.address;
    const publicClient = createPublicClient({
      chain: getChain(chain),
      transport: http(getRPCUrl(chain)),
    });
    
    console.log(`Using account: ${deployerAddress}`);

    // Get the paymaster contract
    const paymaster = await hre.viem.getContractAt('contracts/SignatureVerifyingPaymasterV07.sol:SignatureVerifyingPaymasterV07', proxyAddress as Address);

    // Check if the deployer is the owner
    const owner = await paymaster.read.owner([]) as Address;
    if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
      throw new Error(`The deployer (${deployerAddress}) is not the owner (${owner}) of the paymaster contract.`);
    }

    // Get current gas limit
    const currentGasLimit = await paymaster.read.maxAllowedGasCost([]) as bigint;
    console.log(`Current gas limit: ${formatEther(currentGasLimit)} ETH`);

    // Validate new limit is within reasonable bounds
    const maxReasonableLimit = parseEther("1.0"); // 1 ETH max
    const minReasonableLimit = parseEther("0.001"); // 0.001 ETH min

    if (newGasLimitWei > maxReasonableLimit) {
      throw new Error(`Gas limit too high. Maximum allowed: ${formatEther(maxReasonableLimit)} ETH`);
    }
    
    if (newGasLimitWei < minReasonableLimit) {
      throw new Error(`Gas limit too low. Minimum allowed: ${formatEther(minReasonableLimit)} ETH`);
    }

    // Update the gas limit
    console.log('\nUpdating gas limit...');
    const txHash = await paymaster.write.setMaxAllowedGasCost([newGasLimitWei]);
    
    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash
    });
    
    console.log(`Transaction hash: ${receipt.transactionHash}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // Wait longer for blockchain to update
    console.log('\nWaiting for blockchain update...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    // Verify the update
    const updatedGasLimit = await paymaster.read.maxAllowedGasCost([]) as bigint;
    console.log(`\nVerified new gas limit: ${formatEther(updatedGasLimit)} ETH`);
    
    if (updatedGasLimit === newGasLimitWei) {
      console.log('Gas limit updated successfully ✅');
    } else {
      console.error('Error: Gas limit update failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('Error updating gas limit:', error);
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