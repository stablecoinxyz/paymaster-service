# Auditor README

Below are the set up instructions for the auditor.

## 1. Run a Bundler locally

### Clone the [Alto](https://github.com/stablecoinxyz/alto) repository and install dependencies

```bash
git clone git@github.com:stablecoinxyz/alto.git
cd alto
pnpm install
```

### Set up the Bundler for Base Sepolia

```bash
cp config.baseSepolia.json.template config.baseSepolia.json
```

Edit the `config.baseSepolia.json` file with the values for the environment variables:

```text
ALTO_RPC_URL="your base sepolia rpc url"
ALTO_EXECUTOR_PRIVATE_KEYS="0x..."
ALTO_UTILITY_PRIVATE_KEY="0x..."
```

For testing purposes, you can use the same private key for both the executor and the utility wallet. You will need to fund the utility wallet with minimal (e.g. 0.01 ETH) ETH on Base Sepolia.

### Run the bundler with Base Sepolia config

```bash
./alto --config config.baseSepolia.json
```

## 2. Clone and run this Paymaster locally

In another terminal, clone the repository and install dependencies:

```bash
git clone git@github.com:stablecoinxyz/paymaster-service.git
cd paymaster-service
npm install
```

### Set up environment variables

```bash
cp .env.example .env
```

Edit the `.env` file with the correct values.

```text
ENTRY_POINT_V07_ADDRESS=0x0000000071727de22e5e9d8baf0edac6f37da032

# RPC URLs
BASE_SEPOLIA_RPC_URL="your base sepolia rpc url"

# Bundler URL (the Alto bundler URL)
BASE_SEPOLIA_BUNDLER_URL="http://0.0.0.0:4337"

# API Keys for verification (e.g. if you are testing the verification onBaseScan)
BASESCAN_API_KEY=

# Proxy address (get this from the first deployment)
PROXY_ADDRESS=

# Deployer private key (this is the deployer and owner of the paymaster)
DEPLOYER_PRIVATE_KEY=

# Trusted signer (our contract will only approve signatures from this signer)
TRUSTED_SIGNER=
TRUSTED_SIGNER_PRIVATE_KEY=
```

### Compile the contract and copy the artifacts

```bash
npm run copy
```

### Deploy the contract

We are using the UUPS proxy pattern via the CREATE2 opcode. To deploy the initial implementation and proxy:

```bash
npx hardhat deploy-paymaster --network <your-network>
```

**NOTE:** You will need to save the proxy address (`PROXY_ADDRESS`) that is output by the script in your `.env` file.

### Fund the paymaster

You will need minimum 0.02 ETH (Base Sepolia) to fund the paymaster on the EntryPoint contract. You can use the `withdraw-funds` script to withdraw funds from the EntryPoint contract back to your wallet after testing.

```bash
npx hardhat deposit-funds --network <your-network>
```

You now have a deployed implementation and proxy contract on Base Sepolia, funded and ready to use.

### Run the paymaster service

```bash
npm run start
```

You should now have a running paymaster service. The paymaster service will be listening for requests from the EntryPoint contract on Base Sepolia, to provide the necessary data (e.g. paymasterData) to the EntryPoint contract to process userops that request gas sponsorship.

### Testing the paymaster functionality

You can test the paymaster functionality by sending a userop on Base Sepolia.

#### Use the starter script with tools provided by viem and permissionless [example](https://docs.stablecoin.xyz/erc4337/overview)

```typescript
import { Address, createWalletClient, custom, http, PublicClient } from 'viem';
import { base, baseSepolia } from "viem/chains";
import { entryPoint07Address, UserOperation, createPaymasterClient } from "viem/account-abstraction";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createSmartAccountClient } from "permissionless";
 
// create a client for your connected wallet
const owner = createWalletClient({
  account: "0x..." as Address, // your wallet address
  chain: base, 
  transport: custom((window as any).ethereum),
});
 
// create a public client for reading onchain
const publicClient = createPublicClient({
  chain: base,
  transport: http("https://base-rpc.publicnode.com"), // or your custom rpc
}) as PublicClient;
 
// Create a SimpleAccount with your wallet as owner
const simpleAccount = await toSimpleSmartAccount({
  client: publicClient,
  owner: owner,
  entryPoint: {
    address: entryPoint07Address,
    version: "0.7",
  },
});
 
// Create a Paymaster client from the SBC Paymaster
const paymaster = createPaymasterClient({
  transport: http("http://localhost:3000"), // The paymaster service URL
});
 
// Package it into one Smart Account Client
const smartAccountClient = createSmartAccountClient({
  account: simpleAccount,
  chain: base,
  bundlerTransport: http("http://0.0.0.0:4337"), // The Alto bundler URL
  paymaster,
  userOperation: {
    estimateFeesPerGas: async () => {
      return {
        maxFeePerGas: 10n,
        maxPriorityFeePerGas: 10n,
      };
    },
  },
});
 
// Encode your User operation (covered in the next section)
// ...
// const calls = [
//   {
//     to: "0x..." as Address,     // your target contract or EOA address
//     data: <yourEncodedCallData> as Hex // encoded data of your user op
//   },
//   {
//     to: "0x..." as Address,
//     data: <yourEncodedCallData> as Hex
//   }
// ];
 
// Send the user operation with your Smart Account Client
const userOpHash = await smartAccountClient.sendUserOperation({ calls });
const receipt = await smartAccountClient.waitForUserOperationReceipt({
  hash: userOpHash,
});
 
console.log(`Your user op hash: ${receipt.userOpHash}`);
```

#### Encode the User operation

Follow the [example](https://docs.stablecoin.xyz/use-cases/nft-minting) to encode the User operation, minting an ERC721 NFT.

#### Send the User operation

Send the User operation with your Smart Account Client. You should see the paymasterData in the logs of the paymaster service.

#### Check the paymaster status

Check the paymaster status with the `check-paymaster-status` script.

```bash
npx hardhat check-paymaster-status --network <your-network>
```

You should see the paymaster status with a deducted balance (v.s. what you put in initially via the `deposit-funds` script) in the output.

#### Withdraw funds

Withdraw funds from the paymaster with the `withdraw-funds` script.

```bash
npx hardhat withdraw-funds --network <your-network>
```
