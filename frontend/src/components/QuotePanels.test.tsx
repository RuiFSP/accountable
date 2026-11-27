import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  type CompanySettings,
  type Deal,
  type Organization,
  type Product,
} from "../api/client";
import type { Quote, QuoteInput } from "../api/quotes";
import { DealQuotesPanel, OrganizationQuotesPanel } from "./QuotePanels";

vi.mock("../api/client", () => ({
  api: {
    organizations: { list: vi.fn() },
    contacts: { list: vi.fn() },
    products: { list: vi.fn() },
    settings: { get: vi.fn() },
    quotes: {
      list: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      send: vi.fn(),
      copy: vi.fn(),
      accept: vi.fn(),
      decline: vi.fn(),
      pdf: vi.fn(),
    },
  },
}));

const openDeal: Deal = {
  id: 5,
  name: "Store rollout",
  organization_id: 7,
  contact_id: 1,
  stage: "Proposal",
  value_cents: 100_000,
  probability: 50,
  close_date: "2027-03-01",
  position: 0,
};

const wonDeal: Deal = { ...openDeal, id: 6, stage: "Won", probability: 100 };

const organization: Organization = {
  id: 7,
  name: "Northwind Traders",
  website: null,
  industry: null,
  notes: null,
};

const products: Product[] = [
  {
    id: 1,
    name: "Data migration",
    description: "Move records.",
    price_cents: 180_000,
    active: true,
  },
];

const settings: CompanySettings = {
  id: 1,
  name: "Brightloop",
  address: "1 Brightloop Plaza",
  email: "hello@brightloop.example",
  phone: "+1 555 0100",
  tax_label: "Sales tax",
  tax_rate_thousandths: 8875,
  payment_terms_days: 30,
  quote_prefix: "QT-",
  invoice_prefix: "INV-",
  updated_by: null,
  updated_at: "2026-11-22T09:30:00+00:00",
};

const quotes: Quote[] = [
  {
    id: 9,
    number: "QT-0001",
    deal_id: 5,
    deal_name: "Store rollout",
    organization_id: 7,
    organization_name: "Northwind Traders",
    status: "sent",
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
    deal_name: "Other deal",
    organization_id: 7,
    organization_name: "Northwind Traders",
    status: "expired",
    created_at: "2026-10-01",
    valid_until: "2026-10-31",
    tax_label: "Sales tax",
    tax_rate_thousandths: 8875,
    subtotal_cents: 50_000,
    tax_cents: 4_438,
    total_cents: 54_438,
    created_by: "alex@brightloop.example",
    updated_by: "alex@brightloop.example",
  },
];

afterEach(cleanup);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.organizations.list).mockResolvedValue([organization]);
  vi.mocked(api.contacts.list).mockResolvedValue([
    {
      id: 1,
      name: "Ana Silva",
      email: null,
      phone: null,
      job_title: null,
      organization_id: 7,
      status: "customer",
    },
  ]);
  vi.mocked(api.products.list).mockResolvedValue(products);
  vi.mocked(api.settings.get).mockResolvedValue(settings);
  vi.mocked(api.quotes.list).mockResolvedValue({ quotes });
});

function renderPanel(
  panel: typeof DealQuotesPanel | typeof OrganizationQuotesPanel,
  record: Deal | Organization,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { Panel } = panel as unknown as {
    Panel: ComponentType<{ record: unknown }>;
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Panel record={record} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the deal's quotes panel", () => {
  it("lists the quotes with their state, date and total", async () => {
    renderPanel(DealQuotesPanel, openDeal);

    const rows = await screen.findAllByRole("row");
    const cells = within(rows[1])
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells).toEqual(["QT-0001", "Sent", "Dec 26, 2026", "$1,088.75"]);
  });

  it("opens each quote and offers New quote only on an open deal", async () => {
    renderPanel(DealQuotesPanel, openDeal);

    const link = await screen.findByRole("link", { name: "QT-0001" });
    expect(link.getAttribute("href")).toBe("/money/quotes/9");
    expect(screen.getByRole("button", { name: "New quote" })).toBeTruthy();

    cleanup();
    renderPanel(DealQuotesPanel, wonDeal);
    await screen.findByRole("link", { name: "QT-0001" });
    expect(screen.queryByRole("button", { name: "New quote" })).toBeNull();
  });

  it("says so when there are no quotes", async () => {
    vi.mocked(api.quotes.list).mockResolvedValue({ quotes: [] });
    renderPanel(DealQuotesPanel, openDeal);

    expect(await screen.findByText("No quotes yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("creates a quote from the New quote dialog", async () => {
    vi.mocked(api.quotes.create).mockResolvedValue({
      ...quotes[0],
      id: 11,
      number: "QT-0003",
      lines: [],
      company: {
        name: settings.name,
        address: settings.address,
        email: settings.email,
        phone: settings.phone,
      },
      contact_name: "Ana Silva",
    });
    renderPanel(DealQuotesPanel, openDeal);
    await screen.findByRole("link", { name: "QT-0001" });

    fireEvent.click(screen.getByRole("button", { name: "New quote" }));
    const dialog = await screen.findByRole("dialog", { name: "New quote" });
    const select = within(dialog).getByLabelText("Product");
    fireEvent.change(select, { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(api.quotes.create).toHaveBeenCalledWith({
        deal_id: 5,
        valid_until: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        lines: [
          {
            product_id: 1,
            description: "Move records.",
            quantity: 1,
            unit_price_cents: 180_000,
          },
        ],
      } as QuoteInput),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("the organization's quotes panel", () => {
  it("lists the quotes with the deal each belongs to", async () => {
    vi.mocked(api.quotes.list).mockResolvedValue({ quotes });
    renderPanel(OrganizationQuotesPanel, organization);

    const rows = await screen.findAllByRole("row");
    expect(
      within(rows[1])
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual([
      "QT-0001",
      "Store rollout",
      "Sent",
      "Dec 26, 2026",
      "$1,088.75",
    ]);
    expect(
      within(rows[2])
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["QT-0002", "Other deal", "Expired", "Oct 31, 2026", "$544.38"]);

    for (const quote of quotes) {
      const link = screen.getByRole("link", { name: quote.number });
      expect(link.getAttribute("href")).toBe(`/money/quotes/${quote.id}`);
    }
  });
});
