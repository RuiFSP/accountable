import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  type Contact,
  type Deal,
  type Organization,
  type StageMoveResult,
} from "../api/client";
import PipelineBoard from "./PipelineBoard";

vi.mock("../api/client", () => ({
  api: {
    deals: { list: vi.fn(), create: vi.fn(), move: vi.fn() },
    organizations: { list: vi.fn() },
    contacts: { list: vi.fn() },
  },
}));

afterEach(cleanup);

const organizations: Organization[] = [
  {
    id: 7,
    name: "Northwind Traders",
    website: null,
    industry: null,
    notes: null,
    billing_address: null,
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
    close_date: "2020-05-01",
    position: 0,
  },
  {
    id: 2,
    name: "Renewal",
    organization_id: 99,
    contact_id: null,
    stage: "Proposal",
    value_cents: 200_000,
    probability: 50,
    close_date: "2099-01-01",
    position: 0,
  },
  {
    id: 3,
    name: "Closed won",
    organization_id: 7,
    contact_id: 1,
    stage: "Won",
    value_cents: 500_000,
    probability: 100,
    close_date: "2020-01-01",
    position: 0,
  },
];

function DealDetail() {
  const { id } = useParams();
  return <h1>Deal {id}</h1>;
}

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<PipelineBoard />} />
          <Route path="/deals/:id" element={<DealDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.deals.list).mockResolvedValue(deals);
  vi.mocked(api.deals.create).mockResolvedValue(deals[0]);
  vi.mocked(api.deals.move).mockResolvedValue({} as StageMoveResult);
  vi.mocked(api.organizations.list).mockResolvedValue(organizations);
  vi.mocked(api.contacts.list).mockResolvedValue(contacts);
});

function column(stage: string): HTMLElement {
  return screen.getByRole("region", { name: `${stage} column` });
}

describe("PipelineBoard", () => {
  it("waits for the deals before drawing the board", () => {
    vi.mocked(api.deals.list).mockReturnValue(new Promise<Deal[]>(() => {}));
    renderBoard();

    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText("Open pipeline")).toBeNull();
  });

  it("reports a board that failed to load", async () => {
    vi.mocked(api.deals.list).mockRejectedValue(new Error("boom"));
    renderBoard();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not load deals.");
  });

  it("shows the open totals, every column and the facts on each card", async () => {
    renderBoard();

    const lateCard = await screen.findByRole("button", {
      name: /Store rollout/,
    });
    expect(screen.getByText("$3,000")).toBeTruthy();
    expect(screen.getByText("$1,100")).toBeTruthy();
    expect(screen.getByText("2 open deals")).toBeTruthy();

    for (const stage of [
      "New",
      "Qualified",
      "Proposal",
      "Negotiation",
      "Won",
      "Lost",
    ]) {
      expect(
        screen.getByRole("region", { name: `${stage} column` }),
      ).toBeTruthy();
    }

    expect(await within(lateCard).findByText("Northwind Traders")).toBeTruthy();
    expect(within(lateCard).getByText("$1,000")).toBeTruthy();
    expect(within(lateCard).getByText("10%")).toBeTruthy();
    expect(within(lateCard).getByText("May 1, 2020")).toBeTruthy();
    expect(within(lateCard).getByText("Late")).toBeTruthy();

    const freshCard = await screen.findByRole("button", { name: /Renewal/ });
    expect(within(freshCard).queryByText("Northwind Traders")).toBeNull();
    expect(within(freshCard).queryByText("Late")).toBeNull();
    expect(within(freshCard).getByText("Jan 1, 2099")).toBeTruthy();

    const wonCard = await screen.findByRole("button", { name: /Closed won/ });
    expect(within(wonCard).getByText("Northwind Traders")).toBeTruthy();
    expect(within(wonCard).queryByText("Late")).toBeNull();
    expect(within(wonCard).getByText("Jan 1, 2020")).toBeTruthy();

    expect(screen.getAllByText("No deals.")).toHaveLength(3);
    expect(within(column("New")).queryByText("No deals.")).toBeNull();
  });

  it("opens a deal when its card is clicked", async () => {
    renderBoard();

    fireEvent.click(
      await screen.findByRole("button", { name: /Store rollout/ }),
    );

    expect(await screen.findByRole("heading", { name: "Deal 1" })).toBeTruthy();
  });

  it("opens a deal from the keyboard and ignores other keys", async () => {
    renderBoard();
    const card = await screen.findByRole("button", { name: /Store rollout/ });

    fireEvent.keyDown(card, { key: "a" });
    expect(screen.queryByRole("heading", { name: /^Deal / })).toBeNull();
    expect(screen.getByRole("button", { name: /Store rollout/ })).toBeTruthy();

    fireEvent.keyDown(card, { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "Deal 1" })).toBeTruthy();
  });

  it("opens a deal with the Space key", async () => {
    renderBoard();

    fireEvent.keyDown(
      await screen.findByRole("button", { name: /Store rollout/ }),
      { key: " " },
    );

    expect(await screen.findByRole("heading", { name: "Deal 1" })).toBeTruthy();
  });

  it("adds a deal into the column it was opened from", async () => {
    renderBoard();

    await screen.findByRole("button", { name: /Store rollout/ });
    fireEvent.click(
      within(column("Proposal")).getByRole("button", { name: "Add" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Add deal" });
    expect(
      (within(dialog).getByLabelText("Stage") as HTMLSelectElement).value,
    ).toBe("Proposal");
    expect(
      (within(dialog).getByLabelText("Probability (%)") as HTMLInputElement)
        .value,
    ).toBe("50");

    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Fresh deal" },
    });
    fireEvent.change(within(dialog).getByLabelText("Organization"), {
      target: { value: "7" },
    });
    fireEvent.change(within(dialog).getByLabelText("Value (USD)"), {
      target: { value: "2,000" },
    });
    fireEvent.change(within(dialog).getByLabelText("Close date"), {
      target: { value: "2099-06-01" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    expect(api.deals.create).toHaveBeenCalledWith({
      name: "Fresh deal",
      organization_id: 7,
      contact_id: null,
      stage: "Proposal",
      value_cents: 200_000,
      probability: 50,
      close_date: "2099-06-01",
      position: null,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes the add form without saving when cancelled", async () => {
    renderBoard();

    await screen.findByRole("button", { name: /Store rollout/ });
    fireEvent.click(
      within(column("Lost")).getByRole("button", { name: "Add" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Add deal" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.deals.create).not.toHaveBeenCalled();
  });

  it("keeps the add form open with the server's message when saving fails", async () => {
    vi.mocked(api.deals.create).mockRejectedValue(new Error("Name is taken."));
    renderBoard();

    await screen.findByRole("button", { name: /Store rollout/ });
    fireEvent.click(within(column("New")).getByRole("button", { name: "Add" }));

    const dialog = await screen.findByRole("dialog", { name: "Add deal" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Dup" },
    });
    fireEvent.change(within(dialog).getByLabelText("Organization"), {
      target: { value: "7" },
    });
    fireEvent.change(within(dialog).getByLabelText("Value (USD)"), {
      target: { value: "100" },
    });
    fireEvent.change(within(dialog).getByLabelText("Close date"), {
      target: { value: "2099-06-01" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("Name is taken.");
    expect(screen.getByRole("dialog", { name: "Add deal" })).toBeTruthy();
  });

  it("ignores a drop on the card's own slot and the click right after it", async () => {
    renderBoard();

    const card = await screen.findByRole("button", { name: /Store rollout/ });
    fireEvent.pointerDown(card, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(card, {
      pointerId: 1,
      isPrimary: true,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerMove(column("Proposal"), {
      pointerId: 1,
      isPrimary: true,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerUp(card, {
      pointerId: 1,
      isPrimary: true,
      clientX: 60,
      clientY: 60,
    });

    expect(api.deals.move).not.toHaveBeenCalled();

    fireEvent.click(card);
    expect(screen.queryByRole("heading", { name: /^Deal / })).toBeNull();
  });

  it("moves a dragged card onto another card's slot", async () => {
    renderBoard();

    const card = await screen.findByRole("button", { name: /Closed won/ });
    const target = column("New");
    fireEvent.pointerDown(card, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(card, {
      pointerId: 1,
      isPrimary: true,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerMove(target, {
      pointerId: 1,
      isPrimary: true,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerUp(card, {
      pointerId: 1,
      isPrimary: true,
      clientX: 60,
      clientY: 60,
    });

    await waitFor(() => expect(api.deals.move).toHaveBeenCalled());
    expect(api.deals.move).toHaveBeenCalledWith(3, {
      stage: "New",
      position: 0,
    });
  });

  it("shows an alert when the server refuses a move", async () => {
    vi.mocked(api.deals.move).mockRejectedValue(new Error("refused"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    renderBoard();

    const card = await screen.findByRole("button", { name: /Closed won/ });
    fireEvent.pointerDown(card, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(card, {
      pointerId: 1,
      isPrimary: true,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerMove(column("New"), {
      pointerId: 1,
      isPrimary: true,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerUp(card, {
      pointerId: 1,
      isPrimary: true,
      clientX: 60,
      clientY: 60,
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Could not move the deal. The board shows the saved state again.",
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
