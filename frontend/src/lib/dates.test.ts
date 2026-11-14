import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatDue, isOverdue } from "./dates";

const today = new Date(2026, 10, 14); // Nov 14, 2026, local time

describe("formatDate", () => {
  it("parses close dates as local dates", () => {
    expect(formatDate("2026-12-04")).toBe("Dec 4, 2026");
    expect(formatDate("2026-01-15")).toBe("Jan 15, 2026");
  });

  it("shows a dash when there is no date", () => {
    expect(formatDate(null)).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("shows the day and the local time", () => {
    expect(formatDateTime("2026-11-10T09:30:00")).toBe(
      "Nov 10, 2026 · 9:30 AM",
    );
  });
});

describe("isOverdue", () => {
  it("is true only for days before today", () => {
    expect(isOverdue("2026-11-13", today)).toBe(true);
    expect(isOverdue("2026-11-14", today)).toBe(false);
    expect(isOverdue("2026-11-15", today)).toBe(false);
  });
});

describe("formatDue", () => {
  it("classifies dates around today", () => {
    expect(formatDue("2026-11-14", today)).toBe("Today");
    expect(formatDue("2026-11-15", today)).toBe("Tomorrow");
    expect(formatDue("2026-11-13", today)).toBe("1 day late");
    expect(formatDue("2026-11-11", today)).toBe("3 days late");
  });

  it("falls back to the date for later follow-ups", () => {
    expect(formatDue("2026-11-24", today)).toBe("Nov 24, 2026");
    expect(formatDue("2026-12-04", today)).toBe("Dec 4, 2026");
  });
});
