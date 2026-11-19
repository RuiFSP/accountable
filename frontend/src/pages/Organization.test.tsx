import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  type Activity,
  type Contact as ContactRecord,
  type Deal as DealRecord,
  type Organization as OrganizationRecord,
} from "../api/client";
import Contact from "./Contact";
import Deal from "./Deal";
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

const contacts: ContactRecord[] = [
  {
    id: 1,
    name: "Ana Silva",
    email: "ana@northwind.example",
    phone: null,
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

const deals: DealRecord[] = [
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

const activities: Activity[] = [];

afterEach(cleanup);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.organizations.list).mockResolvedValue(organizations);
  vi.mocked(api.contacts.list).mockResolvedValue(contacts);
  vi.mocked(api.deals.list).mockResolvedValue(deals);
  vi.mocked(api.activities.list).mockResolvedValue(activities);
});

function renderOrganization(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/organizations" element={<Organizations />} />
          <Route path="/organizations/:id" element={<Organization />} />
          <Route path="/contacts/:id" element={<Contact />} />
          <Route path="/deals/:id" element={<Deal />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Organization detail page", () => {
  it("shows a loading message while the organizations are pending", () => {
    vi.mocked(api.organizations.list).mockImplementation(
      () => new Promise(() => {}),
    );
    renderOrganization("/organizations/7");

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("shows the not-found page and links back to the list", async () => {
    vi.mocked(api.organizations.list).mockResolvedValue([]);
    renderOrganization("/organizations/99");

    expect(
      await screen.findByRole("heading", { name: "Organization not found" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "← Organizations" }));
    expect(
      await screen.findByRole("heading", { name: "Organizations" }),
    ).toBeTruthy();
    expect(screen.getByText("No records yet.")).toBeTruthy();
  });

  it("shows the details and the linked contacts and deals", async () => {
    renderOrganization("/organizations/7");

    expect(
      await screen.findByRole("heading", {
        name: "Northwind Traders",
        level: 1,
      }),
    ).toBeTruthy();
    expect(screen.getByText("northwind.example")).toBeTruthy();
    expect(screen.getByText("Retail")).toBeTruthy();
    expect(screen.getByText("Wholesale accounts")).toBeTruthy();

    const contactsPanel = screen
      .getByRole("heading", { name: "Contacts 1" })
      .closest("section") as HTMLElement;
    expect(
      within(contactsPanel).getByRole("link", { name: "Ana Silva" }),
    ).toBeTruthy();
    expect(within(contactsPanel).getByText("Customer")).toBeTruthy();
    expect(within(contactsPanel).queryByText("Ben Carter")).toBeNull();

    const dealsPanel = screen
      .getByRole("heading", { name: "Deals 1" })
      .closest("section") as HTMLElement;
    expect(
      within(dealsPanel).getByRole("link", { name: "Store rollout" }),
    ).toBeTruthy();
    expect(within(dealsPanel).getByText("New")).toBeTruthy();
    expect(within(dealsPanel).getByText("$1,000")).toBeTruthy();
  });

  it("falls back to dashes and empty sections when nothing is linked", async () => {
    renderOrganization("/organizations/8");

    expect(
      await screen.findByRole("heading", {
        name: "Solvent Solutions",
        level: 1,
      }),
    ).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getByText("No contacts yet.")).toBeTruthy();
    expect(screen.getByText("No deals yet.")).toBeTruthy();

    const contactsPanel = screen
      .getByRole("heading", { name: "Contacts 0" })
      .closest("section") as HTMLElement;
    expect(within(contactsPanel).queryByRole("link")).toBeNull();
  });

  it("navigates from a linked contact to its detail page", async () => {
    renderOrganization("/organizations/7");
    await screen.findByRole("heading", { name: "Contacts 1" });

    fireEvent.click(screen.getByRole("link", { name: "Ana Silva" }));

    expect(
      await screen.findByRole("heading", { name: "Ana Silva", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("ana@northwind.example")).toBeTruthy();
  });

  it("navigates from a linked deal to its detail page", async () => {
    renderOrganization("/organizations/7");
    await screen.findByRole("heading", { name: "Deals 1" });

    fireEvent.click(screen.getByRole("link", { name: "Store rollout" }));

    expect(
      await screen.findByRole("heading", { name: "Store rollout", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("Nothing logged yet.")).toBeTruthy();
  });
});

describe("who added and who changed it", () => {
  it("shows both lines with an email", async () => {
    vi.mocked(api.organizations.list).mockResolvedValue([
      {
        ...organizations[0],
        created_by: "alex@brightloop.example",
        updated_by: "priya@brightloop.example",
      },
    ]);

    renderOrganization("/organizations/7");

    expect(
      await screen.findByRole("heading", { name: "Northwind Traders" }),
    ).toBeTruthy();
    expect(screen.getByText("Added by")).toBeTruthy();
    expect(screen.getByText("alex@brightloop.example")).toBeTruthy();
    expect(screen.getByText("Last changed by")).toBeTruthy();
    expect(screen.getByText("priya@brightloop.example")).toBeTruthy();
  });

  it("leaves a line out when there is nobody for it", async () => {
    renderOrganization("/organizations/7");

    expect(
      await screen.findByRole("heading", { name: "Northwind Traders" }),
    ).toBeTruthy();
    expect(screen.queryByText("Added by")).toBeNull();
    expect(screen.queryByText("Last changed by")).toBeNull();

    cleanup();
    vi.mocked(api.organizations.list).mockResolvedValue([
      { ...organizations[0], created_by: "alex@brightloop.example" },
    ]);
    renderOrganization("/organizations/7");

    expect(
      await screen.findByRole("heading", { name: "Northwind Traders" }),
    ).toBeTruthy();
    expect(screen.getByText("Added by")).toBeTruthy();
    expect(screen.queryByText("Last changed by")).toBeNull();
  });
});
