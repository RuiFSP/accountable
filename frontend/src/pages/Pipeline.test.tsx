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

import { api, type Deal } from "../api/client";
import Pipeline from "./Pipeline";

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

const deals: Deal[] = [
  {
    id: 1,
    name: "Alpha",
    organization_id: 7,
    contact_id: null,
    stage: "New",
    value_cents: 100_000,
    probability: 10,
    close_date: "2030-01-01",
    position: 0,
  },
  {
    id: 2,
    name: "Beta",
    organization_id: 7,
    contact_id: null,
    stage: "Won",
    value_cents: 50_000,
    probability: 100,
    close_date: null,
    position: 0,
  },
  {
    id: 3,
    name: "Gamma",
    organization_id: 7,
    contact_id: null,
    stage: "Qualified",
    value_cents: 50_000,
    probability: 25,
    close_date: "2020-01-01",
    position: 0,
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.deals.list).mockResolvedValue(deals);
  vi.mocked(api.organizations.list).mockResolvedValue([
    {
      id: 7,
      name: "Northwind Traders",
      website: null,
      industry: null,
      notes: null,
    },
  ]);
  vi.mocked(api.contacts.list).mockResolvedValue([]);
});

function renderPipeline() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/pipeline"]}>
        <Pipeline />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function columnFor(stage: string): HTMLElement {
  const column = screen.getByRole("region", { name: `${stage} column` });
  return column;
}

describe("Pipeline page", () => {
  it("renders the board with columns, cards and totals", async () => {
    renderPipeline();

    expect(await screen.findByText("Alpha")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pipeline" })).toBeTruthy();

    expect(screen.getByText("2 open deals")).toBeTruthy();
    expect(screen.getByText("$1,500")).toBeTruthy();
    expect(screen.getByText("$225")).toBeTruthy();

    const newColumn = columnFor("New");
    expect(within(newColumn).getByText("Northwind Traders")).toBeTruthy();
    expect(within(newColumn).getByText("10%")).toBeTruthy();
    expect(within(newColumn).getByText(/expected \$100/)).toBeTruthy();
    expect(within(newColumn).queryByText("No deals.")).toBeNull();

    const qualified = columnFor("Qualified");
    expect(within(qualified).getByText("Gamma")).toBeTruthy();
    expect(within(qualified).getByText("Late")).toBeTruthy();

    const won = columnFor("Won");
    expect(within(won).getByText("Beta")).toBeTruthy();
    expect(within(won).getByText("—")).toBeTruthy(); // no close date

    const lost = columnFor("Lost");
    expect(within(lost).getByText("No deals.")).toBeTruthy();
  });

  it("shows a loading message while the board is pending", () => {
    vi.mocked(api.deals.list).mockImplementation(() => new Promise(() => {}));
    renderPipeline();

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("reports an error when the board fails to load", async () => {
    vi.mocked(api.deals.list).mockRejectedValue(new Error("boom"));
    renderPipeline();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not load deals.");
    expect(screen.queryByRole("region", { name: "New column" })).toBeNull();
  });

  it("opens a stage-prefilled add dialog from a column", async () => {
    vi.mocked(api.deals.create).mockResolvedValue(deals[0]);
    renderPipeline();
    await screen.findByText("Alpha");

    fireEvent.click(
      within(columnFor("New")).getByRole("button", { name: "Add" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Add deal" });
    expect(
      (within(dialog).getByLabelText("Stage") as HTMLSelectElement).value,
    ).toBe("New");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.deals.create).not.toHaveBeenCalled();
  });
});
