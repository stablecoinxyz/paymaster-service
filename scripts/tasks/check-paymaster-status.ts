import { HardhatRuntimeEnvironment } from "hardhat/types";
import { formatEther, getAddress, Address, getContract, http, createPublicClient, Hex } from 'viem';
import { config as dotenvConfig } from 'dotenv';
import { ENTRYPOINT_V07_ABI } from "../../src/helpers/abi";
import { getChain, getDeployerWalletClient, getRPCUrl, getEntryPointAddress, getPaymasterProxyAddress } from "../../src/helpers/utils";
import { abi as SBC_PAYMASTER_V07_ABI } from "../../contracts/abi/SignatureVerifyingPaymasterV07.json";

dotenvConfig();

/**
 * Check the status of the paymaster contract
 */
export async function main(hre: HardhatRuntimeEnvironment): Promise<void> {
  try { 
    const chain = hre.network.name;

    // Per-chain lookup: PROXY_ADDRESS holds one address and is wrong on other networks.
    const proxyAddress = getPaymasterProxyAddress(chain);

    console.log(`Checking paymaster at address: ${proxyAddress}`);

    // Setup clients
    const deployer = getDeployerWalletClient(chain);
    const publicClient = createPublicClient({
      chain: getChain(chain),
      transport: http(getRPCUrl(chain)),
    });
    console.log(`Connected to network: ${await publicClient.getChainId()}`);

    // Get the contract
    const paymaster = getContract({
      address: proxyAddress,
      abi: SBC_PAYMASTER_V07_ABI,
      client: publicClient,
    });

    // Get the implementation address (using storage slot for ERC1967)
    const implementationSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
    const implAddressData = await publicClient.getStorageAt({
      address: proxyAddress as Address,
      slot: implementationSlot
    });
    
    const implementationAddress = getAddress('0x' + (implAddressData?.slice(26) || ''));
    
    // Get contract information
    const [owner, entryPoint, verifier, maxGasCost] = await Promise.all([
      paymaster.read.owner([]) as Promise<Address>,
      paymaster.read.entryPoint([]) as Promise<Address>,
      paymaster.read.verifyingSigner([]) as Promise<Address>,
      paymaster.read.maxAllowedGasCost([]) as Promise<bigint>
    ]);

    // Get balance information (use the chain-specific EntryPoint, e.g. custom on Radius)
    const entryPointContract = getContract({
      address: getEntryPointAddress(chain),
      abi: ENTRYPOINT_V07_ABI,
      client: deployer,
    });
    const paymasterBalance = await entryPointContract.read.balanceOf([proxyAddress as Address]) as bigint;
    
    console.log('\n=== Paymaster Information ===');
    console.log(`Implementation address: ${implementationAddress}`);
    console.log(`Owner: ${owner}`);
    console.log(`EntryPoint: ${entryPoint}`);
    console.log(`Verifying Signer: ${verifier}`);
    console.log(`Max Allowed Gas Cost: ${formatEther(maxGasCost)} ETH`);
    console.log(`\nPaymaster ETH balance: ${formatEther(paymasterBalance)} ETH`);

    // Check if the contract has any version information
    try {
      // getDomainName/getDomainVersion are not on this contract; eip712Domain is the
      // standard accessor and returns (fields, name, version, chainId, ...).
      const [version, domainSeparator, eip712Domain] = await Promise.all([
        paymaster.read.VERSION(),
        paymaster.read.domainSeparator(),
        paymaster.read.eip712Domain()
      ]) as [bigint, Hex, readonly unknown[]];

      console.log(`\nContract version: ${version}`);
      console.log(`\nEIP712 Information:`);
      console.log(`Domain Name: ${eip712Domain[1]}`);
      console.log(`Domain Version: ${eip712Domain[2]}`);
      console.log(`Domain Separator: ${domainSeparator}`);
    } catch (error) {
      console.log(`\nContract version: unavailable (${error instanceof Error ? error.message.split('\n')[0] : 'unknown error'})`);
    }

    // If paymaster has insufficient deposit, provide a warning
    if (paymasterBalance < BigInt(1e16)) { // Less than 0.01 ETH
      console.log('\n⚠️ WARNING: Low deposit in EntryPoint. Consider funding the paymaster.');
      console.log('Run the deposit-funds task to add funds.');
    }

    console.log('\nStatus check completed ✅');

  } catch (error) {
    console.error('Error checking paymaster status:', error);
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