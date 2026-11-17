import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  type Activity,
  type Contact,
  type DashboardPayload,
  type Deal,
} from "../api/client";
import Dashboard from "./Dashboard";

vi.mock("../api/client", () => ({
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

const contacts: Contact[] = [
  {
    id: 1,
    name: "Ana Silva",
    email: null,
    phone: null,
    job_title: null,
    organization_id: null,
    status: "customer",
  },
  {
    id: 2,
    name: "Ben Carter",
    email: null,
    phone: null,
    job_title: null,
    organization_id: null,
    status: "lead",
  },
];

const deals: Deal[] = [
  {
    id: 10,
    name: "Store rollout",
    organization_id: 7,
    contact_id: null,
    stage: "New",
    value_cents: 100_000,
    probability: 10,
    close_date: null,
    position: 0,
  },
  {
    id: 11,
    name: "Warehouse upgrade",
    organization_id: 7,
    contact_id: null,
    stage: "Proposal",
    value_cents: 200_000,
    probability: 50,
    close_date: null,
    position: 1,
  },
];

const overdueFollowUp: Activity = {
  id: 201,
  type: "call",
  contact_id: 2,
  deal_id: null,
  description: "Call Ben back",
  happened_at: "2000-01-01T09:00:00",
  follow_up_date: "2020-06-01",
  done: false,
};

const upcomingFollowUp: Activity = {
  id: 202,
  type: "note",
  contact_id: null,
  deal_id: 11,
  description: "Send proposal",
  happened_at: "2000-01-02T09:00:00",
  follow_up_date: "2030-01-01",
  done: false,
};

const undatedFollowUp: Activity = {
  id: 203,
  type: "email",
  contact_id: null,
  deal_id: null,
  description: "Check in",
  happened_at: "2000-01-03T09:00:00",
  follow_up_date: null,
  done: false,
};

const recentActivity: Activity[] = [
  {
    id: 101,
    type: "call",
    contact_id: 1,
    deal_id: null,
    description: "Called Ana about pricing",
    happened_at: "2000-01-01T09:30:00",
    follow_up_date: null,
    done: false,
  },
  {
    id: 102,
    type: "note",
    contact_id: null,
    deal_id: 10,
    description: "Store rollout notes",
    happened_at: "2000-01-02T09:30:00",
    follow_up_date: null,
    done: false,
  },
  {
    id: 103,
    type: "email",
    contact_id: null,
    deal_id: null,
    description: "Newsletter sent",
    happened_at: "2000-01-03T09:30:00",
    follow_up_date: null,
    done: false,
  },
];

const twelveMonths = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12",
];

const payload: DashboardPayload = {
  won: {
    months: twelveMonths.map((month, index) => ({
      month,
      revenue_cents: index * 100_000,
      deals: index % 2,
    })),
    total_revenue_cents: 6_600_000,
    total_deals: 6,
  },
  pipeline: { value_cents: 3_500_000, expected_cents: 1_750_000, count: 7 },
  funnel: {
    stages: [
      { stage: "New", count: 2, value_cents: 100_000, expected_cents: 10_000 },
      {
        stage: "Qualified",
        count: 1,
        value_cents: 200_000,
        expected_cents: 50_000,
      },
      { stage: "Proposal", count: 0, value_cents: 0, expected_cents: 0 },
      {
        stage: "Negotiation",
        count: 1,
        value_cents: 50_000,
        expected_cents: 37_500,
      },
    ],
    won_12m_cents: 5_000_000,
    won_12m_count: 6,
    lost_cents: 500_000,
    lost_count: 1,
  },
  recent_activity: recentActivity,
  follow_ups: {
    overdue: [overdueFollowUp],
    upcoming: [upcomingFollowUp, undatedFollowUp],
    overdue_count: 1,
    open_count: 3,
  },
};

const emptyPayload: DashboardPayload = {
  won: { months: [], total_revenue_cents: 0, total_deals: 0 },
  pipeline: { value_cents: 0, expected_cents: 0, count: 0 },
  funnel: {
    stages: [
      { stage: "New", count: 0, value_cents: 0, expected_cents: 0 },
      { stage: "Qualified", count: 0, value_cents: 0, expected_cents: 0 },
      { stage: "Proposal", count: 0, value_cents: 0, expected_cents: 0 },
      { stage: "Negotiation", count: 0, value_cents: 0, expected_cents: 0 },
    ],
    won_12m_cents: 0,
    won_12m_count: 0,
    lost_cents: 0,
    lost_count: 0,
  },
  recent_activity: [],
  follow_ups: {
    overdue: [],
    upcoming: [],
    overdue_count: 0,
    open_count: 0,
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.dashboard.get).mockResolvedValue(payload);
  vi.mocked(api.contacts.list).mockResolvedValue(contacts);
  vi.mocked(api.deals.list).mockResolvedValue(deals);
});

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

function kpiSection(label: string): HTMLElement {
  const section = screen.getByText(label).closest("section");
  if (!section) {
    throw new Error(`No KPI section found for ${label}`);
  }
  return section as HTMLElement;
}

function panelSection(heading: string): HTMLElement {
  const section = screen
    .getByRole("heading", { name: heading })
    .closest("section");
  if (!section) {
    throw new Error(`No panel found for ${heading}`);
  }
  return section as HTMLElement;
}

describe("Dashboard page", () => {
  it("shows a loading message while the payload is pending", () => {
    vi.mocked(api.dashboard.get).mockImplementation(
      () => new Promise(() => {}),
    );
    renderDashboard();

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("reports an error when the payload fails to load", async () => {
    vi.mocked(api.dashboard.get).mockRejectedValue(new Error("boom"));
    renderDashboard();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not load the dashboard.");
    expect(screen.queryByText("Open pipeline")).toBeNull();
  });

  it("summarizes the numbers in KPI cards and the date range", async () => {
    renderDashboard();

    expect(
      await screen.findByText("Sales at a glance · Jan 2026 – Dec 2026"),
    ).toBeTruthy();
    const revenueKpi = kpiSection("Revenue won, last 12 months");
    const pipelineKpi = kpiSection("Open pipeline");
    const expectedKpi = kpiSection("Expected revenue");
    const overdueKpi = kpiSection("Overdue follow-ups");
    expect(within(revenueKpi).getByText("$66,000")).toBeTruthy();
    expect(within(revenueKpi).getByText("6 deals won")).toBeTruthy();
    expect(within(pipelineKpi).getByText("$35,000")).toBeTruthy();
    expect(within(pipelineKpi).getByText("7 open deals")).toBeTruthy();
    expect(within(expectedKpi).getByText("$17,500")).toBeTruthy();
    expect(within(overdueKpi).getByText("1")).toBeTruthy();
    expect(within(overdueKpi).getByText("of 3 open follow-ups")).toBeTruthy();
  });

  it("draws the revenue chart, funnel and chips", async () => {
    renderDashboard();

    expect(
      await screen.findByRole("heading", { name: "Revenue won per month" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Deals won per month" }),
    ).toBeTruthy();

    const funnel = panelSection("Sales funnel");
    expect(within(funnel).getByText("New")).toBeTruthy();
    expect(within(funnel).getByText("2 deals")).toBeTruthy();
    // One deal in a stage is labelled in the singular.
    expect(within(funnel).getAllByText("1 deal")).toHaveLength(2);
    expect(within(funnel).getByText("Won, 12 months")).toBeTruthy();
    expect(within(funnel).getByText("$50,000")).toBeTruthy();
    expect(within(funnel).getByText("Lost")).toBeTruthy();
    expect(within(funnel).getByText("$5,000")).toBeTruthy();
  });

  it("lists recent activity with the record behind each entry", async () => {
    renderDashboard();

    expect(await screen.findByText("Called Ana about pricing")).toBeTruthy();
    const recent = panelSection("Recent activity");
    expect(within(recent).getByText("Ana Silva")).toBeTruthy();
    expect(within(recent).getByText("Store rollout notes")).toBeTruthy();
    expect(within(recent).getByText("Store rollout")).toBeTruthy();
    expect(within(recent).getByText("Newsletter sent")).toBeTruthy();
    expect(within(recent).getByText("Jan 1")).toBeTruthy();
  });

  it("groups open follow-ups as overdue and upcoming", async () => {
    renderDashboard();

    expect(await screen.findByText("Call Ben back")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Overdue" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Upcoming" })).toBeTruthy();

    const overdueRow = screen.getByText("Call Ben back").closest("li");
    expect(overdueRow).toBeTruthy();
    expect(
      within(overdueRow as HTMLElement).getByText("Ben Carter"),
    ).toBeTruthy();
    expect(
      within(overdueRow as HTMLElement).getByText(/^\d+ days late$/),
    ).toBeTruthy();

    const upcomingRow = screen.getByText("Send proposal").closest("li");
    expect(upcomingRow).toBeTruthy();
    expect(
      within(upcomingRow as HTMLElement).getByText("Warehouse upgrade"),
    ).toBeTruthy();
    expect(
      within(upcomingRow as HTMLElement).getByText("Jan 1, 2030"),
    ).toBeTruthy();

    const undatedRow = screen.getByText("Check in").closest("li");
    expect(undatedRow).toBeTruthy();
    expect(within(undatedRow as HTMLElement).queryByText(/late$/)).toBeNull();
  });

  it("marks a follow-up done from its checkbox", async () => {
    renderDashboard();
    const button = await screen.findByRole("button", {
      name: "Mark done: Call Ben back",
    });

    fireEvent.click(button);

    await waitFor(() =>
      expect(api.activities.update).toHaveBeenCalledWith(201, {
        type: "call",
        contact_id: 2,
        deal_id: null,
        description: "Call Ben back",
        happened_at: "2000-01-01T09:00:00",
        follow_up_date: "2020-06-01",
        done: true,
      }),
    );
  });

  it("stays on the page when marking done fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(api.activities.update).mockRejectedValue(
      new Error("Save failed."),
    );
    renderDashboard();
    const button = await screen.findByRole("button", {
      name: "Mark done: Call Ben back",
    });

    fireEvent.click(button);

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(api.activities.update).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Call Ben back")).toBeTruthy();
  });

  it("renders zeroed KPIs and no open follow-ups", async () => {
    vi.mocked(api.dashboard.get).mockResolvedValue(emptyPayload);
    renderDashboard();

    expect(await screen.findByText("Revenue won per month")).toBeTruthy();
    expect(screen.queryByText(/Sales at a glance/)).toBeNull();
    const revenueKpi = kpiSection("Revenue won, last 12 months");
    const pipelineKpi = kpiSection("Open pipeline");
    const overdueKpi = kpiSection("Overdue follow-ups");
    expect(within(revenueKpi).getByText("$0")).toBeTruthy();
    expect(within(revenueKpi).getByText("0 deals won")).toBeTruthy();
    expect(within(pipelineKpi).getByText("0 open deals")).toBeTruthy();
    expect(within(overdueKpi).getByText("0")).toBeTruthy();
    expect(within(overdueKpi).getByText("of 0 open follow-ups")).toBeTruthy();

    const funnel = panelSection("Sales funnel");
    expect(within(funnel).getAllByText("0 deals")).toHaveLength(4);
    expect(within(funnel).getByText("Won, 12 months")).toBeTruthy();
    expect(within(funnel).getByText("Lost")).toBeTruthy();

    expect(screen.getByText("Nothing open.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Overdue" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Upcoming" })).toBeNull();
    expect(screen.queryByText("Called Ana about pricing")).toBeNull();
  });

  it("shows only the upcoming group when nothing is overdue", async () => {
    vi.mocked(api.dashboard.get).mockResolvedValue({
      ...payload,
      follow_ups: {
        ...payload.follow_ups,
        overdue: [],
        overdue_count: 0,
      },
    });
    renderDashboard();

    expect(
      await screen.findByRole("heading", { name: "Upcoming" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Overdue" })).toBeNull();
  });

  it("shows only the overdue group when nothing is upcoming", async () => {
    vi.mocked(api.dashboard.get).mockResolvedValue({
      ...payload,
      follow_ups: {
        ...payload.follow_ups,
        upcoming: [],
      },
    });
    renderDashboard();

    expect(
      await screen.findByRole("heading", { name: "Overdue" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Upcoming" })).toBeNull();
  });
});
