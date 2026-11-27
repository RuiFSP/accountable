import { afterEach, describe, expect, it, vi } from "vitest";

// Two test runs can share this checkout (the turn-end hook's check and an
// agent's), and Vitest refuses to start while another process holds its
// coverage directory. test-run.mjs passes each run's slot down; the config
// sends each run's report to its own slot's directory, and a run outside
// that machinery keeps the default.

afterEach(() => {
  delete process.env.ACCOUNTABLE_TEST_SLOT;
  vi.resetModules();
});

async function loadedConfig() {
  const loaded = await import("../vite.config");
  return loaded.default;
}

describe("the coverage directory the frontend reports into", () => {
  it("stays the default for a run outside the test-run machinery", async () => {
    delete process.env.ACCOUNTABLE_TEST_SLOT;

    const config = await loadedConfig();

    expect(config.test?.coverage?.reportsDirectory).toBeUndefined();
  });

  it("is the run's own slot's directory during a test run", async () => {
    process.env.ACCOUNTABLE_TEST_SLOT = "3";

    const config = await loadedConfig();

    expect(config.test?.coverage?.reportsDirectory).toBe("coverage/slot3");
  });
});
