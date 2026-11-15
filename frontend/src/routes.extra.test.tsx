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
    dashboard: { get: vi.fn() },
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
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
