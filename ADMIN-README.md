# UUPS Upgradeable Paymaster

This repository contains a UUPS (Universal Upgradeable Proxy Standard) implementation of the SignatureVerifyingPaymasterV07 contract for ERC-4337 account abstraction.

Common management tasks are handled by the admin scripts, defined as hardhat tasks.

## Overview

The UUPS proxy pattern allows for upgrading contract logic while maintaining the same contract address and state. This is particularly useful for a paymaster service that needs to evolve over time while keeping the same trusted address.

## Setup

### Configuration

Create a `.env` file (run `cp .env.example .env` to create it) in the root directory with the following variables:

```bash
ENTRY_POINT_V07_ADDRESS=""

BASE_SEPOLIA_RPC_URL=""
BASE_RPC_URL=""

BASE_SEPOLIA_BUNDLER_URL=""
BASE_BUNDLER_URL=""

BASESCAN_API_KEY=""

# Proxy address of the Paymaster (from the initial deployment)
PROXY_ADDRESS=""

# Deployer wallet private key
DEPLOYER_PRIVATE_KEY="0x..."

# Trusted signer wallet address
TRUSTED_SIGNER="0x..."
# Trusted signer wallet private key
TRUSTED_SIGNER_PRIVATE_KEY="0x..."
```

## Admin Scripts

Admin scripts are organized in the `scripts/tasks` folder.

```text
scripts/
├── tasks/
│   ├── check-paymaster-status.ts
│   ├── deploy-paymaster.ts
│   ├── deposit-funds.ts
│   ├── update-gas-limit.ts
│   ├── update-signer.ts
│   ├── verify-source.ts
│   └── withdraw-funds.ts
```

## Using the Tasks

### Deployment

To deploy the initial implementation and proxy:

```bash
npx hardhat deploy-paymaster --network <your-network>
```

**NOTE:** After your initial deploy, save the proxy address that is output by the script in your `.env` file.

### Checking Paymaster Status

To check the current status of your paymaster:

```bash
npx hardhat paymaster-status --network <your-network>
```

This will show:

- Implementation address
- Owner address
- EntryPoint address
- Trusted signer
- **Max Allowed Gas Cost** *(new)*
- Current Deposit in EntryPoint
- Contract version
- **EIP712 Domain Separator** *(new)*

Example output:

```text
Implementation address: 0x9a1a3a87aa6E40CBc20955E02479dD8f654cD073
Owner: 0x124b082e8DF36258198da4Caa3B39c7dFa64D9cE
EntryPoint: 0x0000000071727De22E5E9d8BAf0edAc6f37da032
Verifying Signer: 0xbb46C0C1792d7b606Db07cead656efd93b433222
Max Allowed Gas Cost: 0.01 ETH

Paymaster ETH balance: 0.01 ETH

Contract version: 4
EIP712 Domain Separator: 0x1234...abcd
```

### Funding the Paymaster

Send ETH to the proxy address.

Configure the amount of ETH in `scripts/tasks/deposit-funds.ts`. Call the `deposit()` function on the proxy to transfer funds to the EntryPoint:

```bash
npx hardhat deposit-funds --network <your-network>
```

### Withdrawing Funds

To withdraw funds from EntryPoint back to the proxy:

```bash
npx hardhat withdraw-funds --network <your-network>
```

or

```bash
npx hardhat withdraw-funds --amount 0.01 --network <your-network>
```

### Verifying the Contract source

To verify the implementation contract source code on Etherscan:

```bash
npx hardhat verify-source --network <your-network>
```

To verify the proxy contract in order to access read and write functions on the blockchain scanner interface, go to the proxy address and click on the "Contract" tab, then click on the "Is this a proxy?" button and follow the instructions there.

### Updating the Trusted Signer

To change the address authorized to sign paymaster approvals:

```bash
npx hardhat update-signer --address 0xNewSignerAddress --network <your-network>
```

### Updating the Gas Limit *(new)*

To change the maximum allowed gas cost the paymaster will sponsor:

```bash
npx hardhat update-gas-limit --limit 0.02 --network <your-network>
```

This sets the maximum gas cost to 0.02 ETH. The paymaster will reject any UserOperations that would cost more than this limit.

Valid range: 0.001 ETH to 1.0 ETH

### Upgrading the implementation

When you need to upgrade the implementation:

1. Make changes to the `SignatureVerifyingPaymasterV07.sol` contract and update the version number
2. Make sure your changes are compatible with the existing storage layout (only add new variables at the end of the contract)
3. Compile the contract successfully (`npm run compile`) and copy the ABI and bytecode to the `contracts/abi` folder (`npm run copy`)
4. Ensure the proxy address (PROXY_ADDRESS) is set in your `.env` file
5. Run the upgrade task:

```bash
npx hardhat upgrade-paymaster --network <your-network>
```

## Important Considerations

### Storage Layout

When upgrading, be careful not to modify the existing storage layout. New variables should be added at the end of the contract. A storage gap to reserve slots for future use.

Some important points to remember:

- Different types take different numbers of slots:
  - uint256, address, etc. = 1 slot
  - bytes32 = 1 slot
  - string, bytes = 1 slot for short values, more for longer ones
  - mappings = 1 slot (but their data is stored elsewhere)
  - arrays = 1 slot for length + slots for elements

The gap must always be reduced by the exact number of slots your new variables use to maintain the correct storage layout.

If you don't reduce the gap correctly, you risk:

- Storage collisions (variables overwriting each other)
- Corrupted state
- Failed upgrades

It's a good practice to:

- Comment the gap reduction reason
- Keep track of remaining gap slots
- Document storage layout changes between versions

```solidity
// V1
contract PaymasterV1 {
    uint256 public originalVar;
    uint256[50] private __gap; // 50 slots reserved for future use
}

// V2
contract PaymasterV2 {
    uint256 public originalVar;
    uint256 public newCounter;     // +1 slot
    mapping(address => bool) public newMapping; // +1 slot
    uint256[48] private __gap;    // 50 - 2 = 48 slots remaining
}
```

## Using the Paymaster in Your Application

The proxy address is the address to use in your application when interacting with the paymaster. This address will remain constant even as the implementation is upgraded.

### Creating a Paymaster Approval with viem

Generate a signature for a user operation (construct the `paymasterAndData` field) using viem:

```typescript
import { createWalletClient, custom, encodePacked, keccak256, toBytes, getAddress, concatHex, padHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';

// Setup the wallet client with the trusted signer
const signer = privateKeyToAccount('0x' + process.env.TRUSTED_SIGNER_PRIVATE_KEY);
const walletClient = createWalletClient({
  chain: mainnet, // or your target chain
  account: signer
});

// Create timestamps (48-bit each = 6 bytes)
const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
const validAfter = BigInt(Math.floor(Date.now() / 1000) - 60); // Valid from 1 minute ago

// Encode the timestamps as bytes6 (48 bits)
const encodedValidUntil = padHex(validUntil.toString(16), { size: 6 });
const encodedValidAfter = padHex(validAfter.toString(16), { size: 6 });

// Data to sign
const chainId = await publicClient.getChainId();
const paymasterAddress = getAddress('0x...'); // Your paymaster proxy address
const senderAddress = getAddress('0x...'); // The account making the request

// Pack data for signing
const packedData = encodePacked(
  ['uint48', 'uint48', 'uint256', 'address', 'address'],
  [validUntil, validAfter, chainId, paymasterAddress, senderAddress]
);

// Hash the packed data
const messageHash = keccak256(packedData);

// Sign the hash
const signature = await walletClient.signMessage({
  message: { raw: toBytes(messageHash) }
});

// Combine for the paymasterAndData field
const paymasterAndData = concatHex([
  paymasterAddress,
  encodedValidUntil,
  encodedValidAfter,
  signature
]);
```
