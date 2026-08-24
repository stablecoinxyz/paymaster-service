import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getAddress, Address, createPublicClient, getContract, http, createWalletClient } from 'viem';
import { config as dotenvConfig } from 'dotenv';
import { getChain, getDeployerWalletClient, getRPCUrl, getPaymasterProxyAddress } from "../../src/helpers/utils";
import { abi as SBC_PAYMASTER_V07_ABI } from "../../contracts/abi/SignatureVerifyingPaymasterV07.json";

dotenvConfig();

/**
 * Update the trusted signer address for the paymaster
 */
export async function main(hre: HardhatRuntimeEnvironment, newSignerAddress: string): Promise<void> {
  try {
    const chain = hre.network.name;

    // Validate the new signer address
    if (!newSignerAddress || !isValidAddress(newSignerAddress)) {
      throw new Error('Invalid or missing signer address');
    }
    
    // Get the proxy address from environment
    // Per-chain lookup: PROXY_ADDRESS holds one address and is wrong on other networks.
    const proxyAddress = getPaymasterProxyAddress(chain);

    console.log(`Updating trusted signer for paymaster at address: ${proxyAddress}`);
    console.log(`New signer address: ${newSignerAddress}`);

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

    // Get current trusted signer
    const currentTrustedSigner = await paymaster.read.verifyingSigner([]) as Address;
    console.log(`Current trusted signer: ${currentTrustedSigner}`);

    // Update the trusted signer
    console.log('\nUpdating trusted signer...');
    const txHash = await paymaster.write.setVerifyingSigner([newSignerAddress as Address]);
    
    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash
    });
    
    console.log(`Transaction hash: ${receipt.transactionHash}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // Verify the update
    const updatedVerifyingSigner = await paymaster.read.verifyingSigner([]) as Address;
    console.log(`\nVerified new trusted signer: ${updatedVerifyingSigner}`);
    
    if (updatedVerifyingSigner.toLowerCase() === newSignerAddress.toLowerCase()) {
      console.log('Trusted signer updated successfully ✅');
    } else {
      console.error('Error: Trusted signer update failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('Error updating trusted signer:', error);
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