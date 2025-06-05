import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-viem";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Task to deploy the paymaster
task("deploy-paymaster", "Deploy the UUPS paymaster and proxy")
  .setAction(async (taskArgs, hre) => {
    const deployPaymaster = require("./scripts/tasks/deploy-paymaster");
    await deployPaymaster.main(hre);
  });

// Task to upgrade the paymaster implementation
task("upgrade-paymaster", "Upgrade the UUPS paymaster implementation")
  .setAction(async (taskArgs, hre) => {
    const deployPaymaster = require("./scripts/tasks/deploy-paymaster");
    await deployPaymaster.upgrade(hre);
  });

// Task to deposit funds into the paymaster
task("deposit-funds", "Fund the paymaster by sending ETH to the EntryPoint")
  .setAction(async (taskArgs, hre) => {
    const depositFunds = require("./scripts/tasks/deposit-funds");
    await depositFunds.main(hre);
  });

// Task to withdraw funds from the paymaster
task("withdraw-funds", "Withdraw funds from the paymaster")
  .addParam("amount", "Amount of ETH to withdraw", "0.05")
  .setAction(async (taskArgs, hre) => {
    const withdrawFunds = require("./scripts/tasks/withdraw-funds");
    await withdrawFunds.main(hre, taskArgs.amount);
  });

// Task to check the status of the paymaster
task("paymaster-status", "Check the status of the paymaster contract")
  .setAction(async (taskArgs, hre) => {
    const checkStatus = require("./scripts/tasks/check-paymaster-status");
    await checkStatus.main(hre);
  });

// Task to update the trusted signer
task("update-signer", "Update the trusted signer address for the paymaster")
  .addParam("address", "The new signer address")
  .setAction(async (taskArgs, hre) => {
    const updateSigner = require("./scripts/tasks/update-signer");
    await updateSigner.main(hre, taskArgs.address);
  });

// Task to update the gas limit
task("update-gas-limit", "Update the maximum allowed gas cost for the paymaster")
  .addParam("limit", "The new gas limit in ETH (e.g., '0.02')")
  .setAction(async (taskArgs, hre) => {
    const updateGasLimit = require("./scripts/tasks/update-gas-limit");
    await updateGasLimit.main(hre, taskArgs.limit);
  });

// Task to reinitialize gas cost after upgrade
task("reinitialize-gas-cost", "Reinitialize gas cost after upgrade if it was reset to zero")
  .addOptionalParam("limit", "The gas limit in ETH", "0.01")
  .setAction(async (taskArgs, hre) => {
    const reinitializeGasCost = require("./scripts/tasks/reinitialize-gas-cost");
    await reinitializeGasCost.main(hre, taskArgs.limit);
  });

task("verify-source", "Verify the paymaster implementation and proxy contracts on Etherscan")
  .setAction(async (taskArgs, hre) => {
    const verifySource = require("./scripts/tasks/verify-source");
    await verifySource.main(hre);
  });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.23",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    optimism: {
      url: process.env.OPTIMISM_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    base: {
      url: process.env.BASE_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 84532
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      arbitrum: process.env.ARBISCAN_API_KEY || "",
      optimism: process.env.OPTIMISM_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  },
};

export default config; 