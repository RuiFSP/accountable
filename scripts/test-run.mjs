#!/usr/bin/env node
/* global console, performance, process, URL */

/**
 * Runs an npm script as a test run: takes a slot, waits for one of the two
 * turns, then starts the script and holds the turn until it ends. Runs that
 * are already inside a test run, such as npm test called by npm run check,
 * inherit the turn and start at once.
 *
 * npm run test:backend and the other test scripts go through here too, so no
 * two runs start their checks without taking turns.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { MAX_RUNS, portsFor } from "./test-plan.mjs";
import { joinTestRuns, whyWaiting } from "./test-runs.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const [target, ...args] = process.argv.slice(2);

function duration(ms) {
  if (ms < 60_000) {
    return `${Math.round(ms / 1000)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

async function main() {
  if (!target) {
    throw new Error("Say which npm script to run, such as test:backend:raw.");
  }

  const alreadyGoing = process.env.ACCOUNTABLE_TEST_TURN === "1";
  let run = null;
  let environment = { ...process.env };

  if (!alreadyGoing) {
    run = await joinTestRuns({
      serverPorts: (slot) => Object.values(portsFor(slot)),
    });
    const began = performance.now();
    let waited = false;
    await run.takeTurn((reason) => {
      waited = true;
      console.log(`\n${whyWaiting(reason)}`);
    });
    if (waited) {
      console.log(
        `\nGot a turn after waiting ${duration(performance.now() - began)}.\n`,
      );
    }
    const ports = portsFor(run.slot);
    environment = {
      ...environment,
      ACCOUNTABLE_TEST_TURN: "1",
      ACCOUNTABLE_TEST_SLOT: String(run.slot),
      ACCOUNTABLE_API_PORT: String(ports.apiPort),
      ACCOUNTABLE_WEB_PORT: String(ports.webPort),
    };
  }

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  if (run) {
    process.stderr.write(
      `Test run slot ${run.slot + 1} of ${MAX_RUNS} has a turn.\n`,
    );
  }
  const child = spawn(npm, ["run", target, ...args], {
    cwd: REPO_ROOT,
    env: environment,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

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
        // The checks have finished; a slot-cleanup failure must not turn a
        // green run red.
        console.error(error.message);
      }
    }
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
