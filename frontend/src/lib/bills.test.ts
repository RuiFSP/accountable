import { describe, expect, it } from "vitest";

import {
  BILL_CATEGORIES,
  CATEGORY_COLORS,
  STATUS_TONES,
  billStatus,
} from "./bills";

describe("bill categories", () => {
  it("holds the six in order with their colors, Other on ink-muted", () => {
    expect(BILL_CATEGORIES).toEqual([
      "Software",
      "Contractors",
      "Travel",
      "Office",
      "Marketing",
      "Other",
    ]);
    expect(CATEGORY_COLORS).toEqual({
      Software: "var(--color-sea-green)",
      Contractors: "var(--color-marigold)",
      Travel: "var(--color-coral)",
      Office: "var(--color-cerulean)",
      Marketing: "var(--color-raspberry)",
      Other: "var(--color-ink-muted)",
    });
  });
});

describe("status tones", () => {
  it("takes the document statuses' agreed tones", () => {
    expect(STATUS_TONES).toEqual({
      unpaid: "info",
      overdue: "negative",
      paid: "positive",
    });
  });
});

describe("billStatus", () => {
  const today = new Date(2026, 5, 15); // June 15, 2026

  it("is unpaid before the due date, and due today is unpaid", () => {
    expect(billStatus({ paid_date: null, due_date: "2026-07-01" }, today)).toBe(
      "unpaid",
    );
    expect(billStatus({ paid_date: null, due_date: "2026-06-15" }, today)).toBe(
      "unpaid",
    );
  });

  it("is overdue once the due date has passed", () => {
    expect(billStatus({ paid_date: null, due_date: "2026-06-14" }, today)).toBe(
      "overdue",
    );
  });

  it("is paid whenever the paid date is set, and never overdue", () => {
    expect(
      billStatus({ paid_date: "2026-06-15", due_date: "2026-01-01" }, today),
    ).toBe("paid");
    expect(
      billStatus({ paid_date: "2026-02-03", due_date: "2026-06-20" }, today),
    ).toBe("paid");
  });
});
