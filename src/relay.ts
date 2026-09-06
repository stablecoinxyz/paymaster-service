import util from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  type Account,
  BaseError,
  type Chain,
  type GetContractReturnType,
  type Hex,
  type PublicClient,
  type RpcRequestError,
  type Transport,
  type WalletClient,
  hexToBytes,
  toHex,
  keccak256,
} from "viem";
import { fromZodError } from "zod-validation-error";
import { type EstimateUserOperationGasReturnType } from "permissionless";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless/utils";
import type { PimlicoBundlerClient } from "permissionless/clients/pimlico";
import type {
  ENTRYPOINT_ADDRESS_V07_TYPE,
  UserOperation,
} from "permissionless/types";
import {
  InternalBundlerError,
  type JsonRpcSchema,
  RpcError,
  ValidationErrors,
  ethEstimateUserOperationGasParamsSchema,
  jsonRpcSchema,
  pmGetPaymasterData,
  pmGetPaymasterStubDataParamsSchema,
  pmSponsorUserOperationParamsSchema,
} from "./helpers/schema";
import { ENTRYPOINT_ADDRESS_V07_RADIUS_TESTNET, ENTRYPOINT_ADDRESS_V07_RADIUS } from "./helpers/utils";

import {
  abi as PaymasterV07Abi,
} from "../contracts/abi/SignatureVerifyingPaymasterV07.json";

// Constants
const PAYMASTER_VERSION = "5";

/**
 * Generate EIP712 signature for paymaster data
 */
const generatePaymasterSignature = async (
  walletClient: WalletClient<Transport, Chain, Account>,
  paymasterAddress: Hex,
  validUntil: number,
  validAfter: number,
  senderAddress: Hex,
  nonce: bigint,
  calldataHash: Hex
): Promise<Hex> => {
  const chainId = await walletClient.getChainId();
  
  return await walletClient.signTypedData({
    domain: {
      name: "SignatureVerifyingPaymaster",
      version: PAYMASTER_VERSION,
      chainId: chainId,
      verifyingContract: paymasterAddress
    },
    types: {
      PaymasterData: [
        { name: "validUntil", type: "uint48" },
        { name: "validAfter", type: "uint48" },
        { name: "sender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "calldataHash", type: "bytes32" }
      ]
    },
    primaryType: "PaymasterData",
    message: {
      validUntil: validUntil,
      validAfter: validAfter,
      sender: senderAddress,
      nonce: nonce,
      calldataHash: calldataHash
    }
  });
};

/**
 * Create paymaster data by combining timestamps and signature
 * @param validUntil The timestamp until which the signature is valid
 * @param validAfter The timestamp after which the signature is valid
 * @param signature The EIP712 signature
 * @returns The formatted paymaster data
 */
const createPaymasterData = (
  validUntil: number,
  validAfter: number,
  signature: Hex
): Hex => {
  const validUntilHex = validUntil.toString(16).padStart(12, '0');
  const validAfterHex = validAfter.toString(16).padStart(12, '0');
  return `0x${validUntilHex}${validAfterHex}${signature.slice(2)}` as Hex;
};

// SBC methods

/**
 * Handle the SBC method for v0.7 entrypoint
 * @param userOperation The user operation to handle
 * @param altoBundlerV07 The bundler client for v0.7
 * @param paymasterV07 The paymaster contract for v0.7
 * @param walletClient The wallet client of the Trusted Signer
 * @param estimateGas Whether to estimate the gas
 * @returns The result of the method
 */
const handleSbcMethodV07 = async (
  userOperation: UserOperation<"v0.7">,
  altoBundlerV07: PimlicoBundlerClient<any>,
  paymasterV07: GetContractReturnType<
    typeof PaymasterV07Abi,
    PublicClient<Transport, Chain>
  >,
  trustedSignerWalletClient: WalletClient<Transport, Chain, Account>,
  estimateGas: boolean
) => {
  try {
    // Set timestamps for validation window
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const validAfter = currentTimestamp - 10; // 10 seconds before current timestamp
    const validUntil = currentTimestamp + 3600; // 1 hour validity
    
    // Use the sender address from the userOperation
    const senderAddress = userOperation.sender;
    
    // Generate hash of calldata for signature verification
    const calldataHash = keccak256(hexToBytes(userOperation.callData));

    // Generate EIP712 signature
    const signature = await generatePaymasterSignature(
      trustedSignerWalletClient,
      paymasterV07.address,
      validUntil,
      validAfter,
      senderAddress,
      userOperation.nonce,
      calldataHash
    );

    // Construct paymasterData
    const paymasterData = createPaymasterData(validUntil, validAfter, signature);

    if (estimateGas) {
      // For gas estimation
      let op = {
        ...userOperation,
        paymaster: paymasterV07.address,
        paymasterData: paymasterData
      };
      
      let gasEstimates: EstimateUserOperationGasReturnType<any>;
      try {
        gasEstimates = await altoBundlerV07.estimateUserOperationGas({
          userOperation: op,
        });
      } catch (e) {
        console.error("Gas estimation error:", e);
        if (!(e instanceof BaseError)) throw new InternalBundlerError();
        throw e.walk() as RpcRequestError;
      }
      
      return {
        preVerificationGas: toHex(gasEstimates.preVerificationGas),
        callGasLimit: toHex(gasEstimates.callGasLimit),
        paymasterVerificationGasLimit: toHex(gasEstimates.paymasterVerificationGasLimit || 100_000n),
        paymasterPostOpGasLimit: toHex(gasEstimates.paymasterPostOpGasLimit || 50_000n),
        verificationGasLimit: toHex(gasEstimates.verificationGasLimit),
        paymaster: paymasterV07.address,
        paymasterData: paymasterData,
      };
    } else {
      // Return with default gas limits
      const callGasLimit = userOperation.callGasLimit || 500_000n;
      const verificationGasLimit = userOperation.verificationGasLimit || 500_000n;
      const preVerificationGas = userOperation.preVerificationGas || 100_000n;
      const paymasterVerificationGasLimit = userOperation.paymasterVerificationGasLimit || 100_000n;
      const paymasterPostOpGasLimit = userOperation.paymasterPostOpGasLimit || 50_000n;
    
      return {
        preVerificationGas: toHex(preVerificationGas),
        callGasLimit: toHex(callGasLimit),
        paymasterVerificationGasLimit: toHex(paymasterVerificationGasLimit),
        paymasterPostOpGasLimit: toHex(paymasterPostOpGasLimit),
        verificationGasLimit: toHex(verificationGasLimit),
        paymaster: paymasterV07.address,
        paymasterData: paymasterData,
      };
    }
  } catch (error) {
    console.error("Critical error during paymaster signing:", error);
    throw error;
  }
};

/**
 * Handle the SBC method
 * @param altoBundlerV07 The bundler client for v0.7
 * @param paymasterV07 The paymaster contract for v0.7
 * @param walletClient The wallet client of the Trusted Signer
 * @param parsedBody The parsed body of the request
 * @returns The result of the method
 */
const handleSbcMethod = async (
  altoBundlerV07: PimlicoBundlerClient<any>,
  paymasterV07: GetContractReturnType<
    typeof PaymasterV07Abi,
    PublicClient<Transport, Chain>
  >,
  trustedSignerWalletClient: WalletClient<Transport, Chain, Account>,
  parsedBody: JsonRpcSchema
) => {
  if (parsedBody.method === "pm_getPaymasterStubData") {
    const params = pmGetPaymasterStubDataParamsSchema.safeParse(
      parsedBody.params
    );

    if (!params.success) {
      throw new RpcError(
        fromZodError(params.error).message,
        ValidationErrors.InvalidFields
      );
    }

    const [userOperation, entryPoint] = params.data;

    if (entryPoint !== ENTRYPOINT_ADDRESS_V07 && entryPoint !== ENTRYPOINT_ADDRESS_V07_RADIUS_TESTNET && entryPoint !== ENTRYPOINT_ADDRESS_V07_RADIUS) {
      throw new RpcError(
        "EntryPoint not supported",
        ValidationErrors.InvalidFields
      );
    }
  
    try {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const validAfter = currentTimestamp - 10; // 10 seconds before current timestamp
      const validUntil = currentTimestamp + 3600; // 1 hour validity
      
      const senderAddress = userOperation.sender;
      const calldataHash = keccak256(hexToBytes(userOperation.callData));

      const signature = await generatePaymasterSignature(
        trustedSignerWalletClient,
        paymasterV07.address,
        validUntil,
        validAfter,
        senderAddress,
        userOperation.nonce,
        calldataHash
      );
      
      const paymasterData = createPaymasterData(validUntil, validAfter, signature);
      
      return {
        paymasterData: paymasterData,
        paymasterVerificationGasLimit: toHex(100_000n),
        paymasterPostOpGasLimit: toHex(50_000n),
        paymaster: paymasterV07.address
      };
    } catch (error) {
      console.error("Critical error during paymaster stub data generation:", error);
      throw error;
    }
  }
  
  if (parsedBody.method === "pm_getPaymasterData") {
    const params = pmGetPaymasterData.safeParse(parsedBody.params);

    if (!params.success) {
      throw new RpcError(
        fromZodError(params.error).message,
        ValidationErrors.InvalidFields
      );
    }

    const [userOperation, entryPoint] = params.data;

    if (entryPoint === ENTRYPOINT_ADDRESS_V07 || entryPoint === ENTRYPOINT_ADDRESS_V07_RADIUS_TESTNET || entryPoint === ENTRYPOINT_ADDRESS_V07_RADIUS) {
      console.log("Handling pm_getPaymasterData for v0.7 entrypoint");
      return await handleSbcMethodV07(
        userOperation as UserOperation<"v0.7">,
        altoBundlerV07,
        paymasterV07,
        trustedSignerWalletClient,
        false
      );
    }

    throw new RpcError(
      "EntryPoint not supported",
      ValidationErrors.InvalidFields
    );
  }

  if (parsedBody.method === "pm_sponsorUserOperation") {
    const params = pmSponsorUserOperationParamsSchema.safeParse(
      parsedBody.params
    );

    if (!params.success) {
      throw new RpcError(
        fromZodError(params.error).message,
        ValidationErrors.InvalidFields
      );
    }

    const [userOperation, entryPoint] = params.data;

    if (entryPoint === ENTRYPOINT_ADDRESS_V07 || entryPoint === ENTRYPOINT_ADDRESS_V07_RADIUS_TESTNET || entryPoint === ENTRYPOINT_ADDRESS_V07_RADIUS) {
      console.log("Handling pm_sponsorUserOperation for v0.7 entrypoint");
      return await handleSbcMethodV07(
        userOperation as UserOperation<"v0.7">,
        altoBundlerV07,
        paymasterV07,
        trustedSignerWalletClient,
        true
      );
    }

    throw new RpcError(
      "EntryPoint not supported",
      ValidationErrors.InvalidFields
    );
  }

  if (parsedBody.method === "eth_estimateUserOperationGas") {
    const params = ethEstimateUserOperationGasParamsSchema.safeParse(parsedBody.params);

    if (!params.success) {
      throw new RpcError(
        fromZodError(params.error).message,
        ValidationErrors.InvalidFields
      );
    }

    const [userOperation, entryPoint] = params.data;

    if (entryPoint === ENTRYPOINT_ADDRESS_V07 || entryPoint === ENTRYPOINT_ADDRESS_V07_RADIUS_TESTNET || entryPoint === ENTRYPOINT_ADDRESS_V07_RADIUS) {
      console.log("Handling eth_estimateUserOperationGas for v0.7 entrypoint");
      return await handleSbcMethodV07(
        userOperation as UserOperation<"v0.7">, 
        altoBundlerV07, 
        paymasterV07, 
        trustedSignerWalletClient, 
        true
      );
    }

    throw new RpcError(
      "EntryPoint not supported",
      ValidationErrors.InvalidFields
    );
  
  }
  throw new RpcError(
    "Attempted to call an unknown method",
    ValidationErrors.InvalidFields
  );
};

// Strips anything URL-shaped, in case a message embeds an endpoint.
const stripUrls = (text: string) =>
  text.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[redacted]");

/**
 * Builds the JSON-RPC error returned to the caller.
 *
 * Messages we author ourselves (RpcError) are safe and passed through, so clients
 * still see the real reason. Anything else is reduced to its first line, which for
 * a viem error is the short message without the metaMessages block that carries
 * "URL: <endpoint>". Data is forwarded only when it is plain hex revert data.
 */
const toClientError = (err: unknown) => {
  // biome-ignore lint/suspicious/noExplicitAny:
  const anyErr = err as any;
  const code = typeof anyErr?.code === "number" ? anyErr.code : -32603;
  const data = typeof anyErr?.data === "string" && /^0x[0-9a-fA-F]*$/.test(anyErr.data)
    ? anyErr.data
    : undefined;

  if (err instanceof RpcError) {
    return { code, message: stripUrls(err.message), data };
  }

  const raw = typeof anyErr?.message === "string" ? anyErr.message : "";
  const firstLine = raw.split("\n")[0].trim();
  return {
    code,
    message: firstLine ? stripUrls(firstLine) : "Internal error",
    data,
  };
};

export const createSbcRpcHandler = (
  altoBundlerV07: PimlicoBundlerClient<any>,
  paymasterV07: GetContractReturnType<
    typeof PaymasterV07Abi,
    PublicClient<Transport, Chain>
  >,
  trustedSignerWalletClient: WalletClient<Transport, Chain, Account>
) => {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const body = request.body;
    const parsedBody = jsonRpcSchema.safeParse(body);
    if (!parsedBody.success) {
      // Returned rather than thrown. A throw here escapes the try below and
      // reaches Fastify's default handler as a 500, so a caller sending a
      // malformed body was told the server had broken. Every other failure in
      // this handler answers with a JSON-RPC error object; this one now does
      // too. `id` is unknown at this point, so it is null per JSON-RPC 2.0.
      const err = new RpcError(
        fromZodError(parsedBody.error).message,
        ValidationErrors.InvalidFields
      );
      console.error(`RPC handler rejected a malformed request: ${err.message}`);
      return {
        jsonrpc: "2.0",
        id: null,
        error: toClientError(err),
      };
    }

    try {
      const result = await handleSbcMethod(
        altoBundlerV07,
        paymasterV07,
        trustedSignerWalletClient,
        parsedBody.data
      );

      return {
        jsonrpc: "2.0",
        id: parsedBody.data.id,
        result,
      };
    } catch (err: unknown) {
      // Full detail is logged server-side ONLY. Never echo a raw error message to
      // the caller: viem embeds the un-redacted upstream URL in its message text
      // (metaMessages), so forwarding it can leak a bundler or RPC API key.
      console.error(`RPC handler error: ${util.inspect(err)}`);

      return {
        jsonrpc: "2.0",
        id: parsedBody.data.id,
        error: toClientError(err),
      };
    }
  };
};
