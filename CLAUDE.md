# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a UUPS-upgradeable ERC-4337 v0.7 paymaster service built with Fastify and deployed to Railway. It sponsors UserOperations if they have a valid EIP-712 signature from a trusted signer. The service supports Base Sepolia, Base Mainnet, and Radius Testnet.

## Development Commands

### Contract Development

```bash
# Compile contracts and copy ABIs to src/contracts/abi/
npm run copy

# Run Hardhat compilation only
npm run compile
```

### Service Development

```bash
# Start the paymaster service locally (runs on port 3000)
npm run start
```

## Admin Scripts

The project supports both **Hardhat tasks** and **Foundry scripts** for contract management. Both accomplish the same operations.

### Hardhat Tasks (TypeScript-based)

Located in `scripts/tasks/`. Run with network flag:

```bash
# Deploy initial proxy and implementation
npx hardhat deploy-paymaster --network <network>

# Upgrade implementation contract
npx hardhat upgrade-paymaster --network <network>

# Fund the paymaster (deposits to EntryPoint)
npx hardhat deposit-funds --network <network>

# Withdraw funds from paymaster
npx hardhat withdraw-funds --amount 0.01 --network <network>

# Check paymaster status (balance, signer, gas limit)
npx hardhat paymaster-status --network <network>

# Update trusted signer address
npx hardhat update-signer --address 0x... --network <network>

# Update max allowed gas cost
npx hardhat update-gas-limit --limit 0.02 --network <network>

# Verify source code on block explorer
npx hardhat verify-source --network <network>
```

### Foundry Scripts (Solidity-based)

Located in `script/`. Run with forge:

```bash
# Deploy
forge script script/DeployPaymaster.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY

# Upgrade
forge script script/UpgradePaymaster.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY

# Fund
forge script script/DepositFunds.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY

# Check status
forge script script/CheckStatus.s.sol --rpc-url $RPC_URL
```

## Architecture

### Core Components

**Smart Contract** (`contracts/SignatureVerifyingPaymasterV07.sol`)
- UUPS-upgradeable paymaster implementing ERC-4337 v0.7
- Uses EIP-712 typed signatures for paymaster approvals
- Signature includes: `validUntil`, `validAfter`, `sender`, `nonce`, and `calldataHash` to prevent replay attacks
- Has `maxAllowedGasCost` limit to prevent excessive gas sponsorship
- Inherits: `BasePaymaster`, `UUPSUpgradeable`, `EIP712Upgradeable`, `OwnableUpgradeable`
- Storage gap of 48 slots for future upgrades

**Fastify Service** (`src/`)
- Entry point: `src/index.ts` (initializes Sentry and starts server)
- Routes: `src/routes/index.ts` defines `/rpc/v1/:chain` endpoint
- RPC handler: `src/relay.ts` implements paymaster methods
- Utilities: `src/helpers/utils.ts` for chain configs and wallet clients

### Signature Flow

1. Client sends UserOperation to `/rpc/v1/:chain` endpoint
2. Service validates the request against schema (`src/helpers/schema.ts`)
3. Service generates EIP-712 signature using:
   - Domain: `SignatureVerifyingPaymaster`, version `5`, chainId, paymaster address
   - Message: `validUntil`, `validAfter`, `sender`, `nonce`, `calldataHash`
4. Returns `paymasterData` combining timestamps (6 bytes each) + signature (65 bytes)
5. Bundler submits to EntryPoint which validates signature on-chain

### Supported RPC Methods

All methods are handled in `src/relay.ts`:

- `pm_getPaymasterStubData`: Returns paymaster data without gas estimation
- `pm_getPaymasterData`: Returns paymaster data with default gas limits
- `pm_sponsorUserOperation`: Returns paymaster data WITH gas estimation from bundler
- `eth_estimateUserOperationGas`: Returns paymaster data WITH gas estimation from bundler

### Chain Configuration

Supported chains are defined in `src/helpers/utils.ts`:
- `baseSepolia` - Base Sepolia testnet
- `base` - Base mainnet
- `radiusTestnet` - Radius testnet (custom chain config)
- `localhost` / `hardhat` - Local development

Each chain requires env vars for: RPC URL, Bundler URL, and API keys.

### Storage Layout & UUPS Upgrades

**Critical**: When upgrading the paymaster contract, storage layout MUST be preserved:
- Never reorder, remove, or change types of existing variables
- New variables must be added at the END
- Reduce `__gap` by exact number of slots used by new variables (see docs/ADMIN-README.md lines 220-260)
- Use `reinitializer(N)` for initialization functions in upgraded versions

Current storage layout (v5):
- `verifyingSigner` (address)
- `maxAllowedGasCost` (uint256)
- `VERSION` (constant)
- `__gap[48]` (reserved slots)

### Environment Variables

Required environment variables (see `.env.example`):
- `ENTRY_POINT_V07_ADDRESS` - EntryPoint contract address (0x0000000071727De22E5E9d8BAf0edAc6f37da032)
- `PROXY_ADDRESS` - Deployed paymaster proxy address
- `DEPLOYER_PRIVATE_KEY` - Admin wallet for deploying/upgrading
- `TRUSTED_SIGNER` - Address authorized to sign paymaster approvals
- `TRUSTED_SIGNER_PRIVATE_KEY` - Private key for signing
- `BASE_SEPOLIA_RPC_URL`, `BASE_RPC_URL`, etc. - Chain RPC URLs
- `BASE_SEPOLIA_BUNDLER_URL`, `BASE_BUNDLER_URL`, etc. - Bundler URLs
- `BASESCAN_API_KEY` - For contract verification

### Testing & Validation

The service validates all incoming requests using Zod schemas in `src/helpers/schema.ts`. Gas estimation is performed by the bundler client (Pimlico).

### Error Handling

- Sentry is integrated for error tracking (`src/index.ts`, `src/routes/index.ts`)
- Custom RPC errors defined in `src/helpers/schema.ts`
- Chain validation ensures only supported chains are processed

## Key Implementation Details

**Private Key Handling**: The `src/helpers/utils.ts` automatically adds "0x" prefix to private keys if missing (see recent commit).

**Paymaster Data Format**:
- Bytes 0-5: `validUntil` (uint48, 6 bytes)
- Bytes 6-11: `validAfter` (uint48, 6 bytes)
- Bytes 12-76: Signature (65 bytes)

**EIP-712 Domain**: Domain name is "SignatureVerifyingPaymaster" with version "5". The version number in the domain MUST match the `VERSION` constant in the smart contract.

**Gas Limits**: Default values when not estimating:
- `callGasLimit`: 500,000
- `verificationGasLimit`: 500,000
- `preVerificationGas`: 100,000
- `paymasterVerificationGasLimit`: 100,000
- `paymasterPostOpGasLimit`: 50,000

## Related Documentation

- `docs/ADMIN-README.md` - Comprehensive admin guide with deployment and upgrade instructions
- `docs/AUDITOR-README.md` - Information for security auditors
- `docs/AUDIT-FIXES.md` - Fixes applied after security audit
- `docs/CHANGELOG.md` - Version history
- `docs/FOUNDRY-SETUP.md` - Foundry configuration details
- Please take extreme care before making any changes to this repo. Always ask me first to confirm before doing any changes, big or small
- Always ask me to change .env and related files myself.