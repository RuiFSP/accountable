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
    money: {
      owed_cents: 0,
      overdue_cents: 0,
      aging: [
        { bucket: "not yet due", cents: 0 },
        { bucket: "1 to 30", cents: 0 },
        { bucket: "31 to 60", cents: 0 },
        { bucket: "61 to 90", cents: 0 },
        { bucket: "over 90", cents: 0 },
      ],
      payments: [],
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
    invoice_design: "classic",
    accent_color: "#073B4C",
    logo_content_type: null,
    updated_by: null,
    updated_at: "2026-11-22T09:30:00+00:00",
  });
  vi.mocked(api.products.list).mockResolvedValue([]);
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
