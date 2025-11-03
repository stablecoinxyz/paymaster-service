import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from "fastify";
import cors from "@fastify/cors";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless/utils";
import { createPimlicoBundlerClient } from "permissionless/clients/pimlico";
import { Address, getContract, http, isAddress } from "viem";
import { getDeployerWalletClient, getChain, getTrustedSignerWalletClient, getRPCUrl, getBundlerUrl, isChainSupported } from "../helpers/utils";
import { abi as SBC_PAYMASTER_V07_ABI } from "../../contracts/abi/SignatureVerifyingPaymasterV07.json";
import { createSbcRpcHandler } from "../relay";
import * as Sentry from "@sentry/node";

interface IQueryString {
  name: string;
}

interface CustomRouteGenericQuery {
  Querystring: IQueryString;
}

interface IParams {
  chain: string;
}

interface CustomRouteGenericParam {
  Params: IParams;
}

type SupportedChain = "base" | "baseSepolia" | "radiusTestnet";

// Centralized per-chain paymaster address configuration, validated at startup
const PAYMASTER_ADDRESSES: Record<SupportedChain, Address> = {
  base: process.env.PAYMASTER_PROXY_ADDRESS as Address,
  baseSepolia: process.env.PAYMASTER_PROXY_ADDRESS as Address,
  radiusTestnet: process.env.PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET as Address,
};

// Validate env configuration (fail fast with precise messages)
(() => {
  const missing: string[] = [];
  if (!process.env.PAYMASTER_PROXY_ADDRESS) missing.push("PAYMASTER_PROXY_ADDRESS");
  if (!process.env.PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET) missing.push("PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET");
  if (missing.length) {
    const error = new Error(`Missing environment variables: ${missing.join(", ")}`);
    Sentry.captureException(error);
    throw error;
  }

  // Address format validation
  const candidates: Array<{ key: string; value: string | undefined }> = [
    { key: "PAYMASTER_PROXY_ADDRESS", value: process.env.PAYMASTER_PROXY_ADDRESS },
    { key: "PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET", value: process.env.PAYMASTER_PROXY_ADDRESS_RADIUS_TESTNET },
  ];
  const invalid = candidates.filter(({ value }) => !value || !isAddress(value as Address));
  if (invalid.length) {
    const detail = invalid.map(({ key, value }) => `${key}=${value ?? "<undefined>"}`).join(", ");
    const error = new Error(`Invalid address in environment: ${detail}`);
    Sentry.captureException(error);
    throw error;
  }
})();

// Cache of per-chain RPC handlers to avoid re-initialization per request
const handlerCache: Record<string, Promise<ReturnType<typeof createSbcRpcHandler>>> = {};

const setupHandler = async (chain: string) => {  
  const rpcUrl = getRPCUrl(chain);
  if (!rpcUrl) {
    const error = new Error(`RPC_URL for chain (${chain}) is not set`);
    Sentry.captureException(error);
    throw error;
  }
  
  const bundlerUrl = getBundlerUrl(chain);
  if (!bundlerUrl) {
    const error = new Error(`BUNDLER_URL for chain (${chain}) is not set`);
    Sentry.captureException(error);
    throw error;
  }
  
  try {
    const walletClient = getDeployerWalletClient(chain);
    
    if (!walletClient) {
      const error = new Error("Failed to initialize deployer wallet client");
      Sentry.captureException(error);
      throw error;
    }
    
    const owner = walletClient.account.address;
    console.log(`Deployer/Owner address: ${owner}`);

    const trustedSignerWalletClient = getTrustedSignerWalletClient(chain);
    
    if (!trustedSignerWalletClient) {
      const error = new Error("Failed to initialize trusted signer wallet client");
      Sentry.captureException(error);
      throw error;
    }
    
    const trustedSigner = trustedSignerWalletClient.account.address;
    console.log(`Trusted signer address: ${trustedSigner}`);

    // Centralized lookup for paymaster address
    const supportedChain = chain as SupportedChain;
    const paymasterAddress = PAYMASTER_ADDRESSES[supportedChain];
    if (!paymasterAddress) {
      const error = new Error(`Chain (${chain}) is not supported`);
      Sentry.captureException(error);
      throw error;
    }

    const paymasterContract = getContract({
      address: paymasterAddress,
      abi: SBC_PAYMASTER_V07_ABI,
      client: walletClient,
    });

    let version;
    try {
      version = await paymasterContract.read.VERSION();
    } catch (error) {
      const errorMessage = `Paymaster is not deployed for chain (${chain})`;
      Sentry.captureMessage(errorMessage, "error");
      throw new Error(errorMessage);
    }

    const altoBundlerV07 = createPimlicoBundlerClient({
      chain: getChain(chain),
      transport: http(bundlerUrl),
      entryPoint: ENTRYPOINT_ADDRESS_V07,
    });

    const rpcHandler = createSbcRpcHandler(
      altoBundlerV07,
      paymasterContract,
      trustedSignerWalletClient
    );
    
    console.log(`Paymaster v${version} ready for chain (${chain})`);
    return rpcHandler;
  } catch (error) {
    console.error(`Error setting up paymaster system for chain (${chain}):`, error);
    Sentry.captureException(error);
    throw error;
  }
};

// Public accessor with memoization (cached handlers)
const getRpcHandler = (chain: string) => {
  if (!handlerCache[chain]) {
    handlerCache[chain] = setupHandler(chain);
  }
  return handlerCache[chain];
};

const routes: FastifyPluginAsync = async (server) => {
  server.register(cors, {
    origin: "*",
    methods: ["POST", "GET", "OPTIONS"],
  });

  server.get("/", async (req: FastifyRequest, res: FastifyReply) => {
    res.status(200).send("Custom paymaster from SBC");
  });

  server.get("/debug-sentry", async (req: FastifyRequest, res: FastifyReply) => {
    throw new Error("This is a test error for Sentry");
  });

  server.register(
    async (instance: FastifyInstance, opts: FastifyServerOptions) => {
      instance.get(
        "/ping",
        async (
          req: FastifyRequest<CustomRouteGenericQuery>,
          res: FastifyReply
        ) => {
          res.status(200).send({ message: "pong" });
        }
      );

      instance.register(
        async (chainInstance: FastifyInstance) => {
          chainInstance.post(
            "/v1/:chain",
            async (
              req: FastifyRequest<CustomRouteGenericParam>,
              res: FastifyReply
            ) => {
              const { chain } = req.params;
              if (!isChainSupported(chain)) {
                const errorMessage = `Chain (${chain}) is not supported`;
                Sentry.captureMessage(errorMessage, "error");
                res.status(400).send({
                  error: errorMessage
                });
              }

              try {
                const rpcHandler = await getRpcHandler(chain);
                return rpcHandler(req, res);
              } catch (error) {
                const errorMessage = `Error handling RPC request for chain (${chain}): ${error}`;
                Sentry.captureMessage(errorMessage, "error");
                res.status(500).send({
                  error: `Failed to process request for chain (${chain})`,
                  details: error instanceof Error ? error.message : 'Unknown error'
                });
              }
            }
          );
        },
        {
          prefix: "/rpc",
        }
      );
    }
  );
};

export default routes;
