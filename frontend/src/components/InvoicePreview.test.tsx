import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { CompanySettings, InvoiceDesign } from "../api/client";
import InvoicePreview, { type InvoiceSheet } from "./InvoicePreview";

const BRAND_CSS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "styles",
  "brand.css",
);

const settings: CompanySettings = {
  id: 1,
  name: "Brightloop",
  address: "1 Brightloop Plaza\nNew York, NY 10004",
  email: "hello@brightloop.example",
  phone: "+1 555 0100",
  tax_label: "Sales tax",
  tax_rate_thousandths: 8875,
  payment_terms_days: 30,
  quote_prefix: "QT-",
  invoice_prefix: "INV-",
  invoice_design: "classic",
  accent_color: "#073B4C",
  logo_content_type: null,
  updated_by: "priya@brightloop.example",
  updated_at: "2026-11-24T09:00:00Z",
};

const invoice: InvoiceSheet = {
  number: "INV-0001",
  issue_date: "2026-11-26",
  due_date: "2026-12-26",
  status: "issued",
  bill_to_name: "Acme",
  bill_to_address: "1 Acme Way\nNew York, NY 10001",
  bill_to_contact_name: "Pat Lee",
  bill_to_contact_email: "pat@acme.example",
  lines: [
    { description: "Design", quantity: 1, unit_price_cents: 50_000 },
    { description: "Build", quantity: 2, unit_price_cents: 35_000 },
  ],
  subtotal_cents: 120_000,
  tax_label: "Sales tax",
  tax_rate_thousandths: 8875,
  tax_cents: 10_650,
  total_cents: 130_650,
};

afterEach(cleanup);

function renderSheet(
  overrides: Partial<InvoiceSheet> = {},
  design: InvoiceDesign = "classic",
) {
  render(
    <InvoicePreview
      invoice={{ ...invoice, ...overrides }}
      settings={{ ...settings, invoice_design: design }}
    />,
  );
}

describe("InvoicePreview", () => {
  for (const design of ["classic", "modern", "compact"] as const) {
    it(`draws the letterhead, the lines and the totals in the ${design} design`, () => {
      renderSheet({}, design);

      expect(screen.getByText("Brightloop")).toBeTruthy();
      expect(screen.getByText("1 Brightloop Plaza")).toBeTruthy();
      expect(screen.getByText("New York, NY 10004")).toBeTruthy();
      expect(
        screen.getByText("hello@brightloop.example · +1 555 0100"),
      ).toBeTruthy();
      expect(screen.getByText("Design")).toBeTruthy();
      expect(screen.getByText("Build")).toBeTruthy();
      expect(screen.getByText("$350.00")).toBeTruthy();
      expect(screen.getByText("$700.00")).toBeTruthy();
      expect(screen.getAllByText("$500.00")).toHaveLength(2);
      expect(screen.getByText("$1,200.00")).toBeTruthy();
      expect(screen.getByText("Sales tax (8.875%)")).toBeTruthy();
      expect(screen.getByText("$106.50")).toBeTruthy();
      expect(screen.getByText("$1,306.50")).toBeTruthy();
      expect(document.querySelector(`.sheet-${design}`)).toBeTruthy();
    });
  }

  it("carries the billing address in the Bill to block when there is one", () => {
    renderSheet();

    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("1 Acme Way")).toBeTruthy();
    expect(screen.getByText("Pat Lee")).toBeTruthy();
    expect(screen.getByText("pat@acme.example")).toBeTruthy();
  });

  it("shows only the name and the contact when there is no billing address", () => {
    renderSheet({ bill_to_address: null });

    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.queryByText("1 Acme Way")).toBeNull();
    expect(screen.getByText("Pat Lee")).toBeTruthy();
    expect(screen.getByText("pat@acme.example")).toBeTruthy();
  });

  for (const [status, mark] of [
    ["paid", "PAID"],
    ["overdue", "OVERDUE"],
    ["void", "VOID"],
  ] as const) {
    it(`names the ${mark} mark on a ${status} invoice`, () => {
      renderSheet({ status });

      expect(screen.getByText(mark)).toBeTruthy();
    });
  }

  it("draws no mark while money is still coming in or still owed in time", () => {
    for (const status of ["draft", "issued", "part paid"] as const) {
      cleanup();
      renderSheet({ status });
      expect(screen.queryByText(/^(PAID|OVERDUE|VOID)$/)).toBeNull();
    }
  });

  it("shows typed descriptions and names as plain text", () => {
    renderSheet({
      bill_to_name: "<i>Acme</i>",
      lines: [
        { description: "<b>x</b>", quantity: 1, unit_price_cents: 50_000 },
      ],
    });

    expect(screen.getByText("<b>x</b>")).toBeTruthy();
    expect(screen.getByText("<i>Acme</i>")).toBeTruthy();
    expect(document.querySelector("b")).toBeNull();
    expect(document.querySelector("i")).toBeNull();
  });

  it("is paper-white in both themes", () => {
    const css = fs.readFileSync(BRAND_CSS, "utf8");
    const sheet = css.match(/\.invoice-sheet\s*\{([^}]*)\}/)?.[1] ?? "";
    const dark = css.match(/\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(sheet).toMatch(/background:\s*#fff/i);
    expect(sheet).toMatch(/color:\s*#[0-9a-f]{6}/i);
    expect(dark).not.toMatch(/sheet/);
  });
});
