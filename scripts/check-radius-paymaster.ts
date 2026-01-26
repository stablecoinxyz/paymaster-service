#!/usr/bin/env tsx
import {
  createPublicClient,
  http,
  formatEther,
  type Address,
  parseAbi,
} from 'viem';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

// Radius Testnet configuration
const radiusTestnet = {
  id: 72344,
  name: 'Radius Testnet',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.RADIUS_TESTNET_RPC_URL || 'https://rpc.testnet.radiustech.xyz'] },
  },
};

// Contract addresses
const ENTRY_POINT_ADDRESS = '0xfA15FF1e8e3a66737fb161e4f9Fa8935daD7B04F' as const;
const PAYMASTER_ADDRESS = process.env.PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET as Address;
if (!PAYMASTER_ADDRESS) {
  throw new Error("PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET environment variable is not set");
}

// EntryPoint ABI
const ENTRY_POINT_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function getDepositInfo(address account) view returns (uint256 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime)',
]);

// Paymaster ABI (minimal)
const PAYMASTER_ABI = parseAbi([
  'function owner() view returns (address)',
  'function entryPoint() view returns (address)',
  'function verifyingSigner() view returns (address)',
  'function maxAllowedGasCost() view returns (uint256)',
  'function VERSION() view returns (string)',
]);

async function main() {
  console.log('='.repeat(60));
  console.log('Checking Radius Testnet Paymaster Status');
  console.log('='.repeat(60));

  const publicClient = createPublicClient({
    chain: radiusTestnet,
    transport: http(),
  });

  console.log(`\nPaymaster: ${PAYMASTER_ADDRESS}`);
  console.log(`EntryPoint: ${ENTRY_POINT_ADDRESS}`);

  try {
    // Check paymaster balance in EntryPoint
    const balance = await publicClient.readContract({
      address: ENTRY_POINT_ADDRESS,
      abi: ENTRY_POINT_ABI,
      functionName: 'balanceOf',
      args: [PAYMASTER_ADDRESS as Address],
    });

    console.log(`\n💰 Paymaster Deposit: ${formatEther(balance)} USD`);

    // Get detailed deposit info
    const depositInfo = await publicClient.readContract({
      address: ENTRY_POINT_ADDRESS,
      abi: ENTRY_POINT_ABI,
      functionName: 'getDepositInfo',
      args: [PAYMASTER_ADDRESS as Address],
    });

    console.log(`\nDeposit Details:`);
    console.log(`  Deposit: ${formatEther(depositInfo[0])} USD`);
    console.log(`  Staked: ${depositInfo[1]}`);
    console.log(`  Stake: ${formatEther(depositInfo[2] || 0n)} USD`);

    // Try to get paymaster contract info
    try {
      const [owner, verifier, maxGasCost, version] = await Promise.all([
        publicClient.readContract({
          address: PAYMASTER_ADDRESS as Address,
          abi: PAYMASTER_ABI,
          functionName: 'owner',
        }),
        publicClient.readContract({
          address: PAYMASTER_ADDRESS as Address,
          abi: PAYMASTER_ABI,
          functionName: 'verifyingSigner',
        }),
        publicClient.readContract({
          address: PAYMASTER_ADDRESS as Address,
          abi: PAYMASTER_ABI,
          functionName: 'maxAllowedGasCost',
        }),
        publicClient.readContract({
          address: PAYMASTER_ADDRESS as Address,
          abi: PAYMASTER_ABI,
          functionName: 'VERSION',
        }).catch(() => 'Unknown'),
      ]);

      console.log(`\nPaymaster Contract Info:`);
      console.log(`  Version: ${version}`);
      console.log(`  Owner: ${owner}`);
      console.log(`  Verifying Signer: ${verifier}`);
      console.log(`  Max Allowed Gas Cost: ${formatEther(maxGasCost)} USD`);
    } catch (error) {
      console.log('\n(Could not fetch paymaster contract details)');
    }

    // Status assessment
    console.log('\n' + '='.repeat(60));
    if (balance === 0n) {
      console.log('❌ STATUS: EMPTY - Paymaster has no deposit!');
      console.log('\nThe paymaster cannot sponsor any transactions.');
      console.log('Run the funding script to deposit USD.');
    } else if (balance < 100000000000000000n) { // Less than 0.1 USD
      console.log('⚠️  STATUS: LOW - Paymaster deposit is critically low!');
      console.log('\nConsider depositing more funds soon.');
    } else {
      console.log('✅ STATUS: OK - Paymaster has sufficient deposit');
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
