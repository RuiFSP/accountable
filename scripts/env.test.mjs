/* global URL */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { environmentFor } from "./env.mjs";

const DATABASE_URL = "postgres://db.example.supabase.co:5432/accountable";

/** A repository whose .env holds the three settings, as the owner's does. */
function repoWithDotEnv(extra = "") {
  const root = mkdtempSync(path.join(tmpdir(), "accountable-env-"));
  writeFileSync(
    path.join(root, ".env"),
    [
      "# The three settings, for npm start and npm run seed only.",
      `DATABASE_URL=${DATABASE_URL}`,
      "SUPABASE_URL=https://project.supabase.example",
      "SUPABASE_PUBLISHABLE_KEY=publishable-key-for-the-tests",
      extra,
    ].join("\n"),
  );
  return root;
}

const THREE = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];

function absent(environment, names = THREE) {
  for (const name of names) {
    assert.equal(environment[name], undefined, name);
  }
}

describe("environmentFor", () => {
  it("passes the three settings to start and seed", () => {
    const root = repoWithDotEnv();

    for (const command of ["start", "seed"]) {
      const environment = environmentFor(command, { shell: {}, root });

      assert.equal(environment.DATABASE_URL, DATABASE_URL, command);
      assert.equal(
        environment.SUPABASE_URL,
        "https://project.supabase.example",
        command,
      );
      assert.ok(environment.SUPABASE_PUBLISHABLE_KEY, command);
    }
  });

  it("keeps .env away from every other command", () => {
    const root = repoWithDotEnv();

    for (const command of ["dev", "test", "check", "test:scripts"]) {
      const environment = environmentFor(command, { shell: {}, root });

      absent(environment);
      assert.equal(environment.ACCOUNTABLE_DB, undefined, command);
    }
  });

  it("keeps the settings out even when the shell exports them", () => {
    const shell = {
      DATABASE_URL: "postgres://from-the-shell",
      SUPABASE_URL: "https://shell.example",
      SUPABASE_PUBLISHABLE_KEY: "shell-key",
    };

    const environment = environmentFor("test", {
      shell,
      root: repoWithDotEnv(),
    });

    absent(environment);
  });

  it("lets ACCOUNTABLE_DB win and mean local", () => {
    const root = repoWithDotEnv();
    const shell = { ACCOUNTABLE_DB: "/tmp/accountable-local.db" };

    for (const command of ["start", "seed", "dev"]) {
      const environment = environmentFor(command, { shell, root });

      assert.equal(environment.ACCOUNTABLE_DB, "/tmp/accountable-local.db");
      absent(environment);
    }
  });

  it("reads .env with Node's own parser", () => {
    const root = repoWithDotEnv(
      '# a comment below\nSUPABASE_URL = "https://quoted.example"\n',
    );

    const environment = environmentFor("start", { shell: {}, root });

    assert.equal(environment.SUPABASE_URL, "https://quoted.example");
  });

  it("runs without a .env at all", () => {
    const root = mkdtempSync(path.join(tmpdir(), "accountable-no-env-"));

    const environment = environmentFor("start", {
      shell: { PATH: "/usr/bin" },
      root,
    });

    absent(environment);
    assert.equal(environment.PATH, "/usr/bin");
  });
});

describe("what can reach .env", () => {
  it("is only npm start and npm run seed", () => {
    // The split's real guarantee, pinned: dev, test and check run no script
    // that reads .env, so the settings can never be handed to them (the
    // environmentFor cases above only exercise the reader itself).
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    assert.equal(packageJson.scripts.start, "node scripts/start.mjs");
    assert.equal(packageJson.scripts.seed, "node scripts/seed.mjs");
    for (const [name, command] of Object.entries(packageJson.scripts)) {
      if (name === "start" || name === "seed") {
        continue;
      }
      assert.equal(command.includes(".env"), false, name);
      assert.equal(/scripts\/(env|start|seed)\.mjs/.test(command), false, name);
    }

    const scripts = readdirSync(new URL("../scripts", import.meta.url)).filter(
      (file) =>
        file.endsWith(".mjs") &&
        !file.endsWith(".test.mjs") &&
        file !== "env.mjs",
    );
    const readers = scripts.filter((file) =>
      readFileSync(
        new URL(`../scripts/${file}`, import.meta.url),
        "utf8",
      ).includes('from "./env.mjs"'),
    );
    assert.deepEqual(readers.sort(), ["seed.mjs", "start.mjs"]);
  });
});
