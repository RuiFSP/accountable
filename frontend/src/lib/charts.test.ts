import { describe, expect, it } from "vitest";

import type { DashboardPayload } from "../api/client";
import {
  agingRows,
  chartMonths,
  funnelBars,
  monthLabel,
  monthYearLabel,
  paymentMonths,
} from "./charts";

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

const money: DashboardPayload["money"] = {
  owed_cents: 1_800_000,
  overdue_cents: 700_000,
  aging: [
    { bucket: "not yet due", cents: 1_100_000 },
    { bucket: "1 to 30", cents: 400_000 },
    { bucket: "31 to 60", cents: 200_000 },
    { bucket: "61 to 90", cents: 100_000 },
    { bucket: "over 90", cents: 0 },
  ],
  payments: twelveMonths.map((month, index) => ({
    month,
    cents: index * 5_000,
  })),
};

describe("paymentMonths", () => {
  it("labels the payments the way the other charts label months", () => {
    const points = paymentMonths(money);

    expect(points).toHaveLength(12);
    expect(points[0]).toEqual({ label: "Jul", cents: 0 });
    expect(points[11]).toEqual({ label: "Jun", cents: 55_000 });
  });
});

describe("agingRows", () => {
  it("sizes each bucket against the largest, oldest money widest", () => {
    const rows = agingRows(money);

    expect(rows.map((row) => row.bucket)).toEqual([
      "not yet due",
      "1 to 30",
      "31 to 60",
      "61 to 90",
      "over 90",
    ]);
    expect(rows.map((row) => row.share)).toEqual([
      1,
      4 / 11,
      2 / 11,
      1 / 11,
      0,
    ]);
    expect(rows.map((row) => row.cents)).toEqual([
      1_100_000, 400_000, 200_000, 100_000, 0,
    ]);
  });

  it("never divides by zero when nothing is owed", () => {
    const empty = agingRows({
      ...money,
      aging: money.aging.map((row) => ({ ...row, cents: 0 })),
    });

    expect(empty.every((row) => row.share === 0)).toBe(true);
  });
});
