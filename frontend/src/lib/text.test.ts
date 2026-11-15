import { describe, expect, it } from "vitest";

import { capitalize } from "./text";

describe("capitalize", () => {
  it("uppercases the first letter and keeps the rest", () => {
    expect(capitalize("note")).toBe("Note");
    expect(capitalize("call")).toBe("Call");
    expect(capitalize("already capital")).toBe("Already capital");
  });

  it("leaves empty and single-letter strings intact", () => {
    expect(capitalize("")).toBe("");
    expect(capitalize("a")).toBe("A");
  });
});
