import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from "fastify";
import cors from "@fastify/cors";
import { createPimlicoBundlerClient } from "permissionless/clients/pimlico";
import { Address, getContract, http } from "viem";
import { getDeployerWalletClient, getChain, getTrustedSignerWalletClient, getRPCUrl, getBundlerUrl, getRPCUrlEnvVar, getBundlerUrlEnvVar, getPaymasterProxyAddress, isChainSupported, getEntryPointAddress } from "../helpers/utils";
import { abi as SBC_PAYMASTER_V07_ABI } from "../../contracts/abi/SignatureVerifyingPaymasterV07.json";
import { createSbcRpcHandler } from "../relay";
import * as Sentry from "@sentry/node";
import { createHash, timingSafeEqual } from "node:crypto";
import { EntryPoint } from "permissionless/types/entrypoint";

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

type SupportedChain = "base" | "baseSepolia" | "radiusTestnet" | "radius";

const SUPPORTED_CHAINS: SupportedChain[] = ["base", "baseSepolia", "radiusTestnet", "radius"];

// Centralized per-chain paymaster address configuration, validated at startup.
// getPaymasterProxyAddress is the single source of truth shared with the admin
// tasks, and throws a precise error for a missing or malformed address.
const PAYMASTER_ADDRESSES: Record<SupportedChain, Address> = (() => {
  try {
    return Object.fromEntries(
      SUPPORTED_CHAINS.map((chain) => [chain, getPaymasterProxyAddress(chain)])
    ) as Record<SupportedChain, Address>;
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
})();

// Validate env configuration (fail fast with precise messages)
(() => {
  if (!process.env.PAYMASTER_SHARED_SECRET) {
    const error = new Error("Missing environment variables: PAYMASTER_SHARED_SECRET");
    Sentry.captureException(error);
    throw error;
  }

  // Validate every chain's RPC and bundler URL here rather than on first request,
  // so a misconfigured deployment fails to start instead of serving 500s to users.
  const missingUrls = SUPPORTED_CHAINS.flatMap((chain) => [
    ...(getRPCUrl(chain) ? [] : [getRPCUrlEnvVar(chain)]),
    ...(getBundlerUrl(chain) ? [] : [getBundlerUrlEnvVar(chain)]),
  ]);
  if (missingUrls.length) {
    const error = new Error(`Missing environment variables: ${missingUrls.join(", ")}`);
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

    const entryPointAddress = getEntryPointAddress(chain);
    const altoBundlerV07 = createPimlicoBundlerClient({
      chain: getChain(chain),
      transport: http(bundlerUrl),
      entryPoint: entryPointAddress as EntryPoint,
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

// Public accessor with memoization (cached handlers).
// Only successful setups are cached: a failed one evicts itself so a transient
// RPC or network problem doesn't brick the chain until the service is redeployed.
const getRpcHandler = (chain: string) => {
  if (!handlerCache[chain]) {
    handlerCache[chain] = setupHandler(chain).catch((error) => {
      delete handlerCache[chain];
      throw error;
    });
  }
  return handlerCache[chain];
};

const SHARED_SECRET_HEADER = "x-paymaster-secret";

/**
 * Constant-time comparison of the caller's shared secret against ours.
 * Both sides are hashed first so the comparison is over equal-length buffers and
 * does not reveal the secret's length.
 */
const isAuthorized = (presented: string | undefined): boolean => {
  if (!presented) return false;
  const expected = process.env.PAYMASTER_SHARED_SECRET as string;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
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
          // Only the proxy may reach the sponsorship endpoints. Health routes
          // above stay open so platform health checks keep working.
          chainInstance.addHook("preHandler", async (req: FastifyRequest, res: FastifyReply) => {
            const presented = req.headers[SHARED_SECRET_HEADER];
            if (!isAuthorized(typeof presented === "string" ? presented : undefined)) {
              return res.status(401).send({ error: "Unauthorized" });
            }
          });

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
                return res.status(400).send({
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
