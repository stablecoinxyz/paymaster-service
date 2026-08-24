import { HardhatRuntimeEnvironment } from "hardhat/types";
import { parseEther, formatEther, getAddress, Address, http, createPublicClient, createWalletClient, getContract } from 'viem';
import { config as dotenvConfig } from 'dotenv';
import { getChain, getDeployerWalletClient, getRPCUrl, getPaymasterProxyAddress, getEntryPointAddress } from "../../src/helpers/utils";
import { ENTRYPOINT_V07_ABI } from "../../src/helpers/abi";
import { abi as SBC_PAYMASTER_V07_ABI } from "../../contracts/abi/SignatureVerifyingPaymasterV07.json";

dotenvConfig();

/**
 * Withdraw funds from the paymaster
 */
export async function main(hre: HardhatRuntimeEnvironment, amount: string = '0.05'): Promise<void> {
  try {
    const chain = hre.network.name;

    // Per-chain lookup: PROXY_ADDRESS holds one address and is wrong on other networks.
    const proxyAddress = getPaymasterProxyAddress(chain);

    // Parse the withdrawal amount
    const withdrawAmount = amount;
    const withdrawAmountWei = parseEther(withdrawAmount);

    // Get the wallet client and public client
    const deployer = getDeployerWalletClient(chain);
    const deployerAddress = deployer.account.address;
    const publicClient = createPublicClient({
      chain: getChain(chain),
      transport: http(getRPCUrl(chain)),
    });
    
    console.log(`Using account: ${deployerAddress}`);
    console.log(`\nWithdrawing from paymaster at address: ${proxyAddress}`);
    console.log(`Amount to withdraw: ${withdrawAmount} ETH`);

    // Get the contract
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
    
    // Get entry point info
    const entryPointAddress = await paymaster.read.entryPoint([]) as Address;
    console.log(`EntryPoint address: ${entryPointAddress}`);

    // Get current deposit info 
    const entryPointContract = getContract({
      address: getEntryPointAddress(chain),
      abi: ENTRYPOINT_V07_ABI,
      client: deployer,
    }); 

    const currentDeposit = await entryPointContract.read.balanceOf([proxyAddress as Address]) as bigint;
    console.log(`\nCurrent Paymaster deposit in EntryPoint: ${formatEther(currentDeposit)} ETH`);

    if (currentDeposit < withdrawAmountWei) {
      throw new Error(`Insufficient funds. Available: ${formatEther(currentDeposit)} ETH, Requested: ${withdrawAmount} ETH`);
    }

    // Send transaction to withdraw funds
    console.log('\nWithdrawing funds...');
    const txHash = await paymaster.write.withdrawTo([
      deployerAddress,
      withdrawAmountWei
    ]);
    
    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash
    });
    
    console.log(`Transaction hash: ${receipt.transactionHash}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // wait for 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check balances after
    const paymasterBalanceAfter = await entryPointContract.read.balanceOf([proxyAddress as Address]) as bigint;
    const deployerBalanceAfter = await publicClient.getBalance({ address: deployerAddress });

    console.log('\nBalances after withdrawal:');
    console.log(`Deployer: ${formatEther(deployerBalanceAfter)} ETH`);
    console.log(`Paymaster deposit in EntryPoint: ${formatEther(paymasterBalanceAfter)} ETH`);

    console.log(`\nSuccessfully withdrew ${formatEther(BigInt(withdrawAmountWei))} ETH from the EntryPoint`);

  } catch (error) {
    console.error('Error during withdrawal:', error);
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