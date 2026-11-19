import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { frontendBuildEnvironment, missingSettings } from "./start.mjs";

const SETTINGS = {
  PATH: "/usr/bin",
  HOME: "/home/alex",
  SUPABASE_URL: "https://project.supabase.example",
  SUPABASE_PUBLISHABLE_KEY: "publishable-key-for-the-tests",
  DATABASE_URL: "postgres://db.example.supabase.co:5432/accountable",
};

describe("the frontend build environment", () => {
  it("carries the two public settings as VITE_ values", () => {
    const build = frontendBuildEnvironment(SETTINGS);

    assert.equal(build.VITE_SUPABASE_URL, SETTINGS.SUPABASE_URL);
    assert.equal(
      build.VITE_SUPABASE_PUBLISHABLE_KEY,
      SETTINGS.SUPABASE_PUBLISHABLE_KEY,
    );
    assert.equal(build.PATH, SETTINGS.PATH);
    assert.equal(build.HOME, SETTINGS.HOME);
  });

  it("never lets the database reach the build", () => {
    const build = frontendBuildEnvironment(SETTINGS);

    assert.equal(Object.hasOwn(build, "DATABASE_URL"), false);
    assert.equal(
      Object.values(build).some((value) =>
        String(value).includes("supabase.co:5432"),
      ),
      false,
    );
  });
});

describe("the settings npm start cannot start without", () => {
  it("names every one that is missing", () => {
    assert.deepEqual(missingSettings({}), [
      "npm start needs these in .env: DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.",
    ]);
    assert.deepEqual(missingSettings({ DATABASE_URL: SETTINGS.DATABASE_URL }), [
      "npm start needs these in .env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.",
    ]);
  });

  it("is happy when all three are there", () => {
    assert.deepEqual(missingSettings(SETTINGS), []);
  });

  it("stops for ACCOUNTABLE_DB, which means the local copy", () => {
    assert.deepEqual(
      missingSettings({ ...SETTINGS, ACCOUNTABLE_DB: "/tmp/accountable.db" }),
      [
        "ACCOUNTABLE_DB is set, so this machine runs the local copy. Unset it to run npm start.",
      ],
    );
  });
});
