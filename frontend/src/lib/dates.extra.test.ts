import { describe, expect, it } from "vitest";

import {
  datetimeLocalNow,
  formatDateTime,
  formatDue,
  formatWhen,
  isOverdue,
} from "./dates";

describe("formatDateTime", () => {
  it("shows a dash for timestamps that do not parse", () => {
    expect(formatDateTime("not a date")).toBe("—");
  });
});

describe("datetimeLocalNow", () => {
  it("formats the current local time for datetime-local inputs", () => {
    expect(datetimeLocalNow()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe("comparisons that default to today", () => {
  it("treats an old date as overdue without a reference day", () => {
    expect(isOverdue("2000-01-01")).toBe(true);
    expect(isOverdue("2999-12-31")).toBe(false);
  });

  it("counts lateness from today when no day is given", () => {
    expect(formatDue("2000-01-01")).toMatch(/days late$/);
  });

  it("labels old activity timestamps with their date", () => {
    expect(formatWhen("2000-01-01T12:00:00")).toBe("Jan 1");
  });
});
