import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Two test runs can share this checkout (the turn-end hook's check and an
// agent's), and Vitest refuses to start while another process holds its
// coverage directory. test-run.mjs passes each run's slot down, so each run
// reports into its own slot's directory; a run outside that machinery keeps
// the default.
const coverageSlot = process.env.ACCOUNTABLE_TEST_SLOT;

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
      ...(coverageSlot
        ? { reportsDirectory: `coverage/slot${coverageSlot}` }
        : {}),
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
