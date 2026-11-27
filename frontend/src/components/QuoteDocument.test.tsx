import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import QuoteDocument, { type QuoteDocumentModel } from "./QuoteDocument";

afterEach(cleanup);

const document: QuoteDocumentModel = {
  number: "QT-0001",
  createdAt: "2026-11-26",
  validUntil: "2026-12-26",
  taxLabel: "Sales tax",
  taxRateThousandths: 8875,
  company: {
    name: "Brightloop",
    address: "1 Brightloop Plaza, Floor 12, New York, NY 10004",
    email: "hello@brightloop.example",
    phone: "+1 555 0100",
  },
  organizationName: "Northwind Traders",
  contactName: "Ana Silva",
  lines: [
    {
      product_name: "Data migration",
      description: "Historic case records, in two passes.",
      quantity: 2,
      unit_price_cents: 180_000,
    },
    {
      product_name: "Annual support plan",
      description: "A year of support with quarterly check-ins.",
      quantity: 1,
      unit_price_cents: 240_000,
    },
    {
      product_name: "Onsite training day",
      description: null,
      quantity: 5,
      unit_price_cents: 120_000,
    },
  ],
};

describe("QuoteDocument", () => {
  it("shows the company and the customer", () => {
    render(<QuoteDocument document={document} />);

    expect(screen.getByText("From")).toBeTruthy();
    expect(screen.getByText("Brightloop")).toBeTruthy();
    expect(
      screen.getByText("1 Brightloop Plaza, Floor 12, New York, NY 10004"),
    ).toBeTruthy();
    expect(screen.getByText("hello@brightloop.example")).toBeTruthy();
    expect(screen.getByText("+1 555 0100")).toBeTruthy();
    expect(screen.getByText("To")).toBeTruthy();
    expect(screen.getByText("Northwind Traders")).toBeTruthy();
    expect(screen.getByText("Ana Silva")).toBeTruthy();
  });

  it("shows the number and both dates", () => {
    render(<QuoteDocument document={document} />);

    expect(screen.getByText("QT-0001")).toBeTruthy();
    expect(screen.getByText("Nov 26, 2026")).toBeTruthy();
    expect(screen.getByText("Dec 26, 2026")).toBeTruthy();
  });

  it("shows every line with its name, description, quantity, price and amount", () => {
    render(<QuoteDocument document={document} />);

    const rows = screen.getAllByRole("row").slice(1); // without the heading row
    expect(rows).toHaveLength(3);
    const [first, second, third] = rows.map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    );
    expect(first).toEqual([
      "Data migration",
      "Historic case records, in two passes.",
      "2",
      "$1,800.00",
      "$3,600.00",
    ]);
    expect(second).toEqual([
      "Annual support plan",
      "A year of support with quarterly check-ins.",
      "1",
      "$2,400.00",
      "$2,400.00",
    ]);
    expect(third).toEqual([
      "Onsite training day",
      "",
      "5",
      "$1,200.00",
      "$6,000.00",
    ]);
  });

  it("adds up the subtotal, the tax with its label and rate, and the total", () => {
    render(<QuoteDocument document={document} />);

    for (const [label, row] of [
      ["Subtotal", "Subtotal$12,000.00"],
      ["Sales tax (8.875%)", "Sales tax (8.875%)$1,065.00"],
      ["Total", "Total$13,065.00"],
    ]) {
      expect(screen.getByText(label).parentElement?.textContent).toBe(row);
    }
  });

  it("shows money with its currency and two decimals everywhere", () => {
    render(<QuoteDocument document={document} />);

    for (const amount of [
      "$1,800.00",
      "$3,600.00",
      "$12,000.00",
      "$1,065.00",
      "$13,065.00",
    ]) {
      expect(screen.getAllByText(amount).length).toBeGreaterThan(0);
    }
  });

  it("shows typed markup as text", () => {
    render(
      <QuoteDocument
        document={{
          ...document,
          lines: [
            {
              product_name: "Custom report",
              description: "**bold** <b>x</b> under_scores",
              quantity: 1,
              unit_price_cents: 65_000,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("**bold** <b>x</b> under_scores")).toBeTruthy();
    expect(screen.queryByText("bold")).toBeNull();
  });

  it("is the customer's white paper in dark mode as well as light", () => {
    const styles = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "styles",
      "brand.css",
    );
    const css = fs.readFileSync(styles, "utf8");

    render(<QuoteDocument document={document} />);
    expect(screen.getByRole("article").className).toBe("quote-document");

    // The paper's tokens are fixed in both themes: white with Midnight ink
    // and a Sea Green accent, and the dark block never re-points them.
    const dark = css.match(/\[data-theme="dark"\]\s*\{[^}]*\}/)?.[0] ?? "";
    expect(css).toMatch(/:root\s*\{[^}]*--color-document-paper: #ffffff/);
    expect(dark).not.toContain("--color-document-paper");
    expect(dark).not.toContain("--color-document-ink");
    expect(dark).not.toContain("--color-document-accent");
    const sheet = css.match(/\.quote-document\s*\{[^}]*\}/)?.[0] ?? "";
    expect(sheet).toContain("background: var(--color-document-paper)");
  });
});
