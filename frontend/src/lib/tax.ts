/**
 * The sums on a quote or an invoice, in whole cents, done as backend/app/tax.py does
 * them. Both sides run the cases in shared/totals-cases.json, so what a page shows
 * before it saves is what the backend saves.
 */

export const MAX_QUANTITY = 1_000_000;
export const QUANTITY_MESSAGE = "Enter a whole number from 1 to 1,000,000";

/** The money columns' ceiling, which an accepted quote's deal value also stays under. */
export const MAX_AMOUNT_CENTS = 2_147_483_647;
export const AMOUNT_MESSAGE = "Keep each amount to $21,474,836.47 or less";

const PER_PERCENT = 1000;
/** A rate of 100%, in thousandths of a percent. */
const ALL_THOUSANDTHS = 100 * PER_PERCENT;

export interface Line {
  quantity: number;
  unit_price_cents: number;
}

export interface Totals {
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
}

export function lineAmount(line: Line): number {
  return line.quantity * line.unit_price_cents;
}

/**
 * The tax at a rate in thousandths of a percent, to the nearest cent, halves up.
 * The amounts stay inside JavaScript's exact integer range at the cap above, so plain
 * integer arithmetic is enough.
 */
export function taxOn(subtotalCents: number, rateThousandths: number): number {
  return Math.floor(
    (subtotalCents * rateThousandths + ALL_THOUSANDTHS / 2) / ALL_THOUSANDTHS,
  );
}

/**
 * Tax once, on the subtotal, never line by line, where each line's rounding adds up.
 */
export function totals(lines: Line[], rateThousandths: number): Totals {
  const subtotal = lines.reduce((sum, line) => sum + lineAmount(line), 0);
  const tax = taxOn(subtotal, rateThousandths);
  return {
    subtotal_cents: subtotal,
    tax_cents: tax,
    total_cents: subtotal + tax,
  };
}

// Digits, with or without commas in threes.
const QUANTITY = /^(\d{1,3}(?:,\d{3})+|\d+)$/;

/** A typed quantity as a whole number from 1 to a million, or null if it isn't one. */
export function parseQuantity(text: string): number | null {
  const match = QUANTITY.exec(text.trim());
  if (!match) {
    return null;
  }
  const quantity = Number(match[1].replaceAll(",", ""));
  return quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null;
}
