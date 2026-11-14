/** US dollar formatting for values stored in cents. */

const wholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const centsFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsd(cents: number): string {
  return cents % 100 === 0
    ? wholeDollars.format(cents / 100)
    : centsFormatter.format(cents / 100);
}

/** Compact axis labels: $24k, $6k — small amounts stay exact. */
export function formatUsdCompact(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) {
    return `$${Math.round(dollars / 1000)}k`;
  }
  return formatUsd(cents);
}

/** Parses user input like "$1,234.50" into cents; null when it isn't a valid amount. */
export function parseUsdToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const [dollars, fraction = ""] = cleaned.split(".");
  return Number(dollars) * 100 + Number((fraction + "00").slice(0, 2));
}
