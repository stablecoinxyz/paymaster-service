# Foundry Setup

This document provides instructions for setting up and using Foundry with this project.

## Installing Foundry

To install Foundry, run the following command:

```bash
curl -L https://foundry.paradigm.xyz | bash
```

Then run:

```bash
foundryup
```

This will install the latest version of Foundry, including:
- `forge`: The Foundry build system and test runner
- `cast`: A command-line tool for interacting with EVM smart contracts
- `anvil`: A local Ethereum node for development and testing

## Project Setup

1. Initialize Foundry in the project (if not already done):

```bash
forge init --no-commit
```

2. Configure Foundry to work with the existing project structure by creating or updating `foundry.toml`:

```toml
[profile.default]
src = "contracts"
out = "artifacts"
libs = ["node_modules", "lib"]
ignored_warnings_from = ["debug"]
solc = "0.8.23"
via_ir = true

# See more config options https://github.com/foundry-rs/foundry/blob/master/crates/config/README.md#all-options
```

3. Install dependencies:

```bash
forge install foundry-rs/forge-std
```

## Using Foundry with Environment Variables

Foundry scripts can access environment variables from your `.env` file. Make sure your `.env` file is properly configured with all required variables.

To load environment variables in Foundry scripts, use the `vm.envAddress()`, `vm.envUint()`, and other similar functions.

## Running Foundry Scripts

To run a Foundry script, use the `forge script` command. Below are examples for each script in this project:

### DeployPaymaster.s.sol
Deploys a new paymaster implementation and proxy contract.

```bash
forge script script/DeployPaymaster.s.sol --rpc-url $RPC_URL --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
```

### UpgradePaymaster.s.sol
Upgrades an existing paymaster proxy to a new implementation.

```bash
forge script script/UpgradePaymaster.s.sol --rpc-url $RPC_URL --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
```

### DepositFunds.s.sol
Deposits ETH into the paymaster contract for gas sponsorship.

```bash
forge script script/DepositFunds.s.sol --rpc-url $RPC_URL --broadcast
```

### WithdrawFunds.s.sol
Withdraws ETH from the paymaster contract (owner only).

```bash
forge script script/WithdrawFunds.s.sol --rpc-url $RPC_URL --broadcast
```

### UpdateSigner.s.sol
Updates the trusted signer address for the paymaster.

```bash
forge script script/UpdateSigner.s.sol --rpc-url $RPC_URL --broadcast
```

### UpdateGasLimit.s.sol
Updates the maximum allowed gas cost for the paymaster.

```bash
forge script script/UpdateGasLimit.s.sol --rpc-url $RPC_URL --broadcast
```

### CheckStatus.s.sol
Checks the current status and configuration of the paymaster contract.

```bash
forge script script/CheckStatus.s.sol --rpc-url $RPC_URL
```

## Environment Variables

Make sure your `.env` file contains the required environment variables:

```env
DEPLOYER_PRIVATE_KEY=0x...
ENTRY_POINT_V07_ADDRESS=0x...
TRUSTED_SIGNER=0x...
PROXY_ADDRESS=0x...
RPC_URL=https://...
ETHERSCAN_API_KEY=...
```

## Script Options

- `--rpc-url`: The RPC endpoint to connect to
- `--broadcast`: Actually send the transactions (without this, it's a simulation)
- `--verify`: Verify the contract source code on Etherscan
- `--etherscan-api-key`: API key for Etherscan verification
- `--gas-estimate-multiplier`: Multiply gas estimates by this factor (useful for congested networks)
- `--legacy`: Use legacy transaction format instead of EIP-1559