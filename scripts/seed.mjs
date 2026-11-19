#!/usr/bin/env node
/* global console, process, URL */

/**
 * `npm run seed`: name the database out loud — the local file or Supabase —
 * before today's seed command asks to wipe it.
 */

import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { environmentFor } from "./env.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The local file settings.py falls back to (backend/app/settings.py). */
const DEFAULT_DATABASE_FILE = "backend/accountable.db";

/**
 * What npm run seed is about to wipe: ACCOUNTABLE_DB's file, Supabase, or
 * the local file this machine falls back to. The Supabase host only — the
 * URL carries a password and never goes on screen.
 *
 * @param {Record<string, string|undefined>} environment
 * @returns {string}
 */
export function seedTarget(environment) {
  if (environment.ACCOUNTABLE_DB) {
    return `the local file ${environment.ACCOUNTABLE_DB}`;
  }
  if (environment.DATABASE_URL) {
    return `Supabase at ${databaseHost(environment.DATABASE_URL)}`;
  }
  return `the local file ${DEFAULT_DATABASE_FILE}`;
}

function databaseHost(databaseUrl) {
  try {
    return new URL(databaseUrl).host;
  } catch {
    return "Supabase";
  }
}

function main() {
  const environment = environmentFor("seed");
  console.log(`About to wipe ${seedTarget(environment)}.`);

  const seed = spawn(
    "uv",
    ["run", "--directory", "backend", "python", "-m", "app.seed"],
    { cwd: REPO_ROOT, env: environment, stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => seed.kill(signal));
  }
  seed.on("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
