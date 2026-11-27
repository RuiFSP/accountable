import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  logoDataUrl,
  type CompanySettings,
  type InvoiceDetail,
} from "../../api/client";
import { downloadPdf, invoicesApi } from "../../api/invoices";
import InvoicePage from "./Invoice";

vi.mock("../../api/client", () => ({
  api: {
    settings: { get: vi.fn() },
    products: { list: vi.fn() },
  },
  logoDataUrl: vi.fn(),
}));

vi.mock("../../api/invoices", () => ({
  invoicesApi: {
    get: vi.fn(),
    update: vi.fn(),
    issue: vi.fn(),
    remove: vi.fn(),
    void: vi.fn(),
    recordPayment: vi.fn(),
    deletePayment: vi.fn(),
  },
  downloadPdf: vi.fn(),
}));

const settings: CompanySettings = {
  id: 1,
  name: "Brightloop",
  address: "1 Brightloop Plaza, Floor 12, New York, NY 10004",
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
  updated_at: "2026-11-22T09:30:00+00:00",
};

function invoiceWith(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: 4,
    number: "INV-0007",
    deal_id: 1,
    organization_id: 7,
    deal_name: "Store rollout",
    organization_name: "Northwind Traders",
    status: "issued",
    issue_date: "2026-11-01",
    due_date: "2026-12-01",
    subtotal_cents: 100_000,
    tax_label: "Sales tax",
    tax_rate_thousandths: 8875,
    tax_cents: 8_875,
    total_cents: 108_875,
    paid_cents: 40_000,
    balance_cents: 68_875,
    bill_to_name: "Northwind Traders",
    bill_to_address: null,
    bill_to_contact_name: "Ana Silva",
    bill_to_contact_email: null,
    lines: [
      {
        id: 1,
        invoice_id: 4,
        product_id: 1,
        description: "Website redesign",
        quantity: 1,
        unit_price_cents: 100_000,
        position: 0,
      },
    ],
    payments: [
      {
        id: 9,
        invoice_id: 4,
        paid_on: "2026-11-05",
        amount_cents: 40_000,
        method: "bank_transfer",
        reference: "TRF-9",
        created_by: "priya@brightloop.example",
      },
    ],
    ...overrides,
  };
}

/**
 * The page at `entry`, with the invoice as it first arrives and, for a test
 * that changes it, what the next fetch answers.
 */
function renderPage(
  entry: string,
  invoice: InvoiceDetail = invoiceWith(),
  refetched?: InvoiceDetail,
) {
  vi.mocked(invoicesApi.get).mockResolvedValue(refetched ?? invoice);
  vi.mocked(invoicesApi.get).mockResolvedValueOnce(invoice);
  vi.mocked(api.settings.get).mockResolvedValue(settings);
  vi.mocked(api.products.list).mockResolvedValue([]);
  vi.mocked(logoDataUrl).mockResolvedValue(null);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/money/invoices/:id" element={<InvoicePage />} />
          <Route path="/money/invoices" element={<p>Invoice list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function summary(): string {
  return screen.getByText(/Still owed/).parentElement?.textContent ?? "";
}

function names(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole("button")
    .map((button) => button.textContent ?? "");
}

/** The action row's button names, or a failure when it is not there. */
function actionNames(): string[] {
  const bar = document.querySelector(".invoice-actions");
  if (!bar) {
    throw new Error("The invoice's actions are missing.");
  }
  return names(bar as HTMLElement);
}

afterEach(cleanup);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("the invoice page", () => {
  it("shows the document, the bar and the payments with who entered them", async () => {
    renderPage("/money/invoices/4");

    expect(
      await screen.findByRole("heading", { name: "INV-0007" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Invoice document")).toBeTruthy();

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("40000");
    expect(bar.getAttribute("aria-valuemax")).toBe("108875");
    expect(summary()).toContain("Paid $400.00 of $1,088.75");
    expect(summary()).toContain("Still owed $688.75");

    const payments = screen
      .getByRole("heading", { name: "Payments 1" })
      .closest("section") as HTMLElement;
    const text = payments.textContent ?? "";
    expect(text).toContain("Bank transfer");
    expect(text).toContain("TRF-9");
    expect(text).toContain("priya@brightloop.example");
  });

  it("offers Record payment, Void and Download PDF on an issued invoice with nothing paid", async () => {
    renderPage(
      "/money/invoices/4",
      invoiceWith({ paid_cents: 0, balance_cents: 108_875, payments: [] }),
    );
    await screen.findByRole("heading", { name: "INV-0007" });

    const shown = actionNames();
    expect(shown).toContain("Record payment");
    expect(shown).toContain("Void");
    expect(shown).toContain("Download PDF");
    expect(shown).not.toContain("Edit");
    expect(shown).not.toContain("Delete");
  });

  it("offers Edit and Delete on a draft, and nothing else", async () => {
    renderPage(
      "/money/invoices/4",
      invoiceWith({
        number: null,
        status: "draft",
        issue_date: null,
        due_date: null,
        paid_cents: 0,
        balance_cents: null,
        payments: [],
      }),
    );
    await screen.findByRole("heading", { name: "Draft invoice" });

    const shown = actionNames();
    expect(shown.sort()).toEqual(["Delete", "Edit"]);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("No payments yet.")).toBeTruthy();
  });

  it("keeps Void and Record payment off an invoice with payments", async () => {
    renderPage(
      "/money/invoices/4",
      invoiceWith({ paid_cents: 108_875, balance_cents: 0, status: "paid" }),
    );
    await screen.findByRole("heading", { name: "INV-0007" });

    const shown = actionNames();
    expect(shown).toEqual(["Download PDF"]);
  });

  it("downloads the PDF of an issued invoice", async () => {
    vi.mocked(downloadPdf).mockResolvedValue(undefined);
    renderPage("/money/invoices/4");
    await screen.findByRole("heading", { name: "INV-0007" });

    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    expect(downloadPdf).toHaveBeenCalledWith(invoiceWith());
  });

  it("records a payment and moves the balance at once", async () => {
    vi.mocked(invoicesApi.recordPayment).mockResolvedValue(
      invoiceWith({
        paid_cents: 68_875,
        balance_cents: 40_000,
        status: "part paid",
        payments: [],
      }),
    );
    renderPage(
      "/money/invoices/4",
      invoiceWith(),
      invoiceWith({
        paid_cents: 68_875,
        balance_cents: 40_000,
        status: "part paid",
        payments: [],
      }),
    );
    await screen.findByRole("heading", { name: "INV-0007" });

    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Record payment",
    });
    expect(
      (within(dialog).getByLabelText("Amount (USD)") as HTMLInputElement).value,
    ).toBe("$688.75");

    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));

    await waitFor(() =>
      expect(invoicesApi.recordPayment).toHaveBeenCalledWith(4, {
        paid_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        amount_cents: 68_875,
        method: "bank_transfer",
        reference: null,
      }),
    );
    expect(await screen.findByRole("progressbar")).toBeTruthy();
    expect(summary()).toContain("Still owed $400.00");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the server's message when a payment is refused", async () => {
    vi.mocked(invoicesApi.recordPayment).mockRejectedValue(
      new Error("The payment is more than what is owed."),
    );
    renderPage("/money/invoices/4");
    await screen.findByRole("heading", { name: "INV-0007" });

    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Record payment",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("The payment is more than what is owed.");
    expect(screen.getByRole("dialog", { name: "Record payment" })).toBeTruthy();
  });

  it("deletes a payment and the balance goes back up", async () => {
    vi.mocked(invoicesApi.deletePayment).mockResolvedValue(invoiceWith());
    renderPage(
      "/money/invoices/4",
      invoiceWith(),
      invoiceWith({
        paid_cents: 0,
        balance_cents: 108_875,
        status: "issued",
        payments: [],
      }),
    );
    await screen.findByRole("heading", { name: "INV-0007" });

    const payments = screen
      .getByRole("heading", { name: "Payments 1" })
      .closest("section") as HTMLElement;
    fireEvent.click(within(payments).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(invoicesApi.deletePayment).toHaveBeenCalledWith(4, 9),
    );
    expect(summary()).toContain("Still owed $1,088.75");
  });

  it("opens the editor from the route's query and saves back", async () => {
    vi.mocked(invoicesApi.update).mockResolvedValue(
      invoiceWith({ status: "draft", number: null }),
    );
    renderPage("/money/invoices/4?edit=1");

    const dialog = await screen.findByRole("dialog", { name: "Edit invoice" });
    expect(
      (within(dialog).getByLabelText("Description") as HTMLInputElement).value,
    ).toBe("Website redesign");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(invoicesApi.update).toHaveBeenCalledWith(4, [
        {
          product_id: 1,
          description: "Website redesign",
          quantity: 1,
          unit_price_cents: 100_000,
        },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the editor open with the message when the issue is refused", async () => {
    vi.mocked(invoicesApi.update).mockResolvedValue(
      invoiceWith({ status: "draft", number: null }),
    );
    vi.mocked(invoicesApi.issue).mockRejectedValue(
      new Error("Someone else has already issued this draft."),
    );
    renderPage(
      "/money/invoices/4?edit=1",
      invoiceWith({ number: null, status: "draft", payments: [] }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Edit invoice",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save and issue" }),
    );

    await waitFor(() => expect(invoicesApi.issue).toHaveBeenCalled());
    // The refusal reaches the person: the message is on the page, and the
    // editor has not closed as though the invoice were issued.
    await waitFor(() =>
      expect(screen.queryByRole("alert")?.textContent).toBe(
        "Someone else has already issued this draft.",
      ),
    );
    expect(screen.getByRole("dialog", { name: "Edit invoice" })).toBeTruthy();
  });

  it("deletes a draft and goes back to the list", async () => {
    vi.mocked(invoicesApi.remove).mockResolvedValue({ lines: [], counts: {} });
    renderPage(
      "/money/invoices/4",
      invoiceWith({ number: null, status: "draft", payments: [] }),
    );
    await screen.findByRole("heading", { name: "Draft invoice" });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Invoice list")).toBeTruthy();
    expect(invoicesApi.remove).toHaveBeenCalledWith(4);
  });
});
