/* global URL */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/** The build command render.yaml hands Render, its folded lines joined back up. */
function buildCommand() {
  const lines = readFileSync(
    new URL("../render.yaml", import.meta.url),
    "utf8",
  ).split("\n");
  const marker = lines.findIndex((line) => line.includes("buildCommand:"));
  assert.notEqual(marker, -1, "render.yaml has a buildCommand");
  const indent = lines[marker].length - lines[marker].trimStart().length;
  const command = [];
  for (const line of lines.slice(marker + 1)) {
    const leading = line.length - line.trimStart().length;
    if (!line.trim() || leading <= indent) {
      break;
    }
    command.push(line.trim());
  }
  return command.join(" ");
}

describe("the build command render.yaml gives Render", () => {
  it("carries the two public settings across as VITE_ values", () => {
    const command = buildCommand();

    // Mapped, in that order, directly in front of the build itself.
    assert.match(
      command,
      /VITE_SUPABASE_URL=\$SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY=\$SUPABASE_PUBLISHABLE_KEY node /,
    );
  });

  it("never lets the database reach the build", () => {
    const command = buildCommand();

    assert.equal(command.includes("DATABASE_URL"), false);
  });
});
