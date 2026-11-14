import path from "node:path";

import { defineConfig } from "@playwright/test";

const testDatabase = path.resolve("accountable-e2e.db");

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:5173",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:8000/api/organizations",
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ACCOUNTABLE_DB: testDatabase },
  },
});
