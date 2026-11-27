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
  type Organization as OrganizationRecord,
} from "../api/client";
import Contact from "./Contact";
import Contacts from "./Contacts";
import Organization from "./Organization";

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
    id: 3,
    name: "Cara Diaz",
    email: null,
    phone: null,
    job_title: null,
    organization_id: null,
    status: "lead",
  },
];

/** A date offset from today so the overdue/upcoming labels stay stable. */
function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

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
  {
    id: 2,
    type: "note",
    contact_id: 1,
    deal_id: null,
    description: "Ana upcoming follow-up",
    happened_at: "2026-11-11T09:00:00",
    follow_up_date: isoDate(5),
    done: false,
  },
  {
    id: 3,
    type: "email",
    contact_id: 1,
    deal_id: null,
    description: "Ana overdue follow-up",
    happened_at: "2026-11-12T09:00:00",
    follow_up_date: isoDate(-3),
    done: false,
  },
  {
    id: 4,
    type: "call",
    contact_id: 1,
    deal_id: null,
    description: "Ana completed follow-up",
    happened_at: "2026-11-13T09:00:00",
    follow_up_date: isoDate(-3),
    done: true,
  },
  {
    id: 5,
    type: "stage_change",
    contact_id: 1,
    deal_id: null,
    description: "Ana stage change",
    happened_at: "2026-11-14T09:00:00",
    follow_up_date: null,
    done: false,
  },
  {
    id: 6,
    type: "note",
    contact_id: 2,
    deal_id: null,
    description: "Other contact note",
    happened_at: "2026-11-14T10:00:00",
    follow_up_date: null,
    done: false,
  },
  {
    id: 7,
    type: "note",
    contact_id: null,
    deal_id: 9,
    description: "Deal note",
    happened_at: "2026-11-14T11:00:00",
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

function renderContact(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/:id" element={<Contact />} />
          <Route path="/organizations/:id" element={<Organization />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function timelineItem(description: string): HTMLElement {
  const element = screen.getByText(description);
  const item = element.closest("li");
  if (!item) {
    throw new Error(`No timeline item found for ${description}`);
  }
  return item;
}

describe("Contact detail page", () => {
  it("shows a loading message while the contacts are pending", () => {
    vi.mocked(api.contacts.list).mockImplementation(
      () => new Promise(() => {}),
    );
    renderContact("/contacts/1");

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("shows the not-found page and links back to the list", async () => {
    vi.mocked(api.contacts.list).mockResolvedValue([]);
    renderContact("/contacts/42");

    expect(
      await screen.findByRole("heading", { name: "Contact not found" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "← Contacts" }));
    expect(
      await screen.findByRole("heading", { name: "Contacts" }),
    ).toBeTruthy();
    expect(screen.getByText("No records yet.")).toBeTruthy();
  });

  it("shows the full detail with an organization link that navigates", async () => {
    renderContact("/contacts/1");

    expect(
      await screen.findByRole("heading", { name: "Ana Silva", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("ana@northwind.example")).toBeTruthy();
    expect(screen.getByText("555-0101")).toBeTruthy();
    expect(screen.getByText("Buyer")).toBeTruthy();
    expect(screen.getByText("Customer")).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Northwind Traders" }));
    expect(
      await screen.findByRole("heading", {
        name: "Northwind Traders",
        level: 1,
      }),
    ).toBeTruthy();
  });

  it("falls back to dashes for missing fields and an empty timeline", async () => {
    renderContact("/contacts/3");

    expect(
      await screen.findByRole("heading", { name: "Cara Diaz", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("Lead")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.getByText("Nothing logged yet.")).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Northwind Traders" }),
    ).toBeNull();
  });

  it("lists only the activities of this contact on the timeline", async () => {
    renderContact("/contacts/1");

    expect(await screen.findByText("Call with Ana")).toBeTruthy();
    expect(screen.getByText("Ana upcoming follow-up")).toBeTruthy();
    expect(screen.getByText("Ana overdue follow-up")).toBeTruthy();
    expect(screen.getByText("Ana completed follow-up")).toBeTruthy();
    expect(screen.getByText("Ana stage change")).toBeTruthy();
    expect(screen.queryByText("Other contact note")).toBeNull();
    expect(screen.queryByText("Deal note")).toBeNull();
  });

  it("labels each follow-up as upcoming, overdue or done", async () => {
    renderContact("/contacts/1");
    await screen.findByText("Call with Ana");

    const followUps = screen
      .getAllByText(/^Follow-up: /)
      .map((element) => element.textContent ?? "");
    expect(followUps).toHaveLength(2);
    expect(followUps.some((text) => text.includes("3 days late"))).toBe(true);
    expect(screen.getByText("Follow-up done")).toBeTruthy();
  });

  it("hides the edit and delete actions on a stage-change entry", async () => {
    renderContact("/contacts/1");
    await screen.findByText("Ana stage change");

    const stageItem = timelineItem("Ana stage change");
    expect(
      within(stageItem).queryByRole("button", { name: "Edit" }),
    ).toBeNull();
    expect(
      within(stageItem).queryByRole("button", { name: "Delete" }),
    ).toBeNull();
    expect(within(stageItem).getByText("Stage change")).toBeTruthy();

    const callItem = timelineItem("Call with Ana");
    expect(within(callItem).getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(
      within(callItem).getByRole("button", { name: "Delete" }),
    ).toBeTruthy();
  });

  it("logs a new activity against this contact", async () => {
    vi.mocked(api.activities.create).mockResolvedValue(activities[0]);
    renderContact("/contacts/1");
    await screen.findByText("Call with Ana");

    fireEvent.click(screen.getByRole("button", { name: "Log activity" }));
    const dialog = await screen.findByRole("dialog", { name: "Log activity" });

    fireEvent.change(within(dialog).getByLabelText("Description"), {
      target: { value: "Scheduled demo" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Log" }));

    await waitFor(() =>
      expect(api.activities.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "note",
          contact_id: 1,
          deal_id: null,
          description: "Scheduled demo",
          done: false,
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("edits an activity and marks its follow-up done", async () => {
    vi.mocked(api.activities.update).mockResolvedValue(activities[0]);
    renderContact("/contacts/1");
    await screen.findByText("Call with Ana");

    fireEvent.click(
      within(timelineItem("Call with Ana")).getByRole("button", {
        name: "Edit",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Edit activity" });
    expect(
      (within(dialog).getByLabelText("Description") as HTMLTextAreaElement)
        .value,
    ).toBe("Call with Ana");
    expect(
      (
        within(dialog).getByRole("checkbox", {
          name: "Done",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);

    fireEvent.change(within(dialog).getByLabelText("Description"), {
      target: { value: "Call with Ana wrapped up" },
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Done" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.activities.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: "call",
          contact_id: 1,
          deal_id: null,
          description: "Call with Ana wrapped up",
          done: true,
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("deletes an activity after confirming", async () => {
    vi.mocked(api.activities.remove).mockResolvedValue({});
    renderContact("/contacts/1");
    await screen.findByText("Call with Ana");

    fireEvent.click(
      within(timelineItem("Call with Ana")).getByRole("button", {
        name: "Delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete activity?",
    });
    expect(within(dialog).getByText("Call with Ana")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.activities.remove).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("cancels the delete confirmation without removing anything", async () => {
    renderContact("/contacts/1");
    await screen.findByText("Call with Ana");

    fireEvent.click(
      within(timelineItem("Call with Ana")).getByRole("button", {
        name: "Delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete activity?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.activities.remove).not.toHaveBeenCalled();
  });

  it("keeps the confirmation open when deleting the activity fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(api.activities.remove).mockRejectedValue(
      new Error("Delete failed."),
    );
    renderContact("/contacts/1");
    await screen.findByText("Call with Ana");

    fireEvent.click(
      within(timelineItem("Call with Ana")).getByRole("button", {
        name: "Delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete activity?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.activities.remove).toHaveBeenCalledWith(1));
    expect(
      screen.getByRole("alertdialog", { name: "Delete activity?" }),
    ).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("who added and who changed it", () => {
  it("shows both lines with an email", async () => {
    vi.mocked(api.contacts.list).mockResolvedValue([
      {
        ...contacts[0],
        created_by: "alex@brightloop.example",
        updated_by: "priya@brightloop.example",
      },
    ]);

    renderContact("/contacts/1");

    expect(
      await screen.findByRole("heading", { name: "Ana Silva", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("Added by")).toBeTruthy();
    expect(screen.getByText("alex@brightloop.example")).toBeTruthy();
    expect(screen.getByText("Last changed by")).toBeTruthy();
    expect(screen.getByText("priya@brightloop.example")).toBeTruthy();
  });

  it("leaves a line out when there is nobody for it", async () => {
    renderContact("/contacts/1");

    expect(
      await screen.findByRole("heading", { name: "Ana Silva", level: 1 }),
    ).toBeTruthy();
    expect(screen.queryByText("Added by")).toBeNull();
    expect(screen.queryByText("Last changed by")).toBeNull();

    cleanup();
    vi.mocked(api.contacts.list).mockResolvedValue([
      { ...contacts[0], created_by: "alex@brightloop.example" },
    ]);
    renderContact("/contacts/1");

    expect(
      await screen.findByRole("heading", { name: "Ana Silva", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("Added by")).toBeTruthy();
    expect(screen.queryByText("Last changed by")).toBeNull();
  });
});
