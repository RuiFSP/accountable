import { spawnSync } from "node:child_process";
import path from "node:path";

import type { Page } from "@playwright/test";

// The same database playwright.config.ts points the webServer at. Computed
// here too, so a spec can never accidentally reset the real data.
const E2E_DATABASE = path.resolve(process.cwd(), "accountable-e2e.db");

/**
 * Reload the sample data, so every spec file starts from a known state.
 * Runs the real `npm run seed` command — confirmation included — against the
 * e2e database only.
 */
export function resetSampleData(): void {
  const result = spawnSync("npm", ["run", "seed"], {
    input: "y\n",
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, ACCOUNTABLE_DB: E2E_DATABASE },
  });
  if (result.status !== 0) {
    throw new Error(`npm run seed failed:\n${result.stderr || result.stdout}`);
  }
}

/** Collect console errors and page errors; assert the list is empty at the end. */
export function watchConsole(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return () => errors;
}

/** A local "YYYY-MM-DD" date offset from today, for follow-up fields. */
export function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
