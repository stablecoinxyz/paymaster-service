import { HardhatRuntimeEnvironment } from "hardhat/types";
import { parseEther, formatEther, getAddress, Address, createPublicClient, getContract, http } from 'viem';
import { config as dotenvConfig } from 'dotenv';
import { getChain, getDeployerWalletClient, getRPCUrl, getPaymasterProxyAddress } from "../../src/helpers/utils";
import { abi as SBC_PAYMASTER_V07_ABI } from "../../contracts/abi/SignatureVerifyingPaymasterV07.json";

dotenvConfig();

/**
 * Reinitialize the gas cost limit after an upgrade if it was reset to zero
 */
export async function main(hre: HardhatRuntimeEnvironment, gasLimitEth: string = "0.01"): Promise<void> {
  try {
    const chain = hre.network.name;

    // Get the proxy address from environment
    // Per-chain lookup: PROXY_ADDRESS holds one address and is wrong on other networks.
    const proxyAddress = getPaymasterProxyAddress(chain);

    const gasLimitWei = parseEther(gasLimitEth);

    console.log(`Reinitializing gas cost for paymaster at address: ${proxyAddress}`);
    console.log(`Gas limit: ${gasLimitEth} ETH`);

    // Setup clients
    const deployer = getDeployerWalletClient(chain);
    const deployerAddress = deployer.account.address;
    const publicClient = createPublicClient({
      chain: getChain(chain),
      transport: http(getRPCUrl(chain)),
    });
    
    console.log(`Using account: ${deployerAddress}`);

    // Get the paymaster contract
    const paymaster = getContract({
      address: proxyAddress,
      abi: SBC_PAYMASTER_V07_ABI,
      client: { public: publicClient, wallet: deployer },
    });

    // Check if the deployer is the owner
    const owner = await paymaster.read.owner([]) as Address;
    if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
      throw new Error(`The deployer (${deployerAddress}) is not the owner (${owner}) of the paymaster contract.`);
    }

    // Get current gas limit
    const currentGasLimit = await paymaster.read.maxAllowedGasCost([]) as bigint;
    console.log(`Current gas limit: ${formatEther(currentGasLimit)} ETH`);

    if (currentGasLimit > 0n) {
      console.log('Gas cost is already initialized. Use update-gas-limit task to change it.');
      return;
    }

    // Reinitialize the gas limit
    console.log('\nReinitializing gas cost...');
    const txHash = await paymaster.write.reinitializeGasCost([gasLimitWei]);
    
    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash
    });
    
    console.log(`Transaction hash: ${receipt.transactionHash}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // Verify the update
    const updatedGasLimit = await paymaster.read.maxAllowedGasCost([]) as bigint;
    console.log(`\nVerified gas limit: ${formatEther(updatedGasLimit)} ETH`);
    
    if (updatedGasLimit === gasLimitWei) {
      console.log('Gas cost reinitialized successfully ✅');
    } else {
      console.error('Error: Gas cost reinitialization failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('Error reinitializing gas cost:', error);
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