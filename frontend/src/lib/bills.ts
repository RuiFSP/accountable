/** Bill knowledge shared by the money pages and the dashboard: the fixed
 * category list with its colors, the status tones, and the one derivation of
 * a bill's status — so neither side owns them alone. */

import type { BillCategory, BillStatus } from "../api/client";
import type { StatusTone } from "../components/StatusBadge";
import { isOverdue } from "./dates";

/** The color of each category, on the brand's existing tokens. */
export const CATEGORY_COLORS: Record<BillCategory, string> = {
  Software: "var(--color-sea-green)",
  Contractors: "var(--color-marigold)",
  Travel: "var(--color-coral)",
  Office: "var(--color-cerulean)",
  Marketing: "var(--color-raspberry)",
  Other: "var(--color-ink-muted)",
};

/** The fixed six, in the order the form, the table and the legend show. */
export const BILL_CATEGORIES = Object.keys(CATEGORY_COLORS) as BillCategory[];

/** A bill's badge tone, in the document statuses' agreed tones. */
export const STATUS_TONES: Record<BillStatus, StatusTone> = {
  unpaid: "info",
  overdue: "negative",
  paid: "positive",
};

/**
 * The same derivation the server makes: paid when the paid date is set,
 * overdue when unpaid and the due date is before today, else unpaid — due
 * today is unpaid.
 */
export function billStatus(
  bill: { paid_date: string | null; due_date: string | null },
  today: Date = new Date(),
): BillStatus {
  if (bill.paid_date) {
    return "paid";
  }
  if (bill.due_date && isOverdue(bill.due_date, today)) {
    return "overdue";
  }
  return "unpaid";
}
