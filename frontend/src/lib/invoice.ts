/**
 * An invoice's worked-out state: its balance, its one status and how late it is.
 *
 * Stored on the invoice: draft, issued or void. The rest comes from the
 * payments and the due date — part paid, paid and overdue. The backend's
 * app/invoice_state.py does the same, and both sides run the cases in
 * shared/invoice-cases.json.
 */

export type InvoiceStoredStatus = "draft" | "issued" | "void";

export type InvoiceStatus =
  "draft" | "issued" | "part paid" | "paid" | "overdue" | "void";

export type PaymentMethod =
  "bank_transfer" | "card" | "check" | "cash" | "other";

export const PAYMENT_METHODS: PaymentMethod[] = [
  "bank_transfer",
  "card",
  "check",
  "cash",
  "other",
];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  card: "Card",
  check: "Check",
  cash: "Cash",
  other: "Other",
};

/** "Bank transfer" for the stored method; the badge always names it. */
export function paymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export type InvoiceTone =
  "neutral" | "info" | "positive" | "warning" | "negative";

/** The status's tone; the badge always names the status, never color alone. */
export function statusTone(status: InvoiceStatus): InvoiceTone {
  switch (status) {
    case "paid":
      return "positive";
    case "overdue":
      return "negative";
    case "part paid":
      return "warning";
    case "issued":
      return "info";
    default:
      return "neutral";
  }
}

/** "Part paid" for the status the rules return. */
export function statusLabel(status: InvoiceStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export const AGING_BUCKETS = [
  "not yet due",
  "1 to 30",
  "31 to 60",
  "61 to 90",
  "over 90",
] as const;

export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** What is still owed: the total minus the payments. */
export function balanceCents(totalCents: number, paidCents: number): number {
  return totalCents - paidCents;
}

/**
 * The one status an invoice shows: void and draft first, then what the
 * balance says. Due today is not overdue.
 */
export function displayStatus(
  stored: InvoiceStoredStatus,
  totalCents: number,
  paidCents: number,
  dueDate: string | null,
  today: Date,
): InvoiceStatus {
  if (stored === "void") {
    return "void";
  }
  if (stored === "draft") {
    return "draft";
  }
  if (paidCents >= totalCents) {
    return "paid";
  }
  if (dueDate !== null && parseDay(dueDate) < startOf(today)) {
    return "overdue";
  }
  if (paidCents > 0) {
    return "part paid";
  }
  return "issued";
}

/** How many days past the due date today is; negative while not yet due. */
export function daysOverdue(dueDate: string, today: Date): number {
  const day = 24 * 60 * 60 * 1000;
  return Math.round(
    (startOf(today).getTime() - parseDay(dueDate).getTime()) / day,
  );
}

/** Which of the five buckets a debt past its due date belongs to. */
export function agingBucket(dueDate: string, today: Date): AgingBucket {
  const overdue = daysOverdue(dueDate, today);
  if (overdue <= 0) {
    return AGING_BUCKETS[0];
  }
  if (overdue <= 30) {
    return AGING_BUCKETS[1];
  }
  if (overdue <= 60) {
    return AGING_BUCKETS[2];
  }
  if (overdue <= 90) {
    return AGING_BUCKETS[3];
  }
  return AGING_BUCKETS[4];
}

function parseDay(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

function startOf(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate());
}
