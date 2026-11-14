/** Pipeline knowledge: stages, positions, totals and the late-deal flag. */

import type { Deal, Stage } from "../api/client";
import { isOverdue } from "./dates";

export interface StageInfo {
  /** Usual probability of close, in percent. */
  probability: number;
  /** Brand accent used for this stage. */
  color: string;
}

export const STAGE_META: Record<Stage, StageInfo> = {
  New: { probability: 10, color: "var(--color-cerulean)" },
  Qualified: { probability: 25, color: "var(--color-marigold)" },
  Proposal: { probability: 50, color: "var(--color-coral)" },
  Negotiation: { probability: 75, color: "var(--color-sea-green)" },
  Won: { probability: 100, color: "var(--color-sea-green)" },
  Lost: { probability: 0, color: "var(--color-raspberry)" },
};

export const STAGES = Object.keys(STAGE_META) as Stage[];

export const CONTACT_STATUSES = ["lead", "qualified", "customer"] as const;

export interface Totals {
  valueCents: number;
  expectedCents: number;
  count: number;
}

export function isOpen(stage: Stage): boolean {
  return stage !== "Won" && stage !== "Lost";
}

/** Value × probability, floored in cents — the same math the server does. */
export function expectedRevenue(
  valueCents: number,
  probability: number,
): number {
  return Math.floor((valueCents * probability) / 100);
}

export function totalsOf(deals: Deal[]): Totals {
  return {
    valueCents: deals.reduce((sum, deal) => sum + deal.value_cents, 0),
    expectedCents: deals.reduce(
      (sum, deal) => sum + expectedRevenue(deal.value_cents, deal.probability),
      0,
    ),
    count: deals.length,
  };
}

/** Board totals: the deals still open, Won and Lost left out. */
export function boardTotals(deals: Deal[]): Totals {
  return totalsOf(deals.filter((deal) => isOpen(deal.stage)));
}

/** One column's totals: every deal sitting in that stage. */
export function columnTotals(deals: Deal[], stage: Stage): Totals {
  return totalsOf(deals.filter((deal) => deal.stage === stage));
}

/** A deal still open after its expected close date. */
export function isLate(deal: Deal, today: Date = new Date()): boolean {
  if (!isOpen(deal.stage) || !deal.close_date) {
    return false;
  }
  return isOverdue(deal.close_date, today);
}

function byPosition(a: Deal, b: Deal): number {
  return a.position - b.position || a.id - b.id;
}

/** A column's cards, top slot first. */
export function columnDeals(deals: Deal[], stage: Stage): Deal[] {
  return deals.filter((deal) => deal.stage === stage).sort(byPosition);
}

/** Renumber a dropped card's column: [1,2,3] with2 →0 gives [3,1,2]. */
export function renumberAfterDrop(
  order: number[],
  from: number,
  to: number,
): number[] {
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/**
 * The client-side mirror of the server's stage move, so the board and its
 * totals update the moment a card lands. The server renumbers authoritatively
 * right after and its answer replaces this.
 */
export function applyMove(
  deals: Deal[],
  dealId: number,
  stage: Stage,
  position: number,
): Deal[] {
  const moved = deals.find((deal) => deal.id === dealId);
  if (!moved) {
    return deals;
  }
  const changed = moved.stage !== stage;

  const target = columnDeals(
    deals.filter((deal) => deal.id !== dealId),
    stage,
  );
  const clamped = Math.max(0, Math.min(position, target.length));
  const targetOrder = [...target.map((deal) => deal.id)];
  targetOrder.splice(clamped, 0, dealId);

  const sourceOrder = changed
    ? columnDeals(
        deals.filter((deal) => deal.id !== dealId),
        moved.stage,
      ).map((deal) => deal.id)
    : [];
  const positionIn = (order: number[], id: number): number => {
    const index = order.indexOf(id);
    return index === -1 ? -1 : index;
  };

  return deals.map((deal) => {
    if (deal.id === dealId) {
      return {
        ...deal,
        stage,
        position: positionIn(targetOrder, dealId),
        probability: changed ? STAGE_META[stage].probability : deal.probability,
      };
    }
    if (changed && deal.stage === moved.stage) {
      return { ...deal, position: positionIn(sourceOrder, deal.id) };
    }
    const targetPosition = positionIn(targetOrder, deal.id);
    if (deal.stage === stage && targetPosition >= 0) {
      return { ...deal, position: targetPosition };
    }
    return deal;
  });
}
