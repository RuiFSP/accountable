import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "@playwright/test";

const testDatabase = path.resolve("accountable-e2e.db");

// Specs need the same database the webServer uses: they call the seed command
// and the API directly, and must never touch the real data.
process.env.ACCOUNTABLE_DB = testDatabase;

// docs/spec.md: the suite runs on installed Google Chrome. Playwright finds it
// at /opt/google/chrome/chrome on Linux; where it is missing (a container
// without it, no sudo to install it), fall back to Playwright's bundled
// Chromium so `npm test` still runs instead of failing to launch.
const chrome =
  process.platform !== "linux" || fs.existsSync("/opt/google/chrome/chrome");

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  // The default reporter is `dot` on CI and `list` locally — neither writes a
  // report. The html report is what CI uploads when a run fails.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5173",
    ...(chrome ? { channel: "chrome" as const } : {}),
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:8000/api/organizations",
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ACCOUNTABLE_DB: testDatabase },
  },
});
