import { describe, expect, it } from "vitest";

import type { Deal } from "../api/client";
import {
  applyMove,
  boardTotals,
  columnDeals,
  columnTotals,
  expectedRevenue,
  isLate,
  renumberAfterDrop,
} from "./pipeline";

const today = new Date(2026, 5, 15); // Jun15,2026

const deals: Deal[] = [
  {
    id: 1,
    name: "Alpha",
    organization_id: 1,
    contact_id: 1,
    stage: "New",
    value_cents: 100_000,
    probability: 10,
    close_date: "2026-01-01",
    position: 0,
  },
  {
    id: 2,
    name: "Beta",
    organization_id: 1,
    contact_id: 1,
    stage: "New",
    value_cents: 200_000,
    probability: 10,
    close_date: "2026-12-01",
    position: 1,
  },
  {
    id: 3,
    name: "Gamma",
    organization_id: 1,
    contact_id: 1,
    stage: "New",
    value_cents: 300_000,
    probability: 40, // set by hand
    close_date: "2026-01-05",
    position: 2,
  },
  {
    id: 4,
    name: "Closed won",
    organization_id: 1,
    contact_id: 1,
    stage: "Won",
    value_cents: 500_000,
    probability: 100,
    close_date: "2026-03-01",
    position: 0,
  },
  {
    id: 5,
    name: "Closed lost",
    organization_id: 1,
    contact_id: 1,
    stage: "Lost",
    value_cents: 50_000,
    probability: 0,
    close_date: "2026-02-01",
    position: 0,
  },
];

describe("expectedRevenue", () => {
  it("floors in cents the same way the server does", () => {
    expect(expectedRevenue(100_000, 10)).toBe(10_000);
    expect(expectedRevenue(99_999, 50)).toBe(49_999);
    expect(expectedRevenue(0, 100)).toBe(0);
  });
});

describe("totals", () => {
  it("board totals count open deals only", () => {
    expect(boardTotals(deals)).toEqual({
      valueCents: 600_000,
      expectedCents: 10_000 + 20_000 + 120_000, // Gamma's manual40%
      count: 3,
    });
  });

  it("column totals count one stage, Won and Lost included", () => {
    expect(columnTotals(deals, "Won")).toEqual({
      valueCents: 500_000,
      expectedCents: 500_000,
      count: 1,
    });
    expect(columnTotals(deals, "Qualified")).toEqual({
      valueCents: 0,
      expectedCents: 0,
      count: 0,
    });
  });
});

describe("isLate", () => {
  it("flags open deals past their close date, nothing else", () => {
    expect(isLate(deals[0], today)).toBe(true); // Jan1, still New
    expect(isLate(deals[1], today)).toBe(false); // December, still ahead
    expect(isLate(deals[3], today)).toBe(false); // Won — closed, not late
    expect(isLate({ ...deals[1], close_date: null }, today)).toBe(false);
  });
});

describe("columnDeals", () => {
  it("orders by position, then id", () => {
    expect(columnDeals(deals, "New").map((deal) => deal.id)).toEqual([1, 2, 3]);

    const tied: Deal[] = [
      { ...deals[2], id: 9, position: 0 },
      { ...deals[1], id: 8, position: 0 },
    ];
    expect(columnDeals(tied, "New").map((deal) => deal.id)).toEqual([8, 9]);
  });
});

describe("renumberAfterDrop", () => {
  it("moves a card and closes the gap", () => {
    expect(renumberAfterDrop([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(renumberAfterDrop([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(renumberAfterDrop([1, 2, 3], 1, 99)).toEqual([1, 3, 2]);
  });
});

describe("applyMove", () => {
  it("drops a card into another column: stage, default probability, both renumbered", () => {
    const next = applyMove(deals, 1, "Proposal", 0);

    const moved = next.find((deal) => deal.id === 1);
    expect(moved).toMatchObject({
      stage: "Proposal",
      position: 0,
      probability: 50, // stage default replaces10
    });

    expect(next.find((deal) => deal.id === 2)).toMatchObject({ position: 0 });
    expect(next.find((deal) => deal.id === 3)).toMatchObject({ position: 1 });
    expect(next.find((deal) => deal.id === 4)).toMatchObject({
      stage: "Won",
      position: 0,
    });
  });

  it("reorders within a column without touching the probability", () => {
    const next = applyMove(deals, 3, "New", 0);

    expect(next.find((deal) => deal.id === 3)).toMatchObject({
      stage: "New",
      position: 0,
      probability: 40, // the hand-set value survives a same-column move
    });
    expect(next.find((deal) => deal.id === 1)).toMatchObject({ position: 1 });
    expect(next.find((deal) => deal.id === 2)).toMatchObject({ position: 2 });
  });

  it("leaves unknown deals untouched", () => {
    expect(applyMove(deals, 999, "Won", 0)).toEqual(deals);
  });
});
