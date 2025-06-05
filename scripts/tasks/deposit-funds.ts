import { HardhatRuntimeEnvironment } from "hardhat/types";
import { 
  parseEther, 
  formatEther, 
  getAddress, 
  Address, 
  http, 
  createPublicClient, 
  getContract, 
} from 'viem';
import { config as dotenvConfig } from 'dotenv';
import { getChain, getDeployerWalletClient, getRPCUrl } from "../../src/helpers/utils";
import { ENTRYPOINT_V07_ABI } from "../../src/helpers/abi";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless/utils";

dotenvConfig();

// Amount to deposit (in ETH)
const depositAmount = '0.02'; // 0.02 ETH

/**
 * Fund the paymaster by sending ETH to the EntryPoint
 */
export async function main(hre: HardhatRuntimeEnvironment): Promise<void> {
  try {
    const chain = hre.network.name;

    // Get the proxy address from environment
    const proxyAddress = process.env.PROXY_ADDRESS;
    if (!proxyAddress || !isValidAddress(proxyAddress)) {
      throw new Error('Invalid or missing PROXY_ADDRESS in .env file');
    }

    const depositAmountWei = parseEther(depositAmount);

    console.log(`Funding paymaster at address: ${proxyAddress}`);
    console.log(`Amount to deposit: ${depositAmount} ETH`);

    // Get the wallet client and public client
    const publicClient = createPublicClient({
      chain: getChain(chain),
      transport: http(getRPCUrl(chain)),
    });
    const deployer = getDeployerWalletClient(chain);
    const deployerAddress = deployer.account.address;
    
    
    console.log(`Using account: ${deployerAddress}`);

    // Get the contract
    const paymaster = await hre.viem.getContractAt('contracts/SignatureVerifyingPaymasterV07.sol:SignatureVerifyingPaymasterV07', proxyAddress as Address);

    // Get the entry point contract
    const entryPointAddress = await paymaster.read.entryPoint([]) as Address;
    const entryPointContract = getContract({
      address: ENTRYPOINT_ADDRESS_V07,
      abi: ENTRYPOINT_V07_ABI,
      client: deployer,
    });
    console.log(`EntryPoint address: ${entryPointAddress}`);

    // Check balances before
    const deployerBalanceBefore = await publicClient.getBalance({ address: deployerAddress });
    const paymasterBalanceBefore = await entryPointContract.read.balanceOf([proxyAddress as Address]) as bigint;
    
    console.log('\nBalances before funding:');
    console.log(`Deployer: ${formatEther(deployerBalanceBefore)} ETH`);
    console.log(`Paymaster: ${formatEther(paymasterBalanceBefore)} ETH`);

    // Send transaction to deposit funds
    console.log('\nDepositing funds...');
    const txHash = await paymaster.write.deposit([], {
      value: depositAmountWei
    });
    
    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash
    });
    
    console.log(`Transaction hash: ${receipt.transactionHash}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // wait for 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check balances after
    const deployerBalanceAfter = await publicClient.getBalance({ address: deployerAddress });
    const paymasterBalanceAfter = await entryPointContract.read.balanceOf([proxyAddress as Address]) as bigint;
    
    console.log('\nBalances after funding:');
    console.log(`Deployer: ${formatEther(deployerBalanceAfter)} ETH`);
    console.log(`Paymaster: ${formatEther(paymasterBalanceAfter)} ETH`);

    // Calculate the deposited amount
    const depositedAmount = paymasterBalanceAfter - paymasterBalanceBefore;
    console.log(`\nSuccessfully deposited ${formatEther(BigInt(depositedAmount))} ETH to the EntryPoint`);

  } catch (error) {
    console.error('Error during deposit:', error);
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