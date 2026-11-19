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
import Deals from "./Deals";

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

const deals: DealRecord[] = [
  {
    id: 1,
    name: "Wholesale rollout",
    organization_id: 7,
    contact_id: 1,
    stage: "New",
    value_cents: 100_000,
    probability: 10,
    close_date: "2020-01-01",
    position: 0,
  },
  {
    id: 2,
    name: "Store refresh",
    organization_id: 99,
    contact_id: null,
    stage: "Won",
    value_cents: 50_000,
    probability: 100,
    close_date: "2020-06-01",
    position: 1,
  },
  {
    id: 3,
    name: "Fleet pilot",
    organization_id: 7,
    contact_id: 2,
    stage: "Proposal",
    value_cents: 250_000,
    probability: 50,
    close_date: "2030-01-01",
    position: 0,
  },
];

const activities: Activity[] = [
  {
    id: 5,
    type: "note",
    contact_id: null,
    deal_id: 1,
    description: "Rollout note",
    happened_at: "2026-11-10T09:00:00",
    follow_up_date: null,
    done: false,
  },
  {
    id: 6,
    type: "call",
    contact_id: 1,
    deal_id: null,
    description: "Call with Ana",
    happened_at: "2026-11-11T09:00:00",
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
  vi.mocked(api.deals.list).mockResolvedValue(deals);
  vi.mocked(api.organizations.list).mockResolvedValue(organizations);
  vi.mocked(api.contacts.list).mockResolvedValue(contacts);
  vi.mocked(api.activities.list).mockResolvedValue(activities);
});

function renderDeals() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/deals"]}>
        <Routes>
          <Route path="/deals" element={<Deals />} />
          <Route path="/deals/:id" element={<Deal />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rowFor(name: string): HTMLElement {
  const cell = screen.getByText(name);
  const row = cell.closest("tr");
  if (!row) {
    throw new Error(`No table row found for ${name}`);
  }
  return row;
}

function visibleNames(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

describe("Deals page", () => {
  it("lists deals with their links, fallbacks and a late pill", async () => {
    renderDeals();

    expect(await screen.findByText("Wholesale rollout")).toBeTruthy();

    const late = rowFor("Wholesale rollout");
    expect(within(late).getByText("Northwind Traders")).toBeTruthy();
    expect(within(late).getByText("Ana Silva")).toBeTruthy();
    expect(within(late).getByText("$1,000")).toBeTruthy();
    expect(within(late).getByText("Late")).toBeTruthy();

    // A closed deal past its close date is not late; a future one neither.
    const won = rowFor("Store refresh");
    expect(within(won).queryByText("Late")).toBeNull();
    // Unknown organization and missing contact both show a dash.
    expect(within(won).getAllByText("—")).toHaveLength(2);
    expect(within(rowFor("Fleet pilot")).queryByText("Late")).toBeNull();
    expect(within(rowFor("Fleet pilot")).getByText("Ben Carter")).toBeTruthy();
    expect(within(rowFor("Fleet pilot")).getByText("$2,500")).toBeTruthy();
  });

  it("does not freeze a lookup cell at a dash", async () => {
    // The deals list lands before the contact list it reads cells from, and
    // TanStack keeps each row's first value: a row built while the contact
    // list was still loading would keep "—" for good.
    vi.mocked(api.contacts.list).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(contacts), 50)),
    );

    renderDeals();

    const cell = await screen.findByText("Wholesale rollout");
    const row = cell.closest("tr");
    if (!row) {
      throw new Error("No table row found for Wholesale rollout");
    }
    expect(within(row).getByText("Ana Silva")).toBeTruthy();
  });

  it("shows a loading message while the list is pending", () => {
    vi.mocked(api.deals.list).mockImplementation(() => new Promise(() => {}));
    renderDeals();

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("reports an error when the list fails to load", async () => {
    vi.mocked(api.deals.list).mockRejectedValue(new Error("boom"));
    renderDeals();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not load deals.");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the empty-state message when there are no deals", async () => {
    vi.mocked(api.deals.list).mockResolvedValue([]);
    renderDeals();

    expect(await screen.findByText("No records yet.")).toBeTruthy();
  });

  it("narrows the list with the search box, including by contact", async () => {
    renderDeals();
    await screen.findByText("Wholesale rollout");

    const search = screen.getByRole("searchbox", { name: "Search deals" });
    fireEvent.change(search, { target: { value: "wholesale" } });
    expect(screen.queryByText("Fleet pilot")).toBeNull();
    expect(screen.getByText("Wholesale rollout")).toBeTruthy();

    fireEvent.change(search, { target: { value: "ben carter" } });
    expect(screen.queryByText("Wholesale rollout")).toBeNull();
    expect(screen.getByText("Fleet pilot")).toBeTruthy();

    fireEvent.change(search, { target: { value: "nothing here" } });
    expect(screen.getByText("No matches.")).toBeTruthy();

    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getByText("Wholesale rollout")).toBeTruthy();
  });

  it("filters by stage with the select", async () => {
    renderDeals();
    await screen.findByText("Wholesale rollout");

    fireEvent.change(screen.getByRole("combobox", { name: "Stage" }), {
      target: { value: "Proposal" },
    });
    expect(screen.queryByText("Wholesale rollout")).toBeNull();
    expect(screen.getByText("Fleet pilot")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "Stage" }), {
      target: { value: "" },
    });
    expect(screen.getByText("Wholesale rollout")).toBeTruthy();
    expect(screen.getByText("Fleet pilot")).toBeTruthy();
  });

  it("sorts by name when the heading is clicked", async () => {
    renderDeals();
    await screen.findByText("Wholesale rollout");

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(visibleNames()).toEqual([
      "Fleet pilot",
      "Store refresh",
      "Wholesale rollout",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(visibleNames()).toEqual([
      "Wholesale rollout",
      "Store refresh",
      "Fleet pilot",
    ]);
  });

  it("creates a deal from the add form with stage defaults", async () => {
    vi.mocked(api.deals.create).mockResolvedValue(deals[0]);
    renderDeals();
    await screen.findByText("Wholesale rollout");

    fireEvent.click(screen.getByRole("button", { name: "Add deal" }));
    const dialog = await screen.findByRole("dialog", { name: "Add deal" });

    expect(
      (within(dialog).getByLabelText("Probability (%)") as HTMLInputElement)
        .value,
    ).toBe("10");
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Renewal upsell" },
    });
    fireEvent.change(within(dialog).getByLabelText("Organization"), {
      target: { value: "7" },
    });
    fireEvent.change(within(dialog).getByLabelText("Contact"), {
      target: { value: "1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Stage"), {
      target: { value: "Proposal" },
    });
    expect(
      (within(dialog).getByLabelText("Probability (%)") as HTMLInputElement)
        .value,
    ).toBe("50");
    fireEvent.change(within(dialog).getByLabelText("Value (USD)"), {
      target: { value: "12,500" },
    });
    fireEvent.change(within(dialog).getByLabelText("Close date"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(api.deals.create).toHaveBeenCalledWith({
        name: "Renewal upsell",
        organization_id: 7,
        contact_id: 1,
        stage: "Proposal",
        value_cents: 1_250_000,
        probability: 50,
        close_date: "2027-06-30",
        position: null,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the add form open when the amount is not valid", async () => {
    renderDeals();
    await screen.findByText("Wholesale rollout");

    fireEvent.click(screen.getByRole("button", { name: "Add deal" }));
    const dialog = await screen.findByRole("dialog", { name: "Add deal" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Broken amount" },
    });
    fireEvent.change(within(dialog).getByLabelText("Organization"), {
      target: { value: "7" },
    });
    fireEvent.change(within(dialog).getByLabelText("Value (USD)"), {
      target: { value: "not money" },
    });
    fireEvent.change(within(dialog).getByLabelText("Close date"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Enter an amount in US dollars, for example 12,500.",
    );
    expect(api.deals.create).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Add deal" })).toBeTruthy();
  });

  it("shows the server message when creating fails", async () => {
    vi.mocked(api.deals.create).mockRejectedValue(
      new Error("Name already taken."),
    );
    renderDeals();
    await screen.findByText("Wholesale rollout");

    fireEvent.click(screen.getByRole("button", { name: "Add deal" }));
    const dialog = await screen.findByRole("dialog", { name: "Add deal" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Dup" },
    });
    fireEvent.change(within(dialog).getByLabelText("Organization"), {
      target: { value: "7" },
    });
    fireEvent.change(within(dialog).getByLabelText("Value (USD)"), {
      target: { value: "1,000" },
    });
    fireEvent.change(within(dialog).getByLabelText("Close date"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Name already taken.");
    expect(screen.getByRole("dialog", { name: "Add deal" })).toBeTruthy();
  });

  it("closes the add form on cancel without saving", async () => {
    renderDeals();
    await screen.findByText("Wholesale rollout");

    fireEvent.click(screen.getByRole("button", { name: "Add deal" }));
    const dialog = await screen.findByRole("dialog", { name: "Add deal" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.deals.create).not.toHaveBeenCalled();
  });

  it("edits an existing deal with its current values prefilled", async () => {
    vi.mocked(api.deals.update).mockResolvedValue(deals[0]);
    renderDeals();
    await screen.findByText("Wholesale rollout");

    fireEvent.click(
      within(rowFor("Wholesale rollout")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Edit deal" });

    expect(
      (within(dialog).getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Wholesale rollout");
    expect(
      (within(dialog).getByLabelText("Value (USD)") as HTMLInputElement).value,
    ).toBe("$1,000");
    expect(
      (within(dialog).getByLabelText("Close date") as HTMLInputElement).value,
    ).toBe("2020-01-01");

    fireEvent.change(within(dialog).getByLabelText("Stage"), {
      target: { value: "Negotiation" },
    });
    expect(
      (within(dialog).getByLabelText("Probability (%)") as HTMLInputElement)
        .value,
    ).toBe("75");
    fireEvent.change(within(dialog).getByLabelText("Value (USD)"), {
      target: { value: "2,000" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.deals.update).toHaveBeenCalledWith(1, {
        name: "Wholesale rollout",
        organization_id: 7,
        contact_id: 1,
        stage: "Negotiation",
        value_cents: 200_000,
        probability: 75,
        close_date: "2020-01-01",
        position: 0,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("previews the cascade before deleting a deal", async () => {
    renderDeals();
    await screen.findByText("Wholesale rollout");

    fireEvent.click(
      within(rowFor("Wholesale rollout")).getByRole("button", {
        name: "Delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Wholesale rollout?",
    });
    expect(within(dialog).getByText("This cannot be undone.")).toBeTruthy();
    expect(within(dialog).getByText("Activities")).toBeTruthy();
    expect(within(dialog).getByText("Rollout note")).toBeTruthy();
    expect(within(dialog).queryByText("Call with Ana")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.deals.remove).not.toHaveBeenCalled();
  });

  it("deletes a deal after confirming", async () => {
    vi.mocked(api.deals.remove).mockResolvedValue({});
    renderDeals();
    await screen.findByText("Wholesale rollout");

    fireEvent.click(
      within(rowFor("Wholesale rollout")).getByRole("button", {
        name: "Delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Wholesale rollout?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.deals.remove).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("keeps the dialog open when the delete fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(api.deals.remove).mockRejectedValue(new Error("Delete failed."));
    renderDeals();
    await screen.findByText("Wholesale rollout");

    fireEvent.click(
      within(rowFor("Wholesale rollout")).getByRole("button", {
        name: "Delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Wholesale rollout?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.deals.remove).toHaveBeenCalledWith(1));
    expect(
      screen.getByRole("alertdialog", { name: "Delete Wholesale rollout?" }),
    ).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
  });

  it("opens the deal detail from the View action", async () => {
    renderDeals();
    await screen.findByText("Wholesale rollout");

    fireEvent.click(
      within(rowFor("Wholesale rollout")).getByRole("button", { name: "View" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Wholesale rollout" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "← Deals" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
