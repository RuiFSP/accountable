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
  type Deal,
  type Organization as OrganizationRecord,
} from "../api/client";
import Organization from "./Organization";
import Organizations from "./Organizations";

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

const organizations: OrganizationRecord[] = [
  {
    id: 7,
    name: "Northwind Traders",
    website: "northwind.example",
    industry: "Retail",
    notes: "Wholesale accounts",
  },
  {
    id: 8,
    name: "Solvent Solutions",
    website: null,
    industry: null,
    notes: null,
  },
];

const contacts: Contact[] = [
  {
    id: 1,
    name: "Ana Silva",
    email: "ana@northwind.example",
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

const deals: Deal[] = [
  {
    id: 1,
    name: "Store rollout",
    organization_id: 7,
    contact_id: 1,
    stage: "New",
    value_cents: 100_000,
    probability: 10,
    close_date: "2027-01-01",
    position: 0,
  },
];

const activities: Activity[] = [
  {
    id: 1,
    type: "call",
    contact_id: 1,
    deal_id: null,
    description: "Call with Ana",
    happened_at: "2026-11-10T09:00:00",
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
  vi.mocked(api.organizations.list).mockResolvedValue(organizations);
  vi.mocked(api.contacts.list).mockResolvedValue(contacts);
  vi.mocked(api.deals.list).mockResolvedValue(deals);
  vi.mocked(api.activities.list).mockResolvedValue(activities);
});

function renderOrganizations() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/organizations"]}>
        <Routes>
          <Route path="/organizations" element={<Organizations />} />
          <Route path="/organizations/:id" element={<Organization />} />
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

describe("Organizations page", () => {
  it("lists organizations and shows dashes for missing fields", async () => {
    renderOrganizations();

    expect(await screen.findByText("Northwind Traders")).toBeTruthy();
    const northwind = rowFor("Northwind Traders");
    expect(within(northwind).getByText("northwind.example")).toBeTruthy();
    expect(within(northwind).getByText("Retail")).toBeTruthy();

    const solvent = rowFor("Solvent Solutions");
    expect(within(solvent).getAllByText("—")).toHaveLength(2);
  });

  it("shows a loading message while the list is pending", () => {
    vi.mocked(api.organizations.list).mockImplementation(
      () => new Promise(() => {}),
    );
    renderOrganizations();

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("reports an error when the list fails to load", async () => {
    vi.mocked(api.organizations.list).mockRejectedValue(new Error("boom"));
    renderOrganizations();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not load organizations.");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the empty-state message when there are no organizations", async () => {
    vi.mocked(api.organizations.list).mockResolvedValue([]);
    renderOrganizations();

    expect(await screen.findByText("No records yet.")).toBeTruthy();
  });

  it("narrows the list with the search box, including by notes", async () => {
    renderOrganizations();
    await screen.findByText("Northwind Traders");

    const search = screen.getByRole("searchbox", {
      name: "Search organizations",
    });
    fireEvent.change(search, { target: { value: "wholesale" } });
    expect(screen.queryByText("Solvent Solutions")).toBeNull();
    expect(screen.getByText("Northwind Traders")).toBeTruthy();

    fireEvent.change(search, { target: { value: "solvent" } });
    expect(screen.queryByText("Northwind Traders")).toBeNull();
    expect(screen.getByText("Solvent Solutions")).toBeTruthy();

    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getByText("Northwind Traders")).toBeTruthy();
  });

  it("sorts by name when the heading is clicked", async () => {
    renderOrganizations();
    await screen.findByText("Northwind Traders");

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(visibleNames()).toEqual(["Northwind Traders", "Solvent Solutions"]);

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(visibleNames()).toEqual(["Solvent Solutions", "Northwind Traders"]);
  });

  it("creates an organization from the add form with trimmed values", async () => {
    vi.mocked(api.organizations.create).mockResolvedValue(organizations[0]);
    renderOrganizations();
    await screen.findByText("Northwind Traders");

    fireEvent.click(screen.getByRole("button", { name: "Add organization" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Add organization",
    });

    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "  Cascade Co  " },
    });
    fireEvent.change(within(dialog).getByLabelText("Website"), {
      target: { value: "cascade.example" },
    });
    fireEvent.change(within(dialog).getByLabelText("Industry"), {
      target: { value: "Services" },
    });
    fireEvent.change(within(dialog).getByLabelText("Notes"), {
      target: { value: "Met at the expo" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(api.organizations.create).toHaveBeenCalledWith({
        name: "Cascade Co",
        website: "cascade.example",
        industry: "Services",
        notes: "Met at the expo",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("sends empty optional fields as null when creating", async () => {
    vi.mocked(api.organizations.create).mockResolvedValue(organizations[0]);
    renderOrganizations();
    await screen.findByText("Northwind Traders");

    fireEvent.click(screen.getByRole("button", { name: "Add organization" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Add organization",
    });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Bare Bones" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(api.organizations.create).toHaveBeenCalledWith({
        name: "Bare Bones",
        website: null,
        industry: null,
        notes: null,
      }),
    );
  });

  it("closes the add form on cancel without saving", async () => {
    renderOrganizations();
    await screen.findByText("Northwind Traders");

    fireEvent.click(screen.getByRole("button", { name: "Add organization" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Add organization",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.organizations.create).not.toHaveBeenCalled();
  });

  it("edits an existing organization with its values prefilled", async () => {
    vi.mocked(api.organizations.update).mockResolvedValue(organizations[0]);
    renderOrganizations();
    await screen.findByText("Northwind Traders");

    fireEvent.click(
      within(rowFor("Northwind Traders")).getByRole("button", {
        name: "Edit",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit organization",
    });

    expect(
      (within(dialog).getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Northwind Traders");
    expect(
      (within(dialog).getByLabelText("Website") as HTMLInputElement).value,
    ).toBe("northwind.example");
    expect(
      (within(dialog).getByLabelText("Notes") as HTMLTextAreaElement).value,
    ).toBe("Wholesale accounts");

    fireEvent.change(within(dialog).getByLabelText("Industry"), {
      target: { value: "Commerce" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.organizations.update).toHaveBeenCalledWith(7, {
        name: "Northwind Traders",
        website: "northwind.example",
        industry: "Commerce",
        notes: "Wholesale accounts",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the form open and shows the message when saving fails", async () => {
    vi.mocked(api.organizations.create).mockRejectedValue(
      new Error("Name is required."),
    );
    renderOrganizations();
    await screen.findByText("Northwind Traders");

    fireEvent.click(screen.getByRole("button", { name: "Add organization" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Add organization",
    });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Dup" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Name is required.");
    expect(
      screen.getByRole("dialog", { name: "Add organization" }),
    ).toBeTruthy();
    expect(api.organizations.create).toHaveBeenCalledTimes(1);
  });

  it("previews every cascaded record before deleting an organization", async () => {
    renderOrganizations();
    await screen.findByText("Northwind Traders");

    fireEvent.click(
      within(rowFor("Northwind Traders")).getByRole("button", {
        name: "Delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Northwind Traders?",
    });
    expect(within(dialog).getByText("Contacts")).toBeTruthy();
    expect(within(dialog).getByText("Ana Silva")).toBeTruthy();
    expect(within(dialog).getByText("Deals")).toBeTruthy();
    expect(within(dialog).getByText("Store rollout")).toBeTruthy();
    expect(within(dialog).getByText("Activities")).toBeTruthy();
    expect(within(dialog).getByText("Call with Ana")).toBeTruthy();
    expect(within(dialog).queryByText("Ben Carter")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.organizations.remove).not.toHaveBeenCalled();
  });

  it("deletes an organization with no cascaded records after confirming", async () => {
    vi.mocked(api.organizations.remove).mockResolvedValue({});
    renderOrganizations();
    await screen.findByText("Northwind Traders");

    fireEvent.click(
      within(rowFor("Solvent Solutions")).getByRole("button", {
        name: "Delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Solvent Solutions?",
    });
    expect(within(dialog).queryByText("Contacts")).toBeNull();
    expect(within(dialog).queryByText("Deals")).toBeNull();
    expect(within(dialog).queryByText("Activities")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(api.organizations.remove).toHaveBeenCalledWith(8),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("keeps the dialog open when the delete fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(api.organizations.remove).mockRejectedValue(
      new Error("Delete failed."),
    );
    renderOrganizations();
    await screen.findByText("Northwind Traders");

    fireEvent.click(
      within(rowFor("Northwind Traders")).getByRole("button", {
        name: "Delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Northwind Traders?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(api.organizations.remove).toHaveBeenCalledWith(7),
    );
    expect(
      screen.getByRole("alertdialog", {
        name: "Delete Northwind Traders?",
      }),
    ).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
  });

  it("opens the organization detail from the View action", async () => {
    renderOrganizations();
    await screen.findByText("Northwind Traders");

    fireEvent.click(
      within(rowFor("Northwind Traders")).getByRole("button", {
        name: "View",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Northwind Traders",
        level: 1,
      }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "← Organizations" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
