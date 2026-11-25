import { describe, expect, it } from "vitest";

import cases from "../../../shared/totals-cases.json";
import {
  MAX_AMOUNT_CENTS,
  MAX_QUANTITY,
  lineAmount,
  parseQuantity,
  taxOn,
  totals,
} from "./tax";

describe("the money sums", () => {
  it("adds up every shared case as the backend does", () => {
    for (const example of cases) {
      const lines = example.lines.map(([quantity, price]) => ({
        quantity,
        unit_price_cents: price,
      }));
      expect(totals(lines, example.rate), example.why).toEqual({
        subtotal_cents: example.subtotal,
        tax_cents: example.tax,
        total_cents: example.total,
      });
    }
  });

  it("rounds a half cent up, not to the even cent", () => {
    expect(taxOn(50, 5000)).toBe(3);
    expect(Math.round((50 * 5000) / 100_000)).toBe(3);
  });

  it("works the tax out once on the subtotal", () => {
    expect(taxOn(10, 5000) + taxOn(10, 5000)).toBe(2);
    expect(
      totals(
        [
          { quantity: 10, unit_price_cents: 1 },
          { quantity: 10, unit_price_cents: 1 },
        ],
        5000,
      ).tax_cents,
    ).toBe(1);
  });

  it("multiplies a line's quantity by its unit price", () => {
    expect(lineAmount({ quantity: 3, unit_price_cents: 4950 })).toBe(14850);
  });
});

describe("a typed quantity", () => {
  it("reads a whole number, commas and all", () => {
    expect(parseQuantity("1")).toBe(1);
    expect(parseQuantity("1,000")).toBe(1000);
    expect(parseQuantity(" 1000000 ")).toBe(MAX_QUANTITY);
  });

  it("refuses zero, fractions, text and anything past the limit", () => {
    for (const text of ["0", "1.5", "two", "", "1000001", "-1"]) {
      expect(parseQuantity(text), text).toBeNull();
    }
  });

  it("keeps the amount limit the money columns have", () => {
    expect(MAX_AMOUNT_CENTS).toBe(2_147_483_647);
  });
});
