#!/usr/bin/env node
/* global console, process, URL */

/**
 * `npm run test:e2e`: take a slot no other test run is using, give this run
 * its own database, then start Playwright. The slot stays held until
 * Playwright exits, so two runs can't choose the same ports.
 *
 * npm run check and npm test already hold a slot and a turn, and pass them
 * down; run directly, this takes its own.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { portsFor } from "./test-plan.mjs";
import { joinTestRuns, whyWaiting } from "./test-runs.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLAYWRIGHT = path.join(
  REPO_ROOT,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);

async function main() {
  const alreadyGoing =
    process.env.ACCOUNTABLE_TEST_TURN === "1" &&
    process.env.ACCOUNTABLE_TEST_SLOT !== undefined;
  let run = null;

  if (!alreadyGoing) {
    run = await joinTestRuns({
      serverPorts: (slot) => Object.values(portsFor(slot)),
    });
    await run.takeTurn((reason) => {
      console.log(`\n${whyWaiting(reason)}`);
    });
  }

  const slot = Number(
    alreadyGoing ? process.env.ACCOUNTABLE_TEST_SLOT : run.slot,
  );
  const ports = portsFor(slot);
  const folder = mkdtempSync(path.join(tmpdir(), `accountable-e2e-${slot}-`));
  const database = path.join(folder, "accountable-e2e.db");
  const environment = {
    ...process.env,
    ACCOUNTABLE_DB: database,
    ACCOUNTABLE_TEST_SLOT: String(slot),
    ACCOUNTABLE_API_PORT: String(ports.apiPort),
    ACCOUNTABLE_WEB_PORT: String(ports.webPort),
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
    if (run) {
      try {
        await run.leave();
      } catch (error) {
        console.error(error.message);
      }
    }
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
