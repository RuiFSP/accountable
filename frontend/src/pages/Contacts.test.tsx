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
  type Contact as ContactRecord,
  type Organization,
} from "../api/client";
import Contact from "./Contact";
import Contacts from "./Contacts";

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

const organizations: Organization[] = [
  {
    id: 7,
    name: "Northwind Traders",
    website: "northwind.example",
    industry: "Retail",
    notes: null,
    billing_address: null,
  },
];

const contacts: ContactRecord[] = [
  {
    id: 1,
    name: "Ana Silva",
    email: "ana@northwind.example",
    phone: "555-0101",
    job_title: "Buyer",
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
  vi.mocked(api.contacts.list).mockResolvedValue(contacts);
  vi.mocked(api.organizations.list).mockResolvedValue(organizations);
  vi.mocked(api.activities.list).mockResolvedValue(activities);
});

function renderContacts() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/contacts"]}>
        <Routes>
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/:id" element={<Contact />} />
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

describe("Contacts page", () => {
  it("lists contacts with their organization and fallbacks for missing values", async () => {
    renderContacts();

    expect(await screen.findByText("Ana Silva")).toBeTruthy();
    const ana = rowFor("Ana Silva");
    expect(within(ana).getByText("Northwind Traders")).toBeTruthy();
    expect(within(ana).getByText("Customer")).toBeTruthy();
    expect(within(ana).queryByText("—")).toBeNull();

    const ben = rowFor("Ben Carter");
    expect(within(ben).getByText("Lead")).toBeTruthy();
    expect(within(ben).getAllByText("—")).toHaveLength(3);
  });

  it("shows a loading message while the list is pending", () => {
    vi.mocked(api.contacts.list).mockImplementation(
      () => new Promise(() => {}),
    );
    renderContacts();

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("reports an error when the list fails to load", async () => {
    vi.mocked(api.contacts.list).mockRejectedValue(new Error("boom"));
    renderContacts();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not load contacts.");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the empty-state message when there are no contacts", async () => {
    vi.mocked(api.contacts.list).mockResolvedValue([]);
    renderContacts();

    expect(await screen.findByText("No records yet.")).toBeTruthy();
  });

  it("narrows the list with the search box, including by organization", async () => {
    renderContacts();
    await screen.findByText("Ana Silva");

    const search = screen.getByRole("searchbox", { name: "Search contacts" });
    fireEvent.change(search, { target: { value: "ben" } });
    expect(screen.queryByText("Ana Silva")).toBeNull();
    expect(screen.getByText("Ben Carter")).toBeTruthy();

    fireEvent.change(search, { target: { value: "northwind" } });
    expect(screen.queryByText("Ben Carter")).toBeNull();
    expect(screen.getByText("Ana Silva")).toBeTruthy();

    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getByText("Ben Carter")).toBeTruthy();
  });

  it("sorts by name when the heading is clicked", async () => {
    renderContacts();
    await screen.findByText("Ana Silva");

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(visibleNames()).toEqual(["Ana Silva", "Ben Carter"]);

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(visibleNames()).toEqual(["Ben Carter", "Ana Silva"]);
  });

  it("filters by status with the select", async () => {
    renderContacts();
    await screen.findByText("Ana Silva");

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "lead" },
    });
    expect(screen.queryByText("Ana Silva")).toBeNull();
    expect(screen.getByText("Ben Carter")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "customer" },
    });
    expect(screen.getByText("Ana Silva")).toBeTruthy();
    expect(screen.queryByText("Ben Carter")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "" },
    });
    expect(screen.getByText("Ben Carter")).toBeTruthy();
  });

  it("creates a contact from the add form with trimmed values", async () => {
    vi.mocked(api.contacts.create).mockResolvedValue(contacts[0]);
    renderContacts();
    await screen.findByText("Ana Silva");

    fireEvent.click(screen.getByRole("button", { name: "Add contact" }));
    const dialog = await screen.findByRole("dialog", { name: "Add contact" });

    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "  Tara Kestrel  " },
    });
    fireEvent.change(within(dialog).getByLabelText("Email"), {
      target: { value: "tara@example.com" },
    });
    fireEvent.change(within(dialog).getByLabelText("Phone"), {
      target: { value: "555-0199" },
    });
    fireEvent.change(within(dialog).getByLabelText("Job title"), {
      target: { value: "Owner" },
    });
    fireEvent.change(within(dialog).getByLabelText("Organization"), {
      target: { value: "7" },
    });
    fireEvent.change(within(dialog).getByLabelText("Status"), {
      target: { value: "qualified" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(api.contacts.create).toHaveBeenCalledWith({
        name: "Tara Kestrel",
        email: "tara@example.com",
        phone: "555-0199",
        job_title: "Owner",
        organization_id: 7,
        status: "qualified",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("sends empty optional fields as null when creating", async () => {
    vi.mocked(api.contacts.create).mockResolvedValue(contacts[0]);
    renderContacts();
    await screen.findByText("Ana Silva");

    fireEvent.click(screen.getByRole("button", { name: "Add contact" }));
    const dialog = await screen.findByRole("dialog", { name: "Add contact" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Cara Diaz" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(api.contacts.create).toHaveBeenCalledWith({
        name: "Cara Diaz",
        email: null,
        phone: null,
        job_title: null,
        organization_id: null,
        status: "lead",
      }),
    );
  });

  it("closes the add form on cancel without saving", async () => {
    renderContacts();
    await screen.findByText("Ana Silva");

    fireEvent.click(screen.getByRole("button", { name: "Add contact" }));
    const dialog = await screen.findByRole("dialog", { name: "Add contact" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.contacts.create).not.toHaveBeenCalled();
  });

  it("edits an existing contact with its current values prefilled", async () => {
    vi.mocked(api.contacts.update).mockResolvedValue(contacts[1]);
    renderContacts();
    await screen.findByText("Ana Silva");

    fireEvent.click(
      within(rowFor("Ben Carter")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit contact",
    });

    expect(
      (within(dialog).getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Ben Carter");
    expect(
      (within(dialog).getByLabelText("Organization") as HTMLSelectElement)
        .value,
    ).toBe("");
    expect(
      (within(dialog).getByLabelText("Status") as HTMLSelectElement).value,
    ).toBe("lead");

    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Ben Carter Jr." },
    });
    fireEvent.change(within(dialog).getByLabelText("Status"), {
      target: { value: "customer" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.contacts.update).toHaveBeenCalledWith(2, {
        name: "Ben Carter Jr.",
        email: null,
        phone: null,
        job_title: null,
        organization_id: null,
        status: "customer",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the form open and shows the message when saving fails", async () => {
    vi.mocked(api.contacts.create).mockRejectedValue(
      new Error("Name already taken."),
    );
    renderContacts();
    await screen.findByText("Ana Silva");

    fireEvent.click(screen.getByRole("button", { name: "Add contact" }));
    const dialog = await screen.findByRole("dialog", { name: "Add contact" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Dup" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Name already taken.");
    expect(screen.getByRole("dialog", { name: "Add contact" })).toBeTruthy();
    expect(api.contacts.create).toHaveBeenCalledTimes(1);
  });

  it("previews the cascade before deleting a contact", async () => {
    renderContacts();
    await screen.findByText("Ana Silva");

    fireEvent.click(
      within(rowFor("Ana Silva")).getByRole("button", { name: "Delete" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Ana Silva?",
    });
    expect(within(dialog).getByText("This cannot be undone.")).toBeTruthy();
    expect(within(dialog).getByText("Activities")).toBeTruthy();
    expect(within(dialog).getByText("Call with Ana")).toBeTruthy();
    expect(within(dialog).queryByText("Ben Carter")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.contacts.remove).not.toHaveBeenCalled();
  });

  it("deletes a contact with no cascaded records after confirming", async () => {
    vi.mocked(api.contacts.remove).mockResolvedValue({});
    renderContacts();
    await screen.findByText("Ana Silva");

    fireEvent.click(
      within(rowFor("Ben Carter")).getByRole("button", { name: "Delete" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Ben Carter?",
    });
    expect(within(dialog).queryByText("Activities")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.contacts.remove).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("keeps the dialog open when the delete fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(api.contacts.remove).mockRejectedValue(
      new Error("Delete failed."),
    );
    renderContacts();
    await screen.findByText("Ana Silva");

    fireEvent.click(
      within(rowFor("Ana Silva")).getByRole("button", { name: "Delete" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Ana Silva?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.contacts.remove).toHaveBeenCalledWith(1));
    expect(
      screen.getByRole("alertdialog", { name: "Delete Ana Silva?" }),
    ).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
  });

  it("opens the contact detail from the View action", async () => {
    renderContacts();
    await screen.findByText("Ana Silva");

    fireEvent.click(
      within(rowFor("Ana Silva")).getByRole("button", { name: "View" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Ana Silva", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "← Contacts" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
