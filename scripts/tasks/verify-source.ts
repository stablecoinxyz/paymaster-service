import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getAddress, Address, createPublicClient, http } from 'viem';
import { config as dotenvConfig } from 'dotenv';
import { getScannerUrl, getChain, getRPCUrl, getPaymasterProxyAddress } from "../../src/helpers/utils";

dotenvConfig();

/**
 * Verify the paymaster implementation and proxy contracts on Etherscan
 */
export async function main(hre: HardhatRuntimeEnvironment): Promise<void> {
  try {
    const chain = hre.network.name;

    // Per-chain lookup: PROXY_ADDRESS holds one address and is wrong on other networks.
    const proxyAddress = getPaymasterProxyAddress(chain);

    // Get the implementation address using the ERC1967 storage slot
    const publicClient = createPublicClient({
      chain: getChain(chain),
      transport: http(getRPCUrl(chain)),
    });
    const implementationSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
    const implAddressData = await publicClient.getStorageAt({
      address: proxyAddress as Address,
      slot: implementationSlot
    });
    
    const implementationAddress = getAddress('0x' + (implAddressData?.slice(26) || ''));
    console.log(`Implementation address: ${implementationAddress}`);
    console.log(`Proxy address: ${proxyAddress}`);

    // Get required addresses for verification
    const ENTRY_POINT_V07_ADDRESS = process.env.ENTRY_POINT_V07_ADDRESS as Address;
    if (!ENTRY_POINT_V07_ADDRESS || !isValidAddress(ENTRY_POINT_V07_ADDRESS)) {
      throw new Error('ENTRY_POINT_V07_ADDRESS is required in environment variables');
    }
    
    const TRUSTED_SIGNER = process.env.TRUSTED_SIGNER as Address;
    if (!TRUSTED_SIGNER || !isValidAddress(TRUSTED_SIGNER)) {
      throw new Error('TRUSTED_SIGNER is required in environment variables');
    }

    console.log('\nVerifying implementation contract...');
    try {
      await hre.run("verify:verify", {
        address: implementationAddress,
        contract: "contracts/SignatureVerifyingPaymasterV07.sol:SignatureVerifyingPaymasterV07",
        constructorArguments: [ENTRY_POINT_V07_ADDRESS]
      });
      console.log('Implementation verification successful ✅');
    } catch (error: any) {
      if (error.message.includes('Already Verified')) {
        console.log('Implementation contract is already verified ✅');
      } else {
        console.error('Error verifying implementation:', error);
      }
    }

    console.log('\nVerification process completed!');
    console.log('You can now view your contracts:');
    console.log(`Implementation: ${getScannerUrl(chain)}/address/${implementationAddress}`);
    console.log("\n");
    console.log(`Proxy: ${getScannerUrl(chain)}/address/${proxyAddress}`);
    console.log("To verify the proxy contract, visit the link above and click `Is this a proxy?` and follow the instructions.");

  } catch (error) {
    console.error('Error during verification:', error);
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