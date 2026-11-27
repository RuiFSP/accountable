import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${process.env.ACCOUNTABLE_API_PORT ?? "8000"}`,
    },
  },
  test: {
    environment: "jsdom",
    // `npm test` runs this suite alongside pytest and Playwright, so the
    // default of one fork per CPU overloads small machines: workers miss
    // Vitest's 60s start handshake and the run dies with unhandled errors.
    maxWorkers: 4,
    coverage: {
      provider: "v8",
      reporter: ["text"],
      // Two runs may share this machine on different slots, and Vitest refuses
      // to have two processes write one reports directory — each run gets its
      // own, keyed on the slot `scripts/test-run.mjs` already passes down.
      reportsDirectory: `coverage/${process.env.ACCOUNTABLE_TEST_SLOT ?? `pid-${process.pid}`}`,
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
