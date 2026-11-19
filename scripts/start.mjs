#!/usr/bin/env node
/* global console, process, URL */

/**
 * `npm start`: build the frontend the way Render does, then run the backend
 * the way Render runs it, at http://localhost:8000 — where the backend
 * serves the built frontend itself.
 */

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { environmentFor } from "./env.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FRONTEND = path.join(REPO_ROOT, "frontend");
const VITE_BUILD = path.join(
  REPO_ROOT,
  "node_modules",
  "vite",
  "bin",
  "vite.js",
);

/** The settings npm start cannot start without. */
const REQUIRED = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];

/**
 * The environment the frontend build runs with: the two public settings as
 * VITE_ values, and nothing else — the database never reaches the build, so
 * it can never end up in the page.
 *
 * @param {Record<string, string|undefined>} environment
 */
export function frontendBuildEnvironment(environment) {
  return {
    PATH: environment.PATH,
    HOME: environment.HOME,
    VITE_SUPABASE_URL: environment.SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: environment.SUPABASE_PUBLISHABLE_KEY,
  };
}

/**
 * What stops npm start, as sentences to print. Empty when it may run.
 *
 * @param {Record<string, string|undefined>} environment
 * @returns {string[]}
 */
export function missingSettings(environment) {
  if (environment.ACCOUNTABLE_DB) {
    return [
      "ACCOUNTABLE_DB is set, so this machine runs the local copy. Unset it to run npm start.",
    ];
  }
  const missing = REQUIRED.filter((name) => !environment[name]);
  if (missing.length === 0) {
    return [];
  }
  return [`npm start needs these in .env: ${missing.join(", ")}.`];
}

function main() {
  const environment = environmentFor("start");
  const problems = missingSettings(environment);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    process.exit(1);
  }

  const build = spawnSync(process.execPath, [VITE_BUILD, "build"], {
    cwd: FRONTEND,
    env: frontendBuildEnvironment(environment),
    stdio: "inherit",
  });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  console.log("Accountable is at http://localhost:8000");
  const backend = spawn(
    "uv",
    [
      "run",
      "--directory",
      "backend",
      "uvicorn",
      "app.main:app",
      "--host",
      "0.0.0.0",
      "--port",
      "8000",
    ],
    { env: environment, stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => backend.kill(signal));
  }
  backend.on("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
