import { describe, expect, it } from "vitest";

import { formatUsd, formatUsdCompact, parseUsdToCents } from "./money";

describe("formatUsd", () => {
  it("formats whole dollars without cents", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(1_200_000)).toBe("$12,000");
    expect(formatUsd(6_357_500)).toBe("$63,575");
  });

  it("keeps cents only when there are any", () => {
    expect(formatUsd(123_456)).toBe("$1,234.56");
    expect(formatUsd(50)).toBe("$0.50");
  });
});

describe("formatUsdCompact", () => {
  it("shortens thousands for chart axes", () => {
    expect(formatUsdCompact(2_400_000)).toBe("$24k");
    expect(formatUsdCompact(600_000)).toBe("$6k");
    expect(formatUsdCompact(25_000)).toBe("$250");
  });
});

describe("parseUsdToCents", () => {
  it("parses what people type", () => {
    expect(parseUsdToCents("12,500")).toBe(1_250_000);
    expect(parseUsdToCents("$1,234.50")).toBe(123_450);
    expect(parseUsdToCents("0.99")).toBe(99);
    expect(parseUsdToCents("12")).toBe(1_200);
  });

  it("rejects anything that isn't an amount", () => {
    expect(parseUsdToCents("")).toBeNull();
    expect(parseUsdToCents("abc")).toBeNull();
    expect(parseUsdToCents("12.345")).toBeNull();
    expect(parseUsdToCents("-5")).toBeNull();
  });

  it("round trips with the formatter", () => {
    for (const cents of [0, 99, 12_500, 1_234_567]) {
      expect(parseUsdToCents(formatUsd(cents))).toBe(cents);
    }
  });
});
