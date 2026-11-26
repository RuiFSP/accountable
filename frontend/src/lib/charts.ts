/** Chart mapping: dashboard payload → what the charts and funnel render. */

import type { DashboardPayload, Stage } from "../api/client";

/** Recharts' axis labels follow the mode through the ink token. */
export const AXIS_TICK = { fill: "var(--color-ink-muted)", fontSize: 12 };

/** Recharts' default tooltip is a white box; both modes take it from tokens. */
export const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-panel)",
  border: "1px solid var(--color-tooltip-border)",
  color: "var(--color-ink)",
};

/** Axis label for a "YYYY-MM" bucket, e.g. "Dec". */
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  });
}

/** "Dec2025" for the page subtitle. */
export function monthYearLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export interface RevenuePoint {
  label: string;
  revenueCents: number;
  deals: number;
}

/** The12 monthly buckets the line and bar charts plot, oldest first. */
export function chartMonths(won: DashboardPayload["won"]): RevenuePoint[] {
  return won.months.map((month) => ({
    label: monthLabel(month.month),
    revenueCents: month.revenue_cents,
    deals: month.deals,
  }));
}

export interface FunnelBar {
  stage: Stage;
  count: number;
  valueCents: number;
  /**0…1 share of the widest open stage, for bar widths. */
  share: number;
}

/** Funnel payload → stage rows sized against the widest open stage. */
export function funnelBars(funnel: DashboardPayload["funnel"]): FunnelBar[] {
  const widest = Math.max(1, ...funnel.stages.map((row) => row.value_cents));
  return funnel.stages.map((row) => ({
    stage: row.stage,
    count: row.count,
    valueCents: row.value_cents,
    share: row.value_cents / widest,
  }));
}
