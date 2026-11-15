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
  type Activity,
  type Contact,
  type Deal as DealRecord,
  type Organization,
} from "../api/client";
import Deal from "./Deal";

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

const organizations: Organization[] = [
  {
    id: 7,
    name: "Northwind Traders",
    website: null,
    industry: null,
    notes: null,
  },
];

const contacts: Contact[] = [
  {
    id: 1,
    name: "Ana Silva",
    email: null,
    phone: null,
    job_title: null,
    organization_id: 7,
    status: "customer",
  },
];

const deal: DealRecord = {
  id: 1,
  name: "Store rollout",
  organization_id: 7,
  contact_id: 1,
  stage: "Proposal",
  value_cents: 100_000,
  probability: 50,
  close_date: "2027-01-15",
  position: 0,
};

const activities: Activity[] = [
  {
    id: 1,
    type: "call",
    contact_id: null,
    deal_id: 1,
    description: "Called about rollout",
    happened_at: "2026-11-10T09:00:00",
    follow_up_date: null,
    done: false,
  },
  {
    id: 2,
    type: "note",
    contact_id: null,
    deal_id: 2,
    description: "Other deal note",
    happened_at: "2026-11-11T09:00:00",
    follow_up_date: null,
    done: false,
  },
  {
    id: 3,
    type: "email",
    contact_id: 1,
    deal_id: null,
    description: "Email to Ana",
    happened_at: "2026-11-12T09:00:00",
    follow_up_date: null,
    done: false,
  },
  {
    id: 4,
    type: "stage_change",
    contact_id: null,
    deal_id: 1,
    description: "Stage set to Proposal",
    happened_at: "2026-11-09T09:00:00",
    follow_up_date: null,
    done: false,
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.deals.list).mockResolvedValue([deal]);
  vi.mocked(api.organizations.list).mockResolvedValue(organizations);
  vi.mocked(api.contacts.list).mockResolvedValue(contacts);
  vi.mocked(api.activities.list).mockResolvedValue(activities);
});

function renderDeal(id = 1) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/deals/${id}`]}>
        <Routes>
          <Route path="/deals/:id" element={<Deal />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function itemFor(description: string): HTMLElement {
  const text = screen.getByText(description);
  const item = text.closest("li");
  if (!item) {
    throw new Error(`No timeline item found for ${description}`);
  }
  return item;
}

describe("Deal detail page", () => {
  it("shows a loading message while the list is pending", () => {
    vi.mocked(api.deals.list).mockImplementation(() => new Promise(() => {}));
    renderDeal();

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("reports a missing deal with a way back", async () => {
    renderDeal(999);

    expect(
      await screen.findByRole("heading", { name: "Deal not found" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "← Deals" })).toBeTruthy();
  });

  it("shows the deal with its links and timeline", async () => {
    renderDeal();

    expect(
      await screen.findByRole("heading", { name: "Store rollout" }),
    ).toBeTruthy();
    expect(screen.getByText("Proposal")).toBeTruthy();
    expect(screen.getByText("$1,000")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("Jan 15, 2027")).toBeTruthy();

    const orgLink = screen.getByRole("link", { name: "Northwind Traders" });
    expect(orgLink.getAttribute("href")).toBe("/organizations/7");
    const contactLink = screen.getByRole("link", { name: "Ana Silva" });
    expect(contactLink.getAttribute("href")).toBe("/contacts/1");

    // Only this deal's activities land in the timeline.
    expect(screen.getByText("Called about rollout")).toBeTruthy();
    expect(screen.getByText("Stage set to Proposal")).toBeTruthy();
    expect(screen.queryByText("Other deal note")).toBeNull();
    expect(screen.queryByText("Email to Ana")).toBeNull();
    expect(screen.getByRole("link", { name: "← Deals" })).toBeTruthy();
  });

  it("falls back to dashes for missing org and contact", async () => {
    vi.mocked(api.deals.list).mockResolvedValue([
      { ...deal, organization_id: 99, contact_id: null },
    ]);
    renderDeal();

    await screen.findByRole("heading", { name: "Store rollout" });
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(
      screen.queryByRole("link", { name: "Northwind Traders" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Ana Silva" })).toBeNull();
  });

  it("says so when nothing is logged for the deal", async () => {
    vi.mocked(api.activities.list).mockResolvedValue([]);
    renderDeal();

    expect(await screen.findByText("Nothing logged yet.")).toBeTruthy();
  });

  it("logs an activity on the deal", async () => {
    vi.mocked(api.activities.create).mockResolvedValue(activities[0]);
    renderDeal();
    await screen.findByText("Called about rollout");

    fireEvent.click(screen.getByRole("button", { name: "Log activity" }));
    const dialog = await screen.findByRole("dialog", { name: "Log activity" });
    fireEvent.change(within(dialog).getByLabelText("Description"), {
      target: { value: "Follow-up call booked" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Log" }));

    await waitFor(() =>
      expect(api.activities.create).toHaveBeenCalledWith({
        type: "note",
        contact_id: null,
        deal_id: 1,
        description: "Follow-up call booked",
        happened_at: expect.any(String),
        follow_up_date: null,
        done: false,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("edits a timeline activity with values prefilled", async () => {
    vi.mocked(api.activities.update).mockResolvedValue(activities[0]);
    renderDeal();
    await screen.findByText("Called about rollout");

    fireEvent.click(
      within(itemFor("Called about rollout")).getByRole("button", {
        name: "Edit",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Edit activity" });
    expect(
      (within(dialog).getByLabelText("Description") as HTMLTextAreaElement)
        .value,
    ).toBe("Called about rollout");

    fireEvent.change(within(dialog).getByLabelText("Description"), {
      target: { value: "Called about rollout again" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.activities.update).toHaveBeenCalledWith(1, {
        type: "call",
        contact_id: null,
        deal_id: 1,
        description: "Called about rollout again",
        happened_at: "2026-11-10T09:00",
        follow_up_date: null,
        done: false,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("deletes a timeline activity after confirming", async () => {
    vi.mocked(api.activities.remove).mockResolvedValue({});
    renderDeal();
    await screen.findByText("Called about rollout");

    fireEvent.click(
      within(itemFor("Called about rollout")).getByRole("button", {
        name: "Delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete activity?",
    });
    expect(within(dialog).getByText("Called about rollout")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.activities.remove).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("hides edit and delete on stage-change entries", async () => {
    renderDeal();
    await screen.findByText("Called about rollout");

    expect(screen.getByText("Stage change")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
    expect(screen.queryByText("Other deal note")).toBeNull();
  });

  it("labels follow-ups as done, late, upcoming or absent", async () => {
    vi.mocked(api.activities.list).mockResolvedValue([
      {
        id: 10,
        type: "note",
        contact_id: null,
        deal_id: 1,
        description: "Done follow-up",
        happened_at: "2026-11-10T09:00:00",
        follow_up_date: "2026-01-01",
        done: true,
      },
      {
        id: 11,
        type: "call",
        contact_id: null,
        deal_id: 1,
        description: "Overdue follow-up",
        happened_at: "2026-11-10T09:00:00",
        follow_up_date: "2020-06-01",
        done: false,
      },
      {
        id: 12,
        type: "email",
        contact_id: null,
        deal_id: 1,
        description: "Future follow-up",
        happened_at: "2026-11-10T09:00:00",
        follow_up_date: "2030-01-01",
        done: false,
      },
      {
        id: 13,
        type: "note",
        contact_id: null,
        deal_id: 1,
        description: "No due date",
        happened_at: "2026-11-10T09:00:00",
        follow_up_date: null,
        done: false,
      },
    ]);
    renderDeal();
    await screen.findByText("Done follow-up");

    expect(
      within(itemFor("Done follow-up")).getByText("Follow-up done"),
    ).toBeTruthy();
    expect(
      within(itemFor("Overdue follow-up")).getByText(
        /^Follow-up: \d+ days late$/,
      ),
    ).toBeTruthy();
    expect(
      within(itemFor("Future follow-up")).getByText("Follow-up: Jan 1, 2030"),
    ).toBeTruthy();
    expect(within(itemFor("No due date")).queryByText(/Follow-up/)).toBeNull();
  });
});
