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

import { api, type Bill, type Organization } from "../../api/client";
import { isoToday } from "../../lib/dates";
import BillsTab from "./BillsTab";

vi.mock("../../api/client", () => ({
  api: {
    organizations: { list: vi.fn() },
    bills: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      markPaid: vi.fn(),
      markUnpaid: vi.fn(),
    },
  },
}));

const organizations: Organization[] = [
  {
    id: 7,
    name: "Vantage Software",
    website: null,
    industry: null,
    notes: null,
    created_by: null,
    updated_by: null,
  },
  {
    id: 8,
    name: "Riverview Property",
    website: null,
    industry: null,
    notes: null,
    created_by: null,
    updated_by: null,
  },
];

const bills: Bill[] = [
  {
    id: 1,
    organization_id: 7,
    organization_name: "Vantage Software",
    bill_number: "VS-2026-01",
    bill_date: "2026-01-05",
    due_date: "2031-02-04",
    category: "Software",
    amount_cents: 24_900,
    tax_cents: 1_992,
    total_cents: 26_892,
    notes: "Monthly platform subscription.",
    paid_date: "2026-01-08",
    status: "paid",
    created_by: "alex@brightloop.example",
    updated_by: "alex@brightloop.example",
  },
  {
    id: 2,
    organization_id: 8,
    organization_name: "Riverview Property",
    bill_number: "RP-2026-06",
    bill_date: "2026-06-01",
    due_date: "2026-07-01",
    category: "Office",
    amount_cents: 85_000,
    tax_cents: 6_800,
    total_cents: 91_800,
    notes: "Office rent.",
    paid_date: null,
    status: "unpaid",
    created_by: "alex@brightloop.example",
    updated_by: "priya@brightloop.example",
  },
  {
    id: 3,
    organization_id: 7,
    organization_name: "Vantage Software",
    bill_number: "VS-2026-SUP",
    bill_date: "2026-03-01",
    due_date: "2026-03-31",
    category: "Other",
    amount_cents: 36_000,
    tax_cents: 2_880,
    total_cents: 38_880,
    notes: null,
    paid_date: null,
    status: "overdue",
    created_by: "priya@brightloop.example",
    updated_by: "priya@brightloop.example",
  },
];

function renderBills() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/money/bills"]}>
        <BillsTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rowFor(number: string): HTMLElement {
  const cell = screen.getByText(number);
  const row = cell.closest("tr");
  if (!row) {
    throw new Error(`No table row found for ${number}`);
  }
  return row as HTMLElement;
}

function visibleNumbers(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1]?.textContent ?? "");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.organizations.list).mockResolvedValue(organizations);
  vi.mocked(api.bills.list).mockResolvedValue(bills);
});

describe("Bills tab", () => {
  it("shows every column, the totals in the mono money style and each category's dot", async () => {
    renderBills();

    expect(await screen.findByText("VS-2026-01")).toBeTruthy();
    for (const header of [
      "Supplier",
      "Bill number",
      "Bill date",
      "Due date",
      "Category",
      "Total",
      "Status",
      "Paid",
    ]) {
      expect(screen.getByRole("button", { name: header }), header).toBeTruthy();
    }

    const subscription = rowFor("VS-2026-01");
    expect(within(subscription).getByText("Vantage Software")).toBeTruthy();
    expect(within(subscription).getByText("Jan 5, 2026")).toBeTruthy();
    expect(within(subscription).getByText("Feb 4, 2031")).toBeTruthy();
    expect(within(subscription).getByText("Software")).toBeTruthy();
    const total = within(subscription).getByText("$268.92");
    expect(total.classList.contains("num")).toBe(true);
    expect(subscription.querySelector(".category-dot")).toBeTruthy();

    const rent = rowFor("RP-2026-06");
    expect(rent.querySelector(".category-dot")).toBeTruthy();
    expect(within(rent).getByText("Office")).toBeTruthy();
  });

  it("badges the three statuses and dates the paid rows", async () => {
    renderBills();

    expect(await screen.findByText("VS-2026-01")).toBeTruthy();
    const paid = rowFor("VS-2026-01");
    expect(within(paid).getByText("Paid").className).toContain(
      "badge-positive",
    );
    expect(within(paid).getByText("Jan 8, 2026")).toBeTruthy();

    const unpaid = rowFor("RP-2026-06");
    expect(within(unpaid).getByText("Unpaid").className).toContain(
      "badge-info",
    );
    expect(within(unpaid).getByText("—")).toBeTruthy();

    const overdue = rowFor("VS-2026-SUP");
    expect(within(overdue).getByText("Overdue").className).toContain(
      "badge-negative",
    );
  });

  it("divides the rows into the Unpaid, Overdue and Paid views", async () => {
    renderBills();
    await screen.findByText("VS-2026-01");
    const statusFilter = screen.getByRole("combobox", { name: "Status" });

    fireEvent.change(statusFilter, { target: { value: "unpaid" } });
    expect(visibleNumbers()).toEqual(["RP-2026-06"]);

    fireEvent.change(statusFilter, { target: { value: "overdue" } });
    expect(visibleNumbers()).toEqual(["VS-2026-SUP"]);

    fireEvent.change(statusFilter, { target: { value: "paid" } });
    expect(visibleNumbers()).toEqual(["VS-2026-01"]);

    fireEvent.change(statusFilter, { target: { value: "" } });
    expect(visibleNumbers()).toHaveLength(3);
  });

  it("searches by supplier name and by bill number", async () => {
    renderBills();
    await screen.findByText("VS-2026-01");

    const search = screen.getByRole("searchbox", { name: "Search bills" });
    fireEvent.change(search, { target: { value: "riverview" } });
    expect(visibleNumbers()).toEqual(["RP-2026-06"]);

    fireEvent.change(search, { target: { value: "vs-2026" } });
    expect(visibleNumbers()).toEqual(["VS-2026-01", "VS-2026-SUP"]);
  });

  it("marks a bill paid, sends the day and shows what the server stored", async () => {
    // The stored day differs from the optimistic one on purpose: the row has
    // to settle on the server's date, not the one the click assumed.
    const saved: Bill = {
      ...bills[1],
      paid_date: "2026-06-15",
      status: "paid",
    };
    let stored = bills;
    vi.mocked(api.bills.list).mockImplementation(() => Promise.resolve(stored));
    vi.mocked(api.bills.markPaid).mockImplementation(() => {
      stored = bills.map((bill) => (bill.id === saved.id ? saved : bill));
      return Promise.resolve(saved);
    });
    renderBills();
    await screen.findByText("VS-2026-01");

    fireEvent.click(
      within(rowFor("RP-2026-06")).getByRole("button", { name: "Mark paid" }),
    );

    expect(api.bills.markPaid).toHaveBeenCalledWith(2, isoToday());
    await waitFor(() =>
      expect(within(rowFor("RP-2026-06")).getByText("Paid")).toBeTruthy(),
    );
    expect(within(rowFor("RP-2026-06")).queryByText("Mark paid")).toBeNull();
    await waitFor(() =>
      expect(
        within(rowFor("RP-2026-06")).getByText("Jun 15, 2026"),
      ).toBeTruthy(),
    );
  });

  it("marks a bill unpaid again and flips the row back", async () => {
    const saved: Bill = { ...bills[0], paid_date: null, status: "unpaid" };
    let stored = bills;
    vi.mocked(api.bills.list).mockImplementation(() => Promise.resolve(stored));
    vi.mocked(api.bills.markUnpaid).mockImplementation(() => {
      stored = bills.map((bill) => (bill.id === saved.id ? saved : bill));
      return Promise.resolve(saved);
    });
    renderBills();
    await screen.findByText("VS-2026-01");

    fireEvent.click(
      within(rowFor("VS-2026-01")).getByRole("button", { name: "Mark unpaid" }),
    );

    expect(api.bills.markUnpaid).toHaveBeenCalledWith(1);
    await waitFor(() =>
      expect(within(rowFor("VS-2026-01")).getByText("Unpaid")).toBeTruthy(),
    );
    expect(within(rowFor("VS-2026-01")).queryByText("Mark unpaid")).toBeNull();
    // The paid column clears with the server's stored date, not before it.
    await waitFor(() =>
      expect(within(rowFor("VS-2026-01")).getByText("—")).toBeTruthy(),
    );
  });

  it("opens the form to edit a bill", async () => {
    renderBills();
    await screen.findByText("VS-2026-01");

    fireEvent.click(
      within(rowFor("VS-2026-01")).getByRole("button", { name: "Edit" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Edit bill" });
    expect(
      (within(dialog).getByLabelText("Bill number") as HTMLInputElement).value,
    ).toBe("VS-2026-01");
  });

  it("asks first and deletes the row behind the confirm dialog", async () => {
    let deleted = false;
    vi.mocked(api.bills.list).mockImplementation(() =>
      Promise.resolve(deleted ? bills.filter((bill) => bill.id !== 1) : bills),
    );
    vi.mocked(api.bills.remove).mockImplementation(() => {
      deleted = true;
      return Promise.resolve({ counts: {} });
    });
    renderBills();
    await screen.findByText("VS-2026-01");

    fireEvent.click(
      within(rowFor("VS-2026-01")).getByRole("button", { name: "Delete" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete bill VS-2026-01?",
    });
    expect(within(dialog).getByText("This cannot be undone.")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.bills.remove).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText("VS-2026-01")).toBeNull());
  });

  it("leaves the row and shows a message when an action fails", async () => {
    vi.mocked(api.bills.markPaid).mockRejectedValue(
      new Error("Could not mark the bill paid."),
    );
    renderBills();
    await screen.findByText("VS-2026-01");

    fireEvent.click(
      within(rowFor("RP-2026-06")).getByRole("button", { name: "Mark paid" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not mark the bill paid.");
    expect(within(rowFor("RP-2026-06")).getByText("Unpaid")).toBeTruthy();
  });

  it("shows a loading message while the list is pending", () => {
    vi.mocked(api.bills.list).mockImplementation(() => new Promise(() => {}));
    renderBills();

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("reports an error when the list fails to load", async () => {
    vi.mocked(api.bills.list).mockRejectedValue(new Error("boom"));
    renderBills();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not load bills.");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the empty-state message when there are no bills", async () => {
    vi.mocked(api.bills.list).mockResolvedValue([]);
    renderBills();

    expect(await screen.findByText("No bills yet.")).toBeTruthy();
  });
});
