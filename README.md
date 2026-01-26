# paymaster-service

A paymaster service that lets you use a custom paymaster contract. The service is built using Fastify, deployed to Railway.

Currently, the service supports v0.7 of the Account Abstraction standard. The paymaster smart contract is deployed on:

- Base Sepolia (EntryPoint: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`)
- Base Mainnet (EntryPoint: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`)
- Radius Testnet (EntryPoint: `0xfA15FF1e8e3a66737fb161e4f9Fa8935daD7B04F`)

**Note:** Radius Testnet uses a custom EntryPoint deployment, not the canonical v0.7 address.

The [admin scripts](./docs/ADMIN-README.md) are capable of deploying the paymaster contract to other EVM-compatible chains.

For more details on individual releases, see the [CHANGELOG.md](CHANGELOG.md) file.

## Environment Variables

To run this project, you will need to add the following environment variables to your .env file. Run `cp .env.example .env` to create it.

```bash
# EntryPoint v0.7 address (canonical)
ENTRY_POINT_V07_ADDRESS="0x0000000071727De22E5E9d8BAf0edAc6f37da032"

# Base Sepolia
BASE_SEPOLIA_RPC_URL=""
BASE_SEPOLIA_BUNDLER_URL=""

# Base Mainnet
BASE_RPC_URL=""
BASE_BUNDLER_URL=""

# Radius Testnet
RADIUS_TESTNET_RPC_URL=""
RADIUS_TESTNET_BUNDLER_URL=""

# Block explorer API keys
BASESCAN_API_KEY=""
RADIUS_TESTNET_API_KEY=""

# Proxy addresses (different for each network)
PROXY_ADDRESS=""  # Base Sepolia/Mainnet
PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET=""  # Radius Testnet

# Deployer wallet private key
DEPLOYER_PRIVATE_KEY="0x..."

# Trusted signer wallet address
TRUSTED_SIGNER="0x..."
# Trusted signer wallet private key
TRUSTED_SIGNER_PRIVATE_KEY="0x..."
```

## Compile the paymaster contract

When you first clone the repository (or change the paymaster contract), you will need to (re)compile the paymaster contract and copy the ABI and bytecode to the `src/contracts/abi` subdirectory (using the `npm run copy` command).

```bash
npm run copy
```

## Admin Tasks

For details on the admin tasks, such as deploying, upgrading, funding the paymaster, etc., see the [ADMIN-README.md](docs/ADMIN-README.md) file.

### Radius Testnet Quick Commands

For Radius Testnet, use these convenience scripts:

```bash
# Check paymaster deposit balance
npm run check-radius

# Fund the paymaster (default: 0.5 USD)
npm run fund-radius

# Fund with custom amount
DEPOSIT_AMOUNT=1 npm run fund-radius
```

These scripts use the `PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET` environment variable and the custom Radius EntryPoint (`0xfA15FF1e8e3a66737fb161e4f9Fa8935daD7B04F`).

## Development Frameworks

This project supports both Hardhat and Foundry for development and deployment. See the [ADMIN-README.md](ADMIN-README.md) for details on using each framework.

## Run locally for development

Running the project locally is done by running the following command. The paymaster service will be available at `https://localhost:3000`.

```bash
npm run start
```

## Author

- Eric Tsang [@Ectsang](https://www.github.com/Ectsang)

## Other Documentation

- [Admin Guide](docs/ADMIN-README.md)
- [Auditor Guide](docs/AUDITOR-README.md)
- [Changelog](docs/CHANGELOG.md)
- [Foundry Setup](docs/FOUNDRY-SETUP.md)
- [0xMacro Audit](docs/MACRO-README.md)
- [Audit Fixes](docs/AUDIT-FIXES.md)
