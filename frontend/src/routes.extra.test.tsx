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

import { api } from "./api/client";
import type { Quote } from "./api/quotes";
import { signInLocal } from "./lib/session";
import { AppRoutes } from "./routes";

vi.mock("./api/client", () => ({
  api: {
    organizations: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    contacts: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    deals: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      move: vi.fn(),
      remove: vi.fn(),
    },
    activities: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    products: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      restore: vi.fn(),
    },
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
    dashboard: { get: vi.fn() },
    settings: {
      get: vi.fn(),
      save: vi.fn(),
    },
  },
}));

/** Sign in the way the screen does, then leave fetch alone for the pages. */
async function signInForTests(): Promise<void> {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: "local-token",
        email: "alex@brightloop.example",
      }),
    }),
  );
  await signInLocal("alex");
  vi.unstubAllGlobals();
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  vi.resetAllMocks();
  vi.mocked(api.dashboard.get).mockResolvedValue({
    won: { months: [], total_revenue_cents: 0, total_deals: 0 },
    pipeline: { value_cents: 0, expected_cents: 0, count: 0 },
    funnel: {
      stages: [],
      won_12m_cents: 0,
      won_12m_count: 0,
      lost_cents: 0,
      lost_count: 0,
    },
    recent_activity: [],
    follow_ups: { overdue: [], upcoming: [], overdue_count: 0, open_count: 0 },
  });
  vi.mocked(api.deals.list).mockResolvedValue([]);
  vi.mocked(api.organizations.list).mockResolvedValue([]);
  vi.mocked(api.contacts.list).mockResolvedValue([]);
  vi.mocked(api.activities.list).mockResolvedValue([]);
  vi.mocked(api.settings.get).mockResolvedValue({
    id: 1,
    name: "Brightloop",
    address: null,
    email: null,
    phone: null,
    tax_label: null,
    tax_rate_thousandths: 0,
    payment_terms_days: 0,
    quote_prefix: null,
    invoice_prefix: null,
    updated_by: null,
    updated_at: "2026-11-22T09:30:00+00:00",
  });
  vi.mocked(api.products.list).mockResolvedValue([]);
  vi.mocked(api.quotes.list).mockResolvedValue({ quotes: [] });
  await signInForTests();
});

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("top bar action", () => {
  it("opens the add dialog from the New deal button", async () => {
    renderAt("/");

    fireEvent.click(screen.getByRole("button", { name: "New deal" }));

    expect(await screen.findByRole("heading", { name: "Deals" })).toBeTruthy();
    const dialog = await screen.findByRole("dialog", { name: "Add deal" });
    expect(within(dialog).getByLabelText("Name")).toBeTruthy();
  });

  it("closes the dialog again on cancel", async () => {
    renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "New deal" }));
    const dialog = await screen.findByRole("dialog", { name: "Add deal" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.deals.create).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Deals" })).toBeTruthy();
  });
});

describe("products route", () => {
  it("renders the Products heading with the top bar", async () => {
    renderAt("/products");

    expect(
      await screen.findByRole("heading", { name: "Products" }),
    ).toBeTruthy();
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Products" })).toBeTruthy();
  });
});

describe("the quotes area", () => {
  const quoteRow: Quote = {
    id: 9,
    number: "QT-0001",
    deal_id: 1,
    deal_name: "Store rollout",
    organization_id: 1,
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
  };

  it("renders the quote page at its address", async () => {
    vi.mocked(api.quotes.get).mockResolvedValue({
      ...quoteRow,
      company: {
        name: "Brightloop",
        address: null,
        email: null,
        phone: null,
      },
      contact_name: null,
      lines: [],
    });
    renderAt("/money/quotes/9");

    expect(
      await screen.findByRole("heading", { name: "QT-0001" }),
    ).toBeTruthy();
    expect(screen.getByRole("banner")).toBeTruthy();
  });

  it("shows the quotes panel on the deal and organization pages", async () => {
    vi.mocked(api.deals.list).mockResolvedValue([
      {
        id: 1,
        name: "Store rollout",
        organization_id: 1,
        contact_id: null,
        stage: "Proposal",
        value_cents: 100_000,
        probability: 50,
        close_date: "2027-03-01",
        position: 0,
      },
    ]);
    vi.mocked(api.organizations.list).mockResolvedValue([
      {
        id: 1,
        name: "Northwind Traders",
        website: null,
        industry: null,
        notes: null,
      },
    ]);
    vi.mocked(api.quotes.list).mockResolvedValue({ quotes: [quoteRow] });

    renderAt("/deals/1");
    expect(
      await screen.findByRole("heading", { name: "Store rollout" }),
    ).toBeTruthy();
    expect(await screen.findByRole("link", { name: "QT-0001" })).toBeTruthy();
    cleanup();

    renderAt("/organizations/1");
    expect(
      await screen.findByRole("heading", { name: "Northwind Traders" }),
    ).toBeTruthy();
    expect(await screen.findByRole("link", { name: "QT-0001" })).toBeTruthy();
  });
});
