import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../api/client";
import type { Quote, QuoteListReply } from "../../api/quotes";
import QuotesTab from "./QuotesTab";

vi.mock("../../api/client", () => ({
  api: {
    quotes: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      send: vi.fn(),
      copy: vi.fn(),
      accept: vi.fn(),
      decline: vi.fn(),
      pdf: vi.fn(),
    },
    products: { list: vi.fn() },
    settings: { get: vi.fn() },
  },
}));

const quotes: Quote[] = [
  {
    id: 9,
    number: "QT-0001",
    deal_id: 5,
    deal_name: "Store rollout",
    organization_id: 7,
    organization_name: "Northwind Traders",
    status: "draft",
    created_at: "2026-11-26",
    valid_until: "2026-12-26",
    tax_label: "Sales tax",
    tax_rate_thousandths: 8875,
    subtotal_cents: 100_000,
    tax_cents: 8_875,
    total_cents: 108_875,
    created_by: "alex@brightloop.example",
    updated_by: "alex@brightloop.example",
  },
  {
    id: 10,
    number: "QT-0002",
    deal_id: 8,
    deal_name: "Data warehouse",
    organization_id: 9,
    organization_name: "Fathom Analytics",
    status: "expired",
    created_at: "2026-10-01",
    valid_until: "2026-10-31",
    tax_label: "Sales tax",
    tax_rate_thousandths: 8875,
    subtotal_cents: 50_000,
    tax_cents: 4_438,
    total_cents: 54_438,
    created_by: "priya@brightloop.example",
    updated_by: "priya@brightloop.example",
  },
];

const reply: QuoteListReply = {
  quotes,
  totals: {
    draft: 108_875,
    sent: 200_000,
    expired: 54_438,
    accepted: 300_000,
    declined: 10_000,
  },
};

afterEach(cleanup);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.quotes.list).mockResolvedValue(reply);
});

function renderTab(path = "/money/quotes") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/money/quotes/*" element={<QuotesTab />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the Quotes tab", () => {
  it("shows the five totals including tax", async () => {
    const { container } = renderTab();
    await screen.findByRole("link", { name: "QT-0001" });

    const totals = within(container.querySelector(".kpi-grid") as HTMLElement);
    for (const label of ["Draft", "Sent", "Expired", "Accepted", "Declined"]) {
      expect(totals.getByText(label)).toBeTruthy();
    }
    for (const amount of [
      "$1,088.75",
      "$2,000.00",
      "$544.38",
      "$3,000.00",
      "$100.00",
    ]) {
      expect(totals.getByText(amount)).toBeTruthy();
    }
    expect(totals.getAllByText("Including tax")).toHaveLength(5);
  });

  it("lists every quote with the state it shows, expired among them", async () => {
    renderTab();

    const rows = await screen.findAllByRole("row");
    expect(rows).toHaveLength(3); // the heading row and one per quote
    const cells = rows.slice(1).map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    );
    expect(cells).toEqual([
      [
        "QT-0001",
        "Store rollout",
        "Northwind Traders",
        "Draft",
        "Dec 26, 2026",
        "$1,088.75",
      ],
      [
        "QT-0002",
        "Data warehouse",
        "Fathom Analytics",
        "Expired",
        "Oct 31, 2026",
        "$544.38",
      ],
    ]);
  });

  it("opens a quote from its row and offers no way to add one", async () => {
    renderTab();

    const link = await screen.findByRole("link", { name: "QT-0001" });
    expect(link.getAttribute("href")).toBe("/money/quotes/9");
    expect(screen.queryByRole("button", { name: "New quote" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });

  it("says so when there are no quotes", async () => {
    vi.mocked(api.quotes.list).mockResolvedValue({
      quotes: [],
      totals: reply.totals,
    });
    renderTab();

    expect(await screen.findByText("No quotes yet.")).toBeTruthy();
    await waitFor(() => expect(api.quotes.list).toHaveBeenCalledTimes(1));
  });
});
