#!/usr/bin/env node
/* global console, process, URL */

/**
 * `npm run test:e2e`: take a slot no other test run is using, give this run
 * its own database, then start Playwright. The slot stays held until
 * Playwright exits, so two runs can't choose the same ports.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { claimTestRun } from "./test-ports.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLAYWRIGHT = path.join(
  REPO_ROOT,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);

async function main() {
  const run = await claimTestRun();
  const folder = mkdtempSync(
    path.join(tmpdir(), `accountable-e2e-${run.slot}-`),
  );
  const database = path.join(folder, "accountable-e2e.db");
  const environment = {
    ...process.env,
    ACCOUNTABLE_DB: database,
    ACCOUNTABLE_TEST_SLOT: String(run.slot),
    ACCOUNTABLE_API_PORT: String(run.apiPort),
    ACCOUNTABLE_WEB_PORT: String(run.webPort),
  };

  const child = spawn(
    process.execPath,
    [PLAYWRIGHT, "test", ...process.argv.slice(2)],
    { cwd: REPO_ROOT, env: environment, stdio: "inherit" },
  );

  let finished = false;
  const finish = async (code) => {
    if (finished) {
      return;
    }
    finished = true;
    await run.leave();
    rmSync(folder, { recursive: true, force: true });
    process.exit(code);
  };

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.once("error", (error) => {
    console.error(error.message);
    void finish(1);
  });
  child.once("exit", (code, signal) => {
    void finish(code ?? (signal ? 1 : 0));
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
