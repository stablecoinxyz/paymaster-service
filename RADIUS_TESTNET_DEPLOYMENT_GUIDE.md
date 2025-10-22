# Radius Testnet Deployment Guide

This guide documents the complete deployment process for the SignatureVerifyingPaymasterV07 to Radius Testnet, based on a successful production deployment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Understanding the Architecture](#understanding-the-architecture)
3. [Environment Setup](#environment-setup)
4. [Deployment Process](#deployment-process)
5. [Verification](#verification)
6. [Service Configuration](#service-configuration)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Deployments

Before deploying the paymaster, ensure you have:

✅ **EntryPoint v0.7** deployed to Radius Testnet
- Note: The canonical address (`0x0000000071727de22e5e9d8baf0edac6f37da032`) may not be available
- You can deploy to any address using the official EntryPoint contract
- Example deployment: `0x9b443e4bd122444852B52331f851a000164Cc83F`

✅ **SimpleAccountFactory** (or your account factory) deployed
- Example deployment: `0x4DEbDe0Be05E51432D9afAf61D84F7F0fEA63495`

### Tools Required

- **Foundry** (forge, cast) - Install from https://book.getfoundry.sh/
- **Node.js & npm** - For the paymaster service
- **RADIUS testnet tokens** - For funding the paymaster (gas is free but value transfers need tokens)

### Radius Testnet Details

- **Chain ID**: `1223953` (hex: `0x12ad11`)
- **RPC URL**: `https://rpc.testnet.radiustech.xyz/hnijtvptpk6peww9fzxgeji51254buchlb60ihrgmbds5mfr`
- **Block Explorer**: https://testnet.radiustech.xyz/
- **Gas Price**: FREE (0 gwei)
- **Documentation**: https://docs.radiustech.xyz/

---

## Understanding the Architecture

### Key Concept: OpenZeppelin Contracts

**Important**: OpenZeppelin contracts (UUPS, EIP712, Ownable, etc.) are **library code compiled directly into your contract bytecode**. They do NOT need to be separately deployed to Radius Testnet. This is a common misconception.

### Deployment Components

The paymaster uses the UUPS (Universal Upgradeable Proxy Standard) pattern:

1. **Implementation Contract** (`SignatureVerifyingPaymasterV07`)
   - Contains all the logic and code
   - Can be upgraded by deploying a new implementation
   - Example address: `0xe88c76De10099cCC623EAe15AE7Dd4b6AF9cCcda`

2. **Proxy Contract** (`ERC1967Proxy`)
   - User-facing address (never changes)
   - Stores all state and delegates calls to implementation
   - Example address: `0xD969454b59F4BC2CF19dC37A37aC10eF6495CD8D`
   - **Always use the proxy address in your applications**

### How the Paymaster Works

1. Client sends a UserOperation to your paymaster service
2. Service generates an EIP-712 signature using the trusted signer
3. Signature includes: `validUntil`, `validAfter`, `sender`, `nonce`, `calldataHash`
4. PaymasterData returned: 6 bytes validUntil + 6 bytes validAfter + 65 bytes signature
5. Bundler includes this in the UserOperation and submits to EntryPoint
6. EntryPoint validates the signature on-chain and sponsors the transaction

---

## Environment Setup

### Step 1: Configure `.env` File

Create or update your `.env` file with the following variables:

```bash
# Radius Testnet RPC
RADIUS_TESTNET_RPC_URL=https://rpc.testnet.radiustech.xyz/hnijtvptpk6peww9fzxgeji51254buchlb60ihrgmbds5mfr

# EntryPoint v0.7 (use YOUR deployed address)
ENTRY_POINT_V07_ADDRESS=0x9b443e4bd122444852B52331f851a000164Cc83F

# Deployer wallet (needs RADIUS tokens for funding paymaster)
DEPLOYER_PRIVATE_KEY=0x...

# Trusted Signer (authorizes paymaster approvals)
TRUSTED_SIGNER=0x...
TRUSTED_SIGNER_PRIVATE_KEY=0x...

# Will be filled in after deployment
PROXY_ADDRESS=

# Bundler URL (configure based on your bundler setup)
RADIUS_TESTNET_BUNDLER_URL=
```

### Step 2: Verify Network Configuration

The repository already includes Radius Testnet support in:
- `hardhat.config.ts` - network configuration for Hardhat
- `src/helpers/utils.ts` - chain configuration for the service

```typescript
// Already configured in utils.ts
const radiusTestnet = {
  id: 1223953,
  name: "Radius Testnet",
  network: "radiusTestnet",
  nativeCurrency: { name: "Radius", symbol: "RADIUS", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.radiustech.xyz/..."] },
    public: { http: ["https://rpc.testnet.radiustech.xyz/..."] }
  }
};
```

### Step 3: Run Pre-Deployment Check

Use the provided check script to verify your setup:

```bash
chmod +x check-radius-setup.sh
./check-radius-setup.sh
```

This will verify:
- Environment variables are set
- RPC connectivity
- EntryPoint exists on-chain
- Wallet balances
- Foundry installation

---

## Deployment Process

### Known Issue: Multi-Transaction Scripts

⚠️ **Important**: Radius Testnet has a quirk where forge scripts with multiple transactions may fail with nonce errors. The first transaction succeeds, but subsequent ones fail.

**Solution**: Deploy implementation and proxy separately.

### Step 1: Compile Contracts

```bash
forge build
```

Expected output: Successful compilation with no errors.

### Step 2: Deploy Implementation and Proxy (Separately)

Due to the nonce issue, we deploy in two stages:

#### Option A: Use Provided Helper Script (Recommended)

The repository includes `script/DeployProxyOnly.s.sol` for this purpose:

```bash
# First, try the full deployment (implementation will deploy)
forge script script/DeployPaymaster.s.sol \
  --rpc-url $RADIUS_TESTNET_RPC_URL \
  --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --legacy

# This will succeed for implementation but fail for proxy
# Note the implementation address from output

# Then deploy just the proxy using the deployed implementation
forge script script/DeployProxyOnly.s.sol \
  --rpc-url $RADIUS_TESTNET_RPC_URL \
  --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --legacy
```

#### Option B: Manual Deployment

If you need more control:

```bash
# Deploy implementation
forge create contracts/SignatureVerifyingPaymasterV07.sol:SignatureVerifyingPaymasterV07 \
  --rpc-url $RADIUS_TESTNET_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args $ENTRY_POINT_V07_ADDRESS \
  --legacy

# Deploy proxy (replace IMPL_ADDRESS with deployed implementation)
forge create lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy \
  --rpc-url $RADIUS_TESTNET_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args <IMPL_ADDRESS> <INIT_DATA> \
  --legacy
```

### Step 3: Note the Addresses

From the deployment output, save:
- **Implementation Address**: e.g., `0xe88c76De10099cCC623EAe15AE7Dd4b6AF9cCcda`
- **Proxy Address**: e.g., `0xD969454b59F4BC2CF19dC37A37aC10eF6495CD8D`

**Update your `.env` file** with the proxy address:
```bash
PROXY_ADDRESS=0xD969454b59F4BC2CF19dC37A37aC10eF6495CD8D
```

### Step 4: Fund the Paymaster

The paymaster needs RADIUS tokens deposited into the EntryPoint to sponsor transactions.

```bash
# Ensure your deployer wallet has RADIUS tokens first
cast balance $DEPLOYER_ADDRESS --rpc-url $RADIUS_TESTNET_RPC_URL

# Deploy funds (default: 0.02 RADIUS)
forge script script/DepositFunds.s.sol \
  --rpc-url $RADIUS_TESTNET_RPC_URL \
  --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --legacy
```

**Note**: If the script fails with `OutOfFunds`, you need RADIUS testnet tokens. Contact the Radius team or use their faucet.

---

## Verification

### Verify Deployment Success

Run these commands to confirm everything is working:

```bash
# 1. Check version (should return 5)
cast call $PROXY_ADDRESS "VERSION()(uint256)" --rpc-url $RADIUS_TESTNET_RPC_URL

# 2. Check owner (should return your deployer address)
cast call $PROXY_ADDRESS "owner()(address)" --rpc-url $RADIUS_TESTNET_RPC_URL

# 3. Check trusted signer (should return your signer address)
cast call $PROXY_ADDRESS "verifyingSigner()(address)" --rpc-url $RADIUS_TESTNET_RPC_URL

# 4. Check max allowed gas cost (should return 10000000000000000 = 0.01 ETH)
cast call $PROXY_ADDRESS "maxAllowedGasCost()(uint256)" --rpc-url $RADIUS_TESTNET_RPC_URL

# 5. Check paymaster balance in EntryPoint (should be > 0)
cast call $ENTRY_POINT_V07_ADDRESS "balanceOf(address)(uint256)" $PROXY_ADDRESS --rpc-url $RADIUS_TESTNET_RPC_URL
```

### Expected Output

```bash
VERSION: 5
Owner: 0xbb46C0C1792d7b606Db07cead656efd93b433222
Trusted Signer: 0x4a9f2769438FEAA328C28404Dd29d1917589FC45
Max Gas Cost: 10000000000000000 [1e16]
EntryPoint Balance: 20000000000000000 [2e16]
```

### View on Block Explorer

Visit the Radius Testnet explorer to view your deployment:
- Implementation: https://testnet.radiustech.xyz/testnet/address/0xe88c76De10099cCC623EAe15AE7Dd4b6AF9cCcda
- Proxy: https://testnet.radiustech.xyz/testnet/address/0xD969454b59F4BC2CF19dC37A37aC10eF6495CD8D

---

## Service Configuration

### Step 1: Configure Bundler

Add your bundler URL to `.env`:

```bash
RADIUS_TESTNET_BUNDLER_URL="http://your-bundler-url:4337"
```

Options for bundlers:
- **Run your own**: Deploy Alto, Skandha, or Stackup bundler
- **Use a service**: Check if Pimlico or other providers support Radius
- **Contact Radius**: They may provide a public bundler endpoint

### Step 2: Start the Paymaster Service

```bash
npm run start
```

The service will start on port 3000 (or `$PORT` if set).

### Step 3: Test the Service

```bash
# Health check
curl http://localhost:3000/

# Ping endpoint
curl http://localhost:3000/ping

# Test paymaster endpoint (requires valid UserOperation)
curl -X POST http://localhost:3000/rpc/v1/radiusTestnet \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "pm_getPaymasterStubData",
    "params": [...]
  }'
```

### Step 4: Integrate with Your Application

Your application should send UserOperations to:
```
POST http://localhost:3000/rpc/v1/radiusTestnet
```

Supported RPC methods:
- `pm_getPaymasterStubData` - Get paymaster data without gas estimation
- `pm_getPaymasterData` - Get paymaster data with default gas limits
- `pm_sponsorUserOperation` - Get paymaster data WITH gas estimation
- `eth_estimateUserOperationGas` - Estimate gas and get paymaster data

---

## Troubleshooting

### Issue: "Nonce too high" Error

**Symptom**: `transaction validation error: nonce X too high, expected Y`

**Cause**: Forge is simulating multiple transactions but only the first succeeds on Radius Testnet.

**Solution**: Use the `DeployProxyOnly.s.sol` script to deploy the proxy separately after the implementation deploys.

### Issue: "Out of Funds" Error

**Symptom**: `EvmError: OutOfFunds` when running DepositFunds script

**Cause**: Your deployer wallet doesn't have RADIUS tokens (gas is free but value transfers need tokens).

**Solution**:
1. Request testnet RADIUS tokens from the Radius team
2. Check balance: `cast balance $DEPLOYER_ADDRESS --rpc-url $RADIUS_TESTNET_RPC_URL`
3. Retry after receiving tokens

### Issue: EntryPoint Not Found

**Symptom**: Check script shows "EntryPoint not found" or deployment fails

**Cause**: Wrong EntryPoint address in `.env`

**Solution**:
1. Verify your EntryPoint deployment address
2. Update `ENTRY_POINT_V07_ADDRESS` in `.env`
3. Run check script again: `./check-radius-setup.sh`

### Issue: Signature Validation Fails

**Symptom**: Transactions revert with signature errors

**Cause**: Mismatch between trusted signer configuration

**Solution**:
1. Verify signer address matches: `cast call $PROXY_ADDRESS "verifyingSigner()(address)" --rpc-url $RADIUS_TESTNET_RPC_URL`
2. Ensure `TRUSTED_SIGNER` and `TRUSTED_SIGNER_PRIVATE_KEY` match in `.env`
3. Check EIP-712 domain has correct chainId (1223953)

### Issue: RPC Connection Errors

**Symptom**: Cannot connect to Radius Testnet RPC

**Solution**:
1. Test RPC directly:
   ```bash
   curl -X POST $RADIUS_TESTNET_RPC_URL \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
   ```
2. Expected response: `{"jsonrpc":"2.0","id":1,"result":"0x12ad11"}`
3. Contact Radius team if RPC is down

---

## Production Deployment Summary

This guide is based on an actual successful deployment to Radius Testnet:

```
Chain: Radius Testnet (1223953)
EntryPoint: 0x9b443e4bd122444852B52331f851a000164Cc83F
SimpleAccountFactory: 0x4DEbDe0Be05E51432D9afAf61D84F7F0fEA63495
Paymaster Implementation: 0xe88c76De10099cCC623EAe15AE7Dd4b6AF9cCcda
Paymaster Proxy: 0xD969454b59F4BC2CF19dC37A37aC10eF6495CD8D
Initial Funding: 0.02 RADIUS
```

**Deployment Transaction**: https://testnet.radiustech.xyz/testnet/tx/0x0fbb5a8b06d146043c9be0b7b653326b0cfced4ffe8f3524e4046210f0d0c59f

---

## Quick Reference

### Essential Commands

```bash
# Check paymaster balance
cast call $ENTRY_POINT_V07_ADDRESS "balanceOf(address)(uint256)" $PROXY_ADDRESS --rpc-url $RADIUS_TESTNET_RPC_URL

# Add more funds
forge script script/DepositFunds.s.sol --rpc-url $RADIUS_TESTNET_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY --legacy

# Check version
cast call $PROXY_ADDRESS "VERSION()(uint256)" --rpc-url $RADIUS_TESTNET_RPC_URL

# Update trusted signer
cast send $PROXY_ADDRESS "setVerifyingSigner(address)" $NEW_SIGNER --rpc-url $RADIUS_TESTNET_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --legacy

# Update max gas cost
cast send $PROXY_ADDRESS "setMaxAllowedGasCost(uint256)" 20000000000000000 --rpc-url $RADIUS_TESTNET_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --legacy

# Withdraw funds
forge script script/WithdrawFunds.s.sol --rpc-url $RADIUS_TESTNET_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY --legacy
```

### Important Addresses

- **Proxy (use this)**: Store in `PROXY_ADDRESS`
- **Implementation**: Reference only, don't use directly
- **EntryPoint**: Your deployed EntryPoint v0.7 address
- **Deployer**: Owner of the paymaster contract
- **Trusted Signer**: Authorizes paymaster approvals

---

## Additional Resources

- **Radius Documentation**: https://docs.radiustech.xyz/
- **ERC-4337 Specification**: https://eips.ethereum.org/EIPS/eip-4337
- **OpenZeppelin Upgrades**: https://docs.openzeppelin.com/contracts/4.x/upgradeable
- **Foundry Book**: https://book.getfoundry.sh/

---

## Support

For issues specific to:
- **Paymaster deployment**: Check the troubleshooting section above
- **Radius Testnet**: Contact the Radius team
- **Account Abstraction**: Refer to ERC-4337 documentation
- **This repository**: See `ADMIN-README.md` and other docs in `docs/` folder
