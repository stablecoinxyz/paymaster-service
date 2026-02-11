import {
  http,
  createWalletClient,
  Chain,
  Hex,
} from "viem";
import { localhost, base, baseSepolia, hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import "dotenv/config";

// Radius Testnet chain
const radiusTestnet = {
  id: 72344,
  name: "Radius Testnet",
  network: "radiusTestnet",
  nativeCurrency: { name: "Radius", symbol: "USD", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.radiustech.xyz"],
    },
    public: {
      http: ["https://rpc.testnet.radiustech.xyz"],
    },
  },
};

// Radius Mainnet chain
const radius = {
  id: 723,
  name: "Radius",
  network: "radius",
  nativeCurrency: { name: "Radius", symbol: "USD", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.radiustech.xyz"],
    },
    public: {
      http: ["https://rpc.radiustech.xyz"],
    },
  },
};

export const ENTRYPOINT_ADDRESS_V07_RADIUS_TESTNET = "0xfA15FF1e8e3a66737fb161e4f9Fa8935daD7B04F";
export const ENTRYPOINT_ADDRESS_V07_RADIUS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

/**
 * Returns the correct EntryPoint address for the given chain.
 * @param chain The name of the chain.
 * @returns The EntryPoint address for the chain.
 */
export const getEntryPointAddress = (chain: string): `0x${string}` => {
  if (chain === "radiusTestnet") {
    return ENTRYPOINT_ADDRESS_V07_RADIUS_TESTNET;
  }
  if (chain === "radius") {
    return ENTRYPOINT_ADDRESS_V07_RADIUS;
  }
  // For all other chains, use the canonical v0.7 EntryPoint
  // This is imported from permissionless/utils in the calling code
  return "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`;
};

/**
 * Returns the bigger of two BigInts.
 * @param a The first BigInt.
 * @param b The second BigInt.
 * @returns The bigger of the two BigInts.
 */
export const maxBigInt = (a: bigint, b: bigint) => {
  return a > b ? a : b;
};

/**
 * Returns true if the chain is supported.
 * @param chain The name of the chain to check.
 * @returns True if the chain is supported, false otherwise.
 */
export const isChainSupported = (chain: string) => {
  return (
    chain === "baseSepolia" ||
    chain === "base" ||
    chain === "radiusTestnet" ||
    chain === "radius" ||
    chain === "localhost" ||
    chain === "hardhat"
  );
};

/**
 * Returns the chain to use based on the chain name.
 * @param chain The name of the chain to use.
 * @returns The chain to use.
 */
export const getChain = (chain: string): Chain => {
  if (chain === "baseSepolia") {
    return baseSepolia;
  } else if (chain === "base") {
    return base;
  } else if (chain === "radiusTestnet") {
    return radiusTestnet;
  } else if (chain === "radius") {
    return radius;
  } else if (chain === "localhost") {
    return localhost;
  } else if (chain === "hardhat") {
    return hardhat;
  }
  throw new Error(`Unsupported chain: ${chain}`);
};

/**
 * Returns a wallet client for the given chain.
 * @param chain The name of the chain to use.
 * @returns The wallet client.
 */
export const getDeployerWalletClient = (chain: string) => {
  let privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not set");
  }
  if (!privateKey.startsWith("0x")) {
    privateKey = "0x" + privateKey;
  }
  const account = privateKeyToAccount(privateKey as Hex);

  return createWalletClient({
    account,
    chain: getChain(chain),
    transport: http(getRPCUrl(chain)),
  });
};

/**
 * Returns a wallet client for the trusted signer.
 * @param chain The name of the chain to use.
 * @returns The wallet client for the trusted signer.
 */
export const getTrustedSignerWalletClient = (chain: string) => {
  let privateKey = process.env.TRUSTED_SIGNER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("TRUSTED_SIGNER_PRIVATE_KEY is not set");
  }
  if (!privateKey.startsWith("0x")) {
    privateKey = "0x" + privateKey;
  }
  const account = privateKeyToAccount(privateKey as Hex);

  return createWalletClient({
    account,
    chain: getChain(chain),
    transport: http(getRPCUrl(chain)),
  });
};

/**
 * Returns the RPC URL for the given chain.
 * @param chain The name of the chain to use.
 * @returns The RPC URL.
 */
export const getRPCUrl = (chain: string) => {
  if (chain === "baseSepolia") {
    return process.env.BASE_SEPOLIA_RPC_URL;
  } else if (chain === "base") {
    return process.env.BASE_RPC_URL;
  } else if (chain === "radiusTestnet") {
    return process.env.RADIUS_TESTNET_RPC_URL;
  } else if (chain === "radius") {
    return process.env.RADIUS_RPC_URL;
  } else if (chain === "localhost" || chain === "hardhat") {
    return process.env.LOCALHOST_RPC_URL;
  }
  throw new Error(`Unsupported chain: ${chain}`);
};

/**
 * Returns the bundler URL for the given chain.
 * @param chain The name of the chain to use.
 * @returns The bundler URL.
 */
export const getBundlerUrl = (chain: string) => {
  if (chain === "baseSepolia") {
    return process.env.BASE_SEPOLIA_BUNDLER_URL;
  } else if (chain === "base") {
    return process.env.BASE_BUNDLER_URL;
  } else if (chain === "radiusTestnet") {
    return process.env.RADIUS_TESTNET_BUNDLER_URL;
  } else if (chain === "radius") {
    return process.env.RADIUS_BUNDLER_URL;
  } else if (chain === "localhost" || chain === "hardhat") {
    return process.env.LOCALHOST_BUNDLER_URL;
  }
  throw new Error(`Unsupported chain: ${chain}`);
};

/**
 * Returns the scanner URL for the given chain.
 * @param chain The name of the chain to use.
 * @returns The scanner URL.
 */
export const getScannerUrl = (chain: string) => {
  if (chain === "baseSepolia") {
    return "https://sepolia.basescan.org";
  } else if (chain === "base") {
    return "https://basescan.org";
  } else if (chain === "radiusTestnet") {
    return "https://explorer.testnet.radiustech.xyz";
  } else if (chain === "radius") {
    return "https://explorer.radiustech.xyz";
  } else if (chain === "localhost" || chain === "hardhat") {
    return "http://localhost:8545";
  }
  throw new Error(`Unsupported chain: ${chain}`);
};
