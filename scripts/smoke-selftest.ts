/**
 * Self-test for the smoke test's SMOKE_TARGET mode.
 *
 * `npm run smoke` spawns the service itself, so that path gets exercised every
 * time it runs. The SMOKE_TARGET path — the one that drives an already-deployed
 * instance — would otherwise only ever run against production, which is the
 * worst place to discover it is broken.
 *
 * So this starts a real instance locally, points the smoke test at it as if it
 * were a deployment, and asserts both outcomes:
 *
 *   with the shared secret     exit 0, facilitation proved
 *   without the shared secret  exit 2, reported NOT ASSESSED rather than passing
 *
 * The second one matters more. A post-deploy check that silently returns green
 * when it could not authenticate is worse than no check, because someone will
 * read it as "production is fine".
 *
 * Run: npm run smoke:selftest
 */

import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";

const HOST = "127.0.0.1";
const BOOT_TIMEOUT_MS = 90_000;

let failures = 0;

function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, HOST, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForReady(base: string, deadline: number, log: string[]): Promise<void> {
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/ping`)).ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`service never answered /ping\n${log.join("")}`);
}

/** Run the smoke test against an existing URL and return its exit code and output. */
function runSmokeAgainst(target: string, secret?: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, SMOKE_TARGET: target };
    if (secret) env.PAYMASTER_SHARED_SECRET = secret;
    else delete env.PAYMASTER_SHARED_SECRET;

    const proc = spawn("npx", ["tsx", "scripts/smoke.ts"], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout?.on("data", (d) => (out += String(d)));
    proc.stderr?.on("data", (d) => (out += String(d)));
    proc.on("exit", (code) => resolve({ code: code ?? -1, out }));
  });
}

async function main(): Promise<void> {
  const secret = randomBytes(32).toString("hex");
  const port = await freePort();
  const base = `http://${HOST}:${port}`;
  const log: string[] = [];

  console.log(`smoke:selftest — standing up an instance at ${base} and treating it as a deployment\n`);

  let service: ChildProcess | undefined;
  try {
    service = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), PAYMASTER_SHARED_SECRET: secret },
      stdio: ["ignore", "pipe", "pipe"],
    });
    service.stdout?.on("data", (d) => log.push(String(d)));
    service.stderr?.on("data", (d) => log.push(String(d)));

    await waitForReady(base, Date.now() + BOOT_TIMEOUT_MS, log);

    {
      const { code, out } = await runSmokeAgainst(base, secret);
      check("with the shared secret, it proves facilitation and exits 0", code === 0, `exit ${code}`);
      check("and it says so", out.includes("still facilitates"), out.trim().split("\n").pop());
      check(
        "and it really drove the deployment rather than spawning its own",
        out.includes("driving the deployed service"),
      );
    }

    {
      const { code, out } = await runSmokeAgainst(base);
      check("without the secret, it does NOT report a pass", !out.includes("smoke passed"), out.trim().split("\n").pop());
      check("it marks the facilitation checks NOT ASSESSED", out.includes("NOT ASSESSED"));
      check("and exits 2, distinct from both pass and fail", code === 2, `exit ${code}`);
    }
  } finally {
    if (service && service.exitCode === null) service.kill("SIGTERM");
  }

  console.log();
  console.log(failures === 0 ? "smoke:selftest passed" : `smoke:selftest FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
