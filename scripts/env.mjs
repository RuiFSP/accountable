/* global process, URL */

/**
 * What each command may see of .env: only `start` and `seed` read it, and
 * ACCOUNTABLE_DB always wins and means local, so it drops the three settings
 * wherever they came from. Everything else runs the local copy.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

/** The settings that reach the shared app, and nothing else may carry. */
export const SETTINGS = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
];

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The only commands that read .env (docs/specs/running.md). */
const READS_DOT_ENV = new Set(["start", "seed"]);

function readDotEnv(root) {
  const file = path.join(root, ".env");
  if (!existsSync(file)) {
    return {};
  }
  return parseEnv(readFileSync(file, "utf8"));
}

/**
 * The environment a command runs with.
 *
 * @param {string} command - the npm script's name, e.g. "start" or "test".
 * @param {{shell?: Record<string, string|undefined>, root?: string}} [options]
 *   `shell` stands in for the process environment, `root` for the repository
 *   holding the .env — both so the tests can.
 * @returns {Record<string, string|undefined>}
 */
export function environmentFor(
  command,
  { shell = process.env, root = REPO_ROOT } = {},
) {
  const readsDotEnv = READS_DOT_ENV.has(command);
  const environment = { ...(readsDotEnv ? readDotEnv(root) : {}), ...shell };
  if (!readsDotEnv || environment.ACCOUNTABLE_DB) {
    for (const name of SETTINGS) {
      delete environment[name];
    }
  }
  return environment;
}
