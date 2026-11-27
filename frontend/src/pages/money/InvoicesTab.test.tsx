import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Invoice, InvoiceDetail } from "../../api/client";
import { downloadPdf, invoicesApi } from "../../api/invoices";
import InvoicesTab from "./InvoicesTab";

vi.mock("../../api/invoices", () => ({
  invoicesApi: {
    list: vi.fn(),
    remove: vi.fn(),
    void: vi.fn(),
  },
  downloadPdf: vi.fn(),
}));

function invoiceWith(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: 1,
    number: "INV-0001",
    deal_id: 1,
    organization_id: 7,
    deal_name: "Store rollout",
    organization_name: "Northwind Traders",
    status: "issued",
    issue_date: "2026-11-20",
    due_date: "2026-12-20",
    subtotal_cents: 100_000,
    tax_label: "Sales tax",
    tax_rate_thousandths: 8875,
    tax_cents: 8_875,
    total_cents: 108_875,
    paid_cents: 0,
    balance_cents: 108_875,
    bill_to_name: "Northwind Traders",
    bill_to_address: null,
    bill_to_contact_name: "Ana Silva",
    bill_to_contact_email: null,
    lines: [],
    payments: [],
    ...overrides,
  };
}

const issued = invoiceWith();
const draft = invoiceWith({
  id: 2,
  number: null,
  issue_date: null,
  due_date: null,
  status: "draft",
  balance_cents: null,
  deal_name: "Support retainer",
});
const voided = invoiceWith({
  id: 3,
  number: "INV-0002",
  status: "void",
  balance_cents: null,
  organization_name: "Contoso",
  deal_name: "Website rebuild",
});

const ALL = [issued, draft, voided];

function renderTab(rows: Invoice[] = ALL) {
  vi.mocked(invoicesApi.list).mockResolvedValue(rows);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/money/invoices"]}>
        <InvoicesTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rowFor(dealName: string): HTMLElement {
  const row = screen
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryByText(dealName) !== null);
  if (!row) {
    throw new Error(`No row for ${dealName}`);
  }
  return row;
}

function buttonNames(row: HTMLElement): string[] {
  return within(row)
    .getAllByRole("button")
    .map((button) => button.textContent ?? "");
}

afterEach(cleanup);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("the Invoices tab", () => {
  it("shows every column the list needs", async () => {
    renderTab();
    await screen.findByText("INV-0001");

    expect(
      screen
        .getAllByRole("columnheader")
        .map((header) =>
          (header.textContent ?? "").replace(/[\u2191\u2193\u2195]/g, ""),
        )
        .filter((label) => label !== ""),
    ).toEqual([
      "Number",
      "Organization",
      "Deal",
      "Issued",
      "Due",
      "Total",
      "Balance",
      "Status",
    ]);
    expect(rowFor("Store rollout").textContent).toContain("Northwind Traders");
    expect(rowFor("Store rollout").textContent).toContain("$1,088.75");
  });

  it("shows no number and no balance for a draft, and no balance for a void one", async () => {
    renderTab();
    await screen.findByText("Support retainer");

    const draftRow = rowFor("Support retainer");
    expect(within(draftRow).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(draftRow).getByText("Draft")).toBeTruthy();

    const voidRow = rowFor("Contoso");
    expect(within(voidRow).getByText("INV-0002")).toBeTruthy();
    expect(within(voidRow).getByText("Void")).toBeTruthy();
    expect(within(voidRow).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("has no Add anywhere", async () => {
    renderTab();
    await screen.findByText("INV-0001");

    expect(screen.queryByRole("button", { name: /Add/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /New invoice/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Create invoice/ })).toBeNull();
  });

  it("searches over number, organization and deal", async () => {
    renderTab();
    await screen.findByText("INV-0001");
    const search = screen.getByLabelText("Search invoices");

    fireEvent.change(search, { target: { value: "contoso" } });
    expect(rowFor("Contoso")).toBeTruthy();
    expect(screen.queryByText("Store rollout")).toBeNull();

    fireEvent.change(search, { target: { value: "INV-0001" } });
    expect(screen.queryByText("Contoso")).toBeNull();
    expect(screen.getByText("Store rollout")).toBeTruthy();
  });

  it("filters by status", async () => {
    renderTab();
    await screen.findByText("INV-0001");

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "draft" },
    });
    expect(screen.getByText("Support retainer")).toBeTruthy();
    expect(screen.queryByText("Store rollout")).toBeNull();

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "void" },
    });
    expect(screen.queryByText("Support retainer")).toBeNull();
    expect(screen.getByText("Contoso")).toBeTruthy();
  });

  it("offers Edit and Delete on a draft, and nothing that changes it otherwise", async () => {
    renderTab();
    await screen.findByText("Support retainer");

    expect(buttonNames(rowFor("Support retainer")).sort()).toEqual([
      "Delete",
      "Edit",
      "View",
    ]);
  });

  it("offers Void and Download PDF on an issued invoice, and no edit", async () => {
    renderTab();
    await screen.findByText("INV-0001");

    const names = buttonNames(rowFor("Store rollout")).sort();
    expect(names).toContain("Void");
    expect(names).toContain("Download PDF");
    expect(names).not.toContain("Edit");
    expect(names).not.toContain("Delete");
  });

  it("keeps Void off a void invoice and offers its PDF", async () => {
    renderTab();
    await screen.findByText("INV-0002");

    const names = buttonNames(rowFor("Contoso")).sort();
    expect(names).toEqual(["Download PDF", "View"]);
  });

  it("deletes a draft after confirming", async () => {
    vi.mocked(invoicesApi.remove).mockResolvedValue({ lines: [], counts: {} });
    renderTab();
    await screen.findByText("Support retainer");

    fireEvent.click(
      within(rowFor("Support retainer")).getByRole("button", {
        name: "Delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(vi.mocked(invoicesApi.remove)).toHaveBeenCalledWith(2);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("voids an issued invoice after confirming", async () => {
    vi.mocked(invoicesApi.void).mockResolvedValue({
      ...issued,
      status: "void",
    });
    renderTab();
    await screen.findByText("INV-0001");

    fireEvent.click(
      within(rowFor("Store rollout")).getByRole("button", { name: "Void" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/number stays/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Void" }));

    expect(vi.mocked(invoicesApi.void)).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("downloads the PDF of an issued invoice", async () => {
    vi.mocked(downloadPdf).mockResolvedValue(undefined);
    renderTab();
    await screen.findByText("INV-0001");

    fireEvent.click(
      within(rowFor("Store rollout")).getByRole("button", {
        name: "Download PDF",
      }),
    );

    expect(downloadPdf).toHaveBeenCalledWith(issued);
  });

  it("shows a refusal from the server on the confirmation", async () => {
    vi.mocked(invoicesApi.void).mockRejectedValue(
      new Error("Delete its payments first."),
    );
    renderTab();
    await screen.findByText("INV-0001");

    fireEvent.click(
      within(rowFor("Store rollout")).getByRole("button", { name: "Void" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Void" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("Delete its payments first.");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});
