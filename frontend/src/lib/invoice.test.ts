import { describe, expect, it } from "vitest";

import cases from "../../../shared/invoice-cases.json";
import {
  agingBucket,
  balanceCents,
  daysOverdue,
  displayStatus,
  type InvoiceStoredStatus,
  PAYMENT_METHODS,
  paymentMethodLabel,
  statusLabel,
  statusTone,
} from "./invoice";

const TODAY = new Date(2026, 10, 26);

/** The calendar day as the API writes it: local, never moved through UTC. */
function isoOf(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

function dueDateFor(daysFromToday: number | null): string | null {
  if (daysFromToday === null) {
    return null;
  }
  const day = new Date(TODAY);
  day.setDate(day.getDate() + daysFromToday);
  return isoOf(day);
}

describe("displayStatus", () => {
  it("reads the shared cases the way the backend does", () => {
    for (const example of cases.statuses) {
      const shown = displayStatus(
        example.stored as InvoiceStoredStatus,
        example.total_cents,
        example.paid_cents,
        dueDateFor(example.due_in_days),
        TODAY,
      );
      expect(shown, example.why).toBe(example.status);
    }
  });

  it("reads void and draft first, whatever the balance says", () => {
    expect(displayStatus("void", 10_000, 0, dueDateFor(-5), TODAY)).toBe(
      "void",
    );
    expect(displayStatus("draft", 10_000, 10_000, dueDateFor(-5), TODAY)).toBe(
      "draft",
    );
  });
});

describe("balanceCents", () => {
  it("is the total minus the payments", () => {
    expect(balanceCents(130_650, 50_000)).toBe(80_650);
    expect(balanceCents(130_650, 130_650)).toBe(0);
    expect(balanceCents(130_650, 0)).toBe(130_650);
  });
});

describe("aging", () => {
  it("puts an invoice in the right bucket, with due today not yet due", () => {
    for (const example of cases.aging) {
      expect(
        agingBucket(dueDateFor(example.due_in_days)!, TODAY),
        example.why,
      ).toBe(example.bucket);
    }
  });

  it("counts the days past the due date", () => {
    expect(daysOverdue(dueDateFor(-10)!, TODAY)).toBe(10);
    expect(daysOverdue(dueDateFor(0)!, TODAY)).toBe(0);
    expect(daysOverdue(dueDateFor(4)!, TODAY)).toBe(-4);
  });
});

describe("the badges and payment methods", () => {
  it("gives every status a tone and a name that says what it is", () => {
    expect(statusTone("paid")).toBe("positive");
    expect(statusTone("overdue")).toBe("negative");
    expect(statusTone("part paid")).toBe("warning");
    expect(statusTone("issued")).toBe("info");
    expect(statusTone("draft")).toBe("neutral");
    expect(statusTone("void")).toBe("neutral");
    expect(statusLabel("part paid")).toBe("Part paid");
    expect(statusLabel("void")).toBe("Void");
  });

  it("names each of the five payment methods", () => {
    expect(PAYMENT_METHODS.map(paymentMethodLabel)).toEqual([
      "Bank transfer",
      "Card",
      "Check",
      "Cash",
      "Other",
    ]);
  });
});
