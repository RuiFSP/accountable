import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type Bill, type Organization } from "../../api/client";
import OrganizationBills from "./OrganizationBills";

vi.mock("../../api/client", () => ({
  api: {
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

const record: Organization = {
  id: 7,
  name: "Vantage Software",
  website: null,
  industry: null,
  notes: null,
  billing_address: null,
  created_by: null,
  updated_by: null,
};

const bills: Bill[] = [
  {
    id: 1,
    organization_id: 7,
    organization_name: "Vantage Software",
    bill_number: "VS-2026-01",
    bill_date: "2026-01-05",
    due_date: "2026-02-04",
    category: "Software",
    amount_cents: 24_900,
    tax_cents: 1_992,
    total_cents: 26_892,
    notes: null,
    paid_date: "2026-01-08",
    status: "paid",
    created_by: null,
    updated_by: null,
  },
  {
    id: 2,
    organization_id: 7,
    organization_name: "Vantage Software",
    bill_number: "VS-2026-06",
    bill_date: "2026-06-01",
    due_date: "2026-07-01",
    category: "Software",
    amount_cents: 32_000,
    tax_cents: 2_560,
    total_cents: 34_560,
    notes: null,
    paid_date: null,
    status: "unpaid",
    created_by: null,
    updated_by: null,
  },
];

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationBills record={record} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.bills.list).mockResolvedValue(bills);
});

describe("OrganizationBills panel", () => {
  it("lists the record's bills with number, due date, total and status", async () => {
    renderPanel();

    expect(await screen.findByText("VS-2026-01")).toBeTruthy();
    const panel = screen
      .getByRole("heading", { name: /Bills/ })
      .closest("section") as HTMLElement;
    expect(within(panel).getByText("2")).toBeTruthy();

    const first = screen.getByText("VS-2026-01").closest("li") as HTMLElement;
    expect(within(first).getByText("Feb 4, 2026")).toBeTruthy();
    expect(within(first).getByText("$268.92")).toBeTruthy();
    expect(within(first).getByText("Paid")).toBeTruthy();

    const second = screen.getByText("VS-2026-06").closest("li") as HTMLElement;
    expect(within(second).getByText("Jul 1, 2026")).toBeTruthy();
    expect(within(second).getByText("$345.60")).toBeTruthy();
    expect(within(second).getByText("Unpaid")).toBeTruthy();
  });

  it("offers no actions", async () => {
    renderPanel();

    expect(await screen.findByText("VS-2026-01")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("asks for that organization's bills only", async () => {
    renderPanel();

    await screen.findByText("VS-2026-01");
    expect(api.bills.list).toHaveBeenCalledWith(undefined, undefined, 7);
  });

  it("shows the empty state when the supplier has none", async () => {
    vi.mocked(api.bills.list).mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByText("No bills yet.")).toBeTruthy();
  });
});
