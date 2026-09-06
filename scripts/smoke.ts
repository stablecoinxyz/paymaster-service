/**
 * End-to-end smoke test: can this service still facilitate?
 *
 * Boots `src/index.ts` — the real production entry point, not a
 * reimplementation — as a child process on a real socket, then drives it over
 * HTTP the way the proxy does.
 *
 * The point is the last check. It asks the running service for paymaster stub
 * data on Base Sepolia, decodes the `paymasterData` it returns, and recovers the
 * EIP-712 signer from the signature inside it. If that address is the trusted
 * signer, the service produced a sponsorship the on-chain paymaster would
 * accept: the request was parsed, schema-validated, routed, the chain was read,
 * and the signing key worked. A green run means facilitation still works
 * end to end.
 *
 * Nothing is broadcast and no funds move. Every call is read-only or a local
 * signature over an operation that is never submitted.
 *
 * Two modes:
 *
 *   npm run smoke
 *       Boots the service locally. The shared secret is generated per run and
 *       handed to the child, so this never needs the production one.
 *
 *   SMOKE_TARGET=https://<host> PAYMASTER_SHARED_SECRET=<secret> npm run smoke
 *       Drives an already-deployed instance instead of spawning one. Run it
 *       after a release and you know whether the thing actually serving traffic
 *       can still facilitate.
 *
 * Without the shared secret the sponsorship endpoints answer 401, and nothing
 * about facilitation can be read through that. The run then reports those
 * checks as NOT ASSESSED and exits 2, rather than passing on the strength of
 * the health routes alone.
 *
 * Exit codes: 0 every check passed, 1 a check failed, 2 nothing was assessed.
 */

import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { createPublicClient, http, keccak256, hexToBytes, recoverTypedDataAddress, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import { abi as PaymasterAbi } from "../contracts/abi/SignatureVerifyingPaymasterV07.json";

// `npm run smoke` runs from the package root; the child is spawned there too.
const REPO_ROOT = process.cwd();

/**
 * The chain to drive. Defaults to the testnet; set SMOKE_CHAIN=base to prove
 * facilitation on the chain production actually sponsors. Both are safe: every
 * call is a read or a local signature over a UserOperation never submitted.
 */
const CHAIN = process.env.SMOKE_CHAIN === "base" ? "base" : "baseSepolia";
const CHAIN_ID = CHAIN === "base" ? 8453 : 84532;
const VIEM_CHAIN = CHAIN === "base" ? base : baseSepolia;
const RPC_URL = CHAIN === "base" ? process.env.BASE_RPC_URL : process.env.BASE_SEPOLIA_RPC_URL;

/** Standard ERC-4337 v0.7 EntryPoint. The service rejects anything else. */
const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

/**
 * The EIP-712 domain version is read from the deployed paymaster's own VERSION()
 * rather than hardcoded, so this asserts the service signs with the domain the
 * contract on chain will actually verify against. If someone upgrades the
 * paymaster and forgets PAYMASTER_VERSION in src/relay.ts, the recovery below
 * stops matching and this test goes red — which is the point.
 */
async function paymasterDomainVersion(address: Hex): Promise<string> {
  const client = createPublicClient({ chain: VIEM_CHAIN, transport: http(RPC_URL) });
  const version = await client.readContract({ address, abi: PaymasterAbi, functionName: "VERSION" });
  return String(version);
}

const BOOT_TIMEOUT_MS = 90_000;

/** Where the locally spawned service listens. Never used in SMOKE_TARGET mode. */
const LOOPBACK = "127.0.0.1";

let failures = 0;
let notAssessed = 0;
const childLog: string[] = [];

function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}

/**
 * Something this run could not read, as opposed to something that failed.
 * Collapsing the two would let a run with no credentials report a clean bill of
 * health on the strength of the routes it could reach.
 */
function skipped(label: string, why: string): void {
  console.log(`  ----  ${label}  — NOT ASSESSED: ${why}`);
  notAssessed++;
}

/** Prints the verdict and exits. Never returns. */
function summarize(): never {
  console.log();
  if (failures > 0) {
    // Only a locally spawned service has output to show. Against a deployment
    // the logs live wherever it runs, and printing an empty "child output"
    // heading sends whoever is debugging to the wrong place.
    const where = childLog.length
      ? `--- service output ---\n${childLog.join("")}`
      : `The service was not started by this run, so its logs are wherever it is deployed.`;
    console.log(`smoke FAILED (${failures})\n${where}`);
    process.exit(1);
  }
  if (notAssessed > 0) {
    console.log("smoke INCONCLUSIVE — nothing was proved about facilitation, see NOT ASSESSED above");
    process.exit(2);
  }
  console.log("smoke passed — the service still facilitates");
  process.exit(0);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForReady(base: string, deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/ping`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(
    `service did not answer /ping within ${BOOT_TIMEOUT_MS}ms\n--- child output ---\n${childLog.join("")}`,
  );
}

/** A well-formed v0.7 UserOperation. Never submitted anywhere. */
function userOperation() {
  return {
    sender: "0x1234567890123456789012345678901234567890",
    nonce: "0x1",
    callData: "0xdeadbeef",
    callGasLimit: "0x186a0",
    verificationGasLimit: "0x186a0",
    preVerificationGas: "0x5208",
    maxFeePerGas: "0x59682f00",
    maxPriorityFeePerGas: "0x59682f00",
  };
}

function rpc(method: string, params: unknown[]) {
  return { jsonrpc: "2.0", id: 1, method, params };
}

async function main(): Promise<void> {
  const target = process.env.SMOKE_TARGET?.replace(/\/+$/, "");
  const port = target ? 0 : await freePort();
  const base = target ?? `http://${LOOPBACK}:${port}`;
  // Locally the secret is ours to invent, because we start the service with it.
  // Against a deployment it has to be the real one, and without it the
  // sponsorship endpoints are simply closed to us.
  const secret = target ? process.env.PAYMASTER_SHARED_SECRET : randomBytes(32).toString("hex");
  const paymasterAddress = process.env.PAYMASTER_PROXY_ADDRESS;
  const trustedSigner = process.env.TRUSTED_SIGNER;

  if (!paymasterAddress || !trustedSigner) {
    throw new Error("PAYMASTER_PROXY_ADDRESS and TRUSTED_SIGNER must be set (see .env.example)");
  }

  console.log(
    target
      ? `smoke: driving the deployed service at ${base}, chain ${CHAIN}\n`
      : `smoke: booting src/index.ts on ${base}, chain ${CHAIN}\n`,
  );

  let child: ChildProcess | undefined;
  try {
    if (!target) {
      child = spawn("npx", ["tsx", "src/index.ts"], {
        cwd: REPO_ROOT,
        env: { ...process.env, PORT: String(port), PAYMASTER_SHARED_SECRET: secret as string },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (d) => childLog.push(String(d)));
      child.stderr?.on("data", (d) => childLog.push(String(d)));
      child.on("exit", (code) => childLog.push(`\n[child exited with ${code}]\n`));
    }

    await waitForReady(base, Date.now() + BOOT_TIMEOUT_MS);

    console.log("health");
    {
      const res = await fetch(`${base}/`);
      const body = await res.text();
      check("GET / is 200 and identifies the service", res.status === 200 && body.includes("paymaster"), `${res.status} ${body.slice(0, 40)}`);
    }
    {
      const res = await fetch(`${base}/ping`);
      const body = (await res.json()) as { message?: string };
      check("GET /ping answers pong", res.status === 200 && body.message === "pong");
    }

    console.log("\nthe shared-secret gate");
    const post = (headers: Record<string, string>, body: unknown, chain = CHAIN) =>
      fetch(`${base}/rpc/v1/${chain}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    {
      const res = await post({}, rpc("pm_getPaymasterStubData", []));
      check("a request with no secret is refused", res.status === 401, `status ${res.status}`);
    }
    {
      const res = await post({ "x-paymaster-secret": "not-the-secret" }, rpc("pm_getPaymasterStubData", []));
      check("a request with the wrong secret is refused", res.status === 401, `status ${res.status}`);
    }

    if (!secret) {
      // Not `return`: that would run the finally and then leave main() before
      // the summary below, so the process would exit 0 and a run that proved
      // nothing would read as a pass.
      console.log("\ninput handling");
      skipped("everything past the secret gate", "PAYMASTER_SHARED_SECRET is not set for this target");
      console.log("\nfacilitation — the check this test exists for");
      skipped(`sponsorship on ${CHAIN}`, "PAYMASTER_SHARED_SECRET is not set for this target");
      summarize();
    }

    const auth = { "x-paymaster-secret": secret };

    console.log("\ninput handling");
    {
      const res = await post(auth, rpc("pm_getPaymasterStubData", []), "dogecoin");
      check("an unsupported chain is a 400, not a 500", res.status === 400, `status ${res.status}`);
    }
    {
      const res = await post(auth, { not: "a json-rpc request" });
      const body = (await res.json()) as { error?: { code?: number }; jsonrpc?: string };
      check(
        "a malformed body is a JSON-RPC error, not a 5xx",
        res.status < 500 && body.jsonrpc === "2.0" && typeof body.error?.code === "number",
        `status ${res.status} ${JSON.stringify(body).slice(0, 60)}`,
      );
    }
    {
      const res = await post(auth, rpc("pm_getPaymasterStubData", [userOperation(), "0x000000000000000000000000000000000000dEaD", `0x${CHAIN_ID.toString(16)}`]));
      const body = (await res.json()) as { error?: unknown };
      check("an unsupported EntryPoint is rejected", Boolean(body.error), JSON.stringify(body).slice(0, 70));
    }

    console.log("\nfacilitation — the check this test exists for");
    const domainVersion = await paymasterDomainVersion(paymasterAddress as Hex);
    {
      const uo = userOperation();
      const res = await post(auth, rpc("pm_getPaymasterStubData", [uo, ENTRYPOINT_V07, `0x${CHAIN_ID.toString(16)}`]));
      const body = (await res.json()) as {
        result?: { paymaster?: string; paymasterData?: Hex; paymasterVerificationGasLimit?: string; paymasterPostOpGasLimit?: string };
        error?: unknown;
      };

      if (!body.result) {
        check("pm_getPaymasterStubData returns a result", false, JSON.stringify(body).slice(0, 200));
      } else {
        const r = body.result;
        check(
          "it sponsors from the configured paymaster",
          r.paymaster?.toLowerCase() === paymasterAddress.toLowerCase(),
          `${r.paymaster}`,
        );
        check("it returns both gas limits", Boolean(r.paymasterVerificationGasLimit && r.paymasterPostOpGasLimit));

        const data = r.paymasterData ?? "0x";
        // 0x + validUntil(uint48, 12 hex) + validAfter(uint48, 12 hex) + signature(65 bytes, 130 hex)
        check("paymasterData is validUntil+validAfter+65-byte signature", data.length === 156, `${data.length} chars`);

        if (data.length === 156) {
          const validUntil = Number(BigInt(`0x${data.slice(2, 14)}`));
          const validAfter = Number(BigInt(`0x${data.slice(14, 26)}`));
          const signature = `0x${data.slice(26)}` as Hex;
          const now = Math.floor(Date.now() / 1000);
          check("the sponsorship window brackets now", validAfter <= now && validUntil > now, `validAfter ${validAfter} <= ${now} < validUntil ${validUntil}`);

          const recovered = await recoverTypedDataAddress({
            domain: {
              name: "SignatureVerifyingPaymaster",
              version: domainVersion,
              chainId: CHAIN_ID,
              verifyingContract: paymasterAddress as Hex,
            },
            types: {
              PaymasterData: [
                { name: "validUntil", type: "uint48" },
                { name: "validAfter", type: "uint48" },
                { name: "sender", type: "address" },
                { name: "nonce", type: "uint256" },
                { name: "calldataHash", type: "bytes32" },
              ],
            },
            primaryType: "PaymasterData",
            message: {
              validUntil,
              validAfter,
              sender: uo.sender as Hex,
              nonce: BigInt(uo.nonce),
              calldataHash: keccak256(hexToBytes(uo.callData as Hex)),
            },
            signature,
          });

          check(
            "the signature recovers to the trusted signer",
            recovered.toLowerCase() === trustedSigner.toLowerCase(),
            `recovered ${recovered}`,
          );
        }
      }
    }
  } finally {
    if (child && child.exitCode === null) child.kill("SIGTERM");
  }

  summarize();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
