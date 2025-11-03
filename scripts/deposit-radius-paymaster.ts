#!/usr/bin/env tsx
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  type Address,
  parseAbi,
  getContract,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

// Radius Testnet configuration
const radiusTestnet = {
  id: 1223953,
  name: 'Radius Testnet',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.RADIUS_TESTNET_RPC_URL || 'https://rpc.testnet.radiustech.xyz'] },
  },
};

// Contract addresses
const ENTRY_POINT_ADDRESS = '0x9b443e4bd122444852B52331f851a000164Cc83F' as const;
const PAYMASTER_ADDRESS = process.env.PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET as Address;

if (!PAYMASTER_ADDRESS) {
  console.error("❌ Error: PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET environment variable is not set");
  process.exit(1);
}

// Get deposit amount from environment or use default
const depositAmountStr = process.env.DEPOSIT_AMOUNT || '0.5';
const depositAmount = parseEther(depositAmountStr);

// EntryPoint ABI
const ENTRY_POINT_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function depositTo(address account) payable',
]);

// Paymaster ABI
const PAYMASTER_ABI = parseAbi([
  'function deposit() payable',
  'function entryPoint() view returns (address)',
]);

async function main() {
  console.log('='.repeat(60));
  console.log('Depositing Funds to Radius Testnet Paymaster');
  console.log('='.repeat(60));

  // Check for deployer private key
  let privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error("❌ Error: DEPLOYER_PRIVATE_KEY environment variable is not set");
    console.log("\nUsage: DEPOSIT_AMOUNT=1 DEPLOYER_PRIVATE_KEY=0x... npx tsx scripts/deposit-radius-paymaster.ts");
    process.exit(1);
  }

  // Add 0x prefix if missing
  if (!privateKey.startsWith("0x")) {
    privateKey = "0x" + privateKey;
  }

  console.log(`\nPaymaster: ${PAYMASTER_ADDRESS}`);
  console.log(`EntryPoint: ${ENTRY_POINT_ADDRESS}`);
  console.log(`Deposit Amount: ${formatEther(depositAmount)} USD`);

  // Create clients
  const publicClient = createPublicClient({
    chain: radiusTestnet,
    transport: http(),
  });

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: radiusTestnet,
    transport: http(),
  });

  console.log(`\nUsing account: ${account.address}`);

  try {
    // Check deployer balance
    const deployerBalance = await publicClient.getBalance({ address: account.address });
    console.log(`Deployer Balance: ${formatEther(deployerBalance)} USD`);

    if (deployerBalance < depositAmount) {
      console.error("\n❌ Error: Insufficient balance to deposit");
      console.log(`Need: ${formatEther(depositAmount)} USD`);
      console.log(`Have: ${formatEther(deployerBalance)} USD`);
      process.exit(1);
    }

    // Get EntryPoint contract
    const entryPointContract = getContract({
      address: ENTRY_POINT_ADDRESS,
      abi: ENTRY_POINT_ABI,
      client: { public: publicClient, wallet: walletClient },
    });

    // Check current paymaster deposit
    const paymasterBalanceBefore = await entryPointContract.read.balanceOf([PAYMASTER_ADDRESS]);

    console.log(`\nCurrent Paymaster Deposit: ${formatEther(paymasterBalanceBefore)} USD`);

    // Get paymaster contract
    const paymasterContract = getContract({
      address: PAYMASTER_ADDRESS,
      abi: PAYMASTER_ABI,
      client: { public: publicClient, wallet: walletClient },
    });

    // Verify EntryPoint address
    const paymasterEntryPoint = await paymasterContract.read.entryPoint();
    if (paymasterEntryPoint.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase()) {
      console.error(`\n❌ Error: Paymaster EntryPoint mismatch!`);
      console.log(`Expected: ${ENTRY_POINT_ADDRESS}`);
      console.log(`Got: ${paymasterEntryPoint}`);
      process.exit(1);
    }

    // Deposit to paymaster
    console.log("\nDepositing funds...");
    const txHash = await paymasterContract.write.deposit({
      value: depositAmount,
    });

    console.log(`\nTransaction Hash: ${txHash}`);
    console.log("Waiting for confirmation...");

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60000,
    });

    console.log("\n" + "=".repeat(60));
    console.log("✅ Deposit Successful!");
    console.log("=".repeat(60));
    console.log(`\nBlock Number: ${receipt.blockNumber}`);
    console.log(`Gas Used: ${receipt.gasUsed}`);
    console.log(`Status: ${receipt.status === 'success' ? 'Success' : 'Failed'}`);

    // Wait a few seconds for state to update
    console.log("\nWaiting for state update...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check new deposit
    const paymasterBalanceAfter = await entryPointContract.read.balanceOf([PAYMASTER_ADDRESS]);

    console.log(`\nNew Paymaster Deposit: ${formatEther(paymasterBalanceAfter)} USD`);
    console.log(`Deposit Increase: ${formatEther(paymasterBalanceAfter - paymasterBalanceBefore)} USD`);

    // Check deployer balance after
    const deployerBalanceAfter = await publicClient.getBalance({ address: account.address });
    console.log(`\nDeployer Balance After: ${formatEther(deployerBalanceAfter)} USD`);

    console.log(`\nExplorer: https://testnet.radius.xyz/tx/${txHash}`);
    console.log("\n✅ Paymaster is now funded and ready to sponsor transactions!");

  } catch (error) {
    console.error("\n❌ Deposit failed:", error);
    process.exit(1);
  }
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
