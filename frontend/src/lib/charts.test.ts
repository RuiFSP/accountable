import { describe, expect, it } from "vitest";

import type { DashboardPayload } from "../api/client";
import { chartMonths, funnelBars, monthLabel, monthYearLabel } from "./charts";

const twelveMonths = [
  "2025-07",
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
];

const won: DashboardPayload["won"] = {
  months: twelveMonths.map((month, index) => ({
    month,
    revenue_cents: index * 100_000,
    deals: index % 2,
  })),
  total_revenue_cents: 6_600_000,
  total_deals: 6,
};

const funnel: DashboardPayload["funnel"] = {
  stages: [
    { stage: "New", count: 2, value_cents: 100_000, expected_cents: 10_000 },
    { stage: "Qualified", count: 0, value_cents: 0, expected_cents: 0 },
    {
      stage: "Proposal",
      count: 1,
      value_cents: 200_000,
      expected_cents: 100_000,
    },
    {
      stage: "Negotiation",
      count: 1,
      value_cents: 50_000,
      expected_cents: 37_500,
    },
  ],
  won_12m_cents: 6_600_000,
  won_12m_count: 6,
  lost_cents: 50_000,
  lost_count: 1,
};

describe("month labels", () => {
  it("formats buckets for axes and the subtitle", () => {
    expect(monthLabel("2025-12")).toBe("Dec");
    expect(monthLabel("2026-01")).toBe("Jan");
    expect(monthYearLabel("2026-01")).toBe("Jan 2026");
  });
});

describe("chartMonths", () => {
  it("maps the payload into the12 plotted buckets", () => {
    const points = chartMonths(won);

    expect(points).toHaveLength(12);
    expect(points[0]).toEqual({ label: "Jul", revenueCents: 0, deals: 0 });
    expect(points[5]).toEqual({
      label: "Dec",
      revenueCents: 500_000,
      deals: 1,
    });
    expect(points[11]).toEqual({
      label: "Jun",
      revenueCents: 1_100_000,
      deals: 1,
    });
  });
});

describe("funnelBars", () => {
  it("sizes each stage against the widest open stage", () => {
    const rows = funnelBars(funnel);

    expect(rows.map((row) => row.stage)).toEqual([
      "New",
      "Qualified",
      "Proposal",
      "Negotiation",
    ]);
    expect(rows[0]).toEqual({
      stage: "New",
      count: 2,
      valueCents: 100_000,
      share: 0.5,
    });
    expect(rows[2].share).toBe(1); // Proposal is the widest
    expect(rows[1].share).toBe(0); // an empty stage draws no bar
  });

  it("never divides by zero when every stage is empty", () => {
    const empty = {
      ...funnel,
      stages: funnel.stages.map((row) => ({ ...row, value_cents: 0 })),
    };
    expect(funnelBars(empty).every((row) => row.share === 0)).toBe(true);
  });
});
