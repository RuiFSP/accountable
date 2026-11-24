import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type Product } from "../api/client";
import Products from "./Products";

vi.mock("../api/client", () => ({
  api: {
    organizations: { list: vi.fn() },
    contacts: { list: vi.fn() },
    deals: { list: vi.fn() },
    activities: { list: vi.fn() },
    products: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      restore: vi.fn(),
    },
  },
}));

const products: Product[] = [
  {
    id: 1,
    name: "Starter license",
    description: "A single-team plan.",
    price_cents: 4_900,
    active: true,
    created_by: "alex@brightloop.example",
    updated_by: "alex@brightloop.example",
  },
  {
    id: 2,
    name: "Priority support",
    description: "Same-day replies.",
    price_cents: 14_950,
    active: true,
    created_by: "priya@brightloop.example",
    updated_by: "alex@brightloop.example",
  },
  {
    id: 3,
    name: "Onsite training day",
    description: null,
    price_cents: 120_000,
    active: true,
    created_by: "alex@brightloop.example",
    updated_by: "priya@brightloop.example",
  },
  {
    id: 4,
    name: "Legacy add-on",
    description: "An older add-on.",
    price_cents: 3_900,
    active: false,
    created_by: "alex@brightloop.example",
    updated_by: "priya@brightloop.example",
  },
];

function mockListFor(archivedIds: Set<number>): void {
  vi.mocked(api.products.list).mockImplementation((includeArchived = false) => {
    const current = products.map((product) => ({
      ...product,
      active: !archivedIds.has(product.id),
    }));
    return Promise.resolve(
      includeArchived ? current : current.filter((product) => product.active),
    );
  });
}

function renderProducts(initialEntry = "/products") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/products" element={<Products />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function LinkTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      go to {to}
    </button>
  );
}

function renderWithLink(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/products"
            element={
              <>
                <Products />
                <LinkTo to="/products?q=priority" />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function visibleNames(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

function rowFor(name: string): HTMLElement {
  const cell = screen.getByText(name);
  const row = cell.closest("tr");
  if (!row) {
    throw new Error(`No table row found for ${name}`);
  }
  return row;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  mockListFor(new Set([4]));
});

describe("Products page", () => {
  it("lists active products with prices, badges, attribution and six columns", async () => {
    renderProducts();

    expect(await screen.findByText("Starter license")).toBeTruthy();
    expect(visibleNames()).toEqual([
      "Starter license",
      "Priority support",
      "Onsite training day",
    ]);
    expect(screen.queryByText("Legacy add-on")).toBeNull();

    for (const header of [
      "Name",
      "Description",
      "Unit price",
      "Status",
      "Added by",
      "Last changed by",
    ]) {
      expect(screen.getByRole("button", { name: header }), header).toBeTruthy();
    }

    const starter = rowFor("Starter license");
    expect(within(starter).getByText("$49")).toBeTruthy();
    expect(within(starter).getByText("Active")).toBeTruthy();
    expect(
      within(starter).getAllByText("alex@brightloop.example"),
    ).toHaveLength(2);

    const support = rowFor("Priority support");
    expect(within(support).getByText("$149.50")).toBeTruthy();
    expect(within(support).getByText("priya@brightloop.example")).toBeTruthy();

    expect(
      within(rowFor("Onsite training day")).getByText("$1,200"),
    ).toBeTruthy();
    expect(within(rowFor("Onsite training day")).getByText("—")).toBeTruthy();
  });

  it("brings the archived rows back when Show archived is checked", async () => {
    renderProducts();
    await screen.findByText("Starter license");

    fireEvent.click(screen.getByRole("checkbox", { name: "Show archived" }));

    expect(await screen.findByText("Legacy add-on")).toBeTruthy();
    expect(visibleNames()).toEqual([
      "Starter license",
      "Priority support",
      "Onsite training day",
      "Legacy add-on",
    ]);
    expect(within(rowFor("Legacy add-on")).getByText("Archived")).toBeTruthy();
    expect(api.products.list).toHaveBeenCalledWith(true);
  });

  it("searches names and descriptions", async () => {
    renderProducts();
    await screen.findByText("Starter license");

    const search = screen.getByRole("searchbox", { name: "Search products" });
    fireEvent.change(search, { target: { value: "priority" } });
    expect(visibleNames()).toEqual(["Priority support"]);

    fireEvent.change(search, { target: { value: "single-team" } });
    expect(visibleNames()).toEqual(["Starter license"]);

    fireEvent.change(search, { target: { value: "" } });
    expect(visibleNames()).toHaveLength(3);
  });

  it("adds a product with a trimmed name, a null description and parsed cents", async () => {
    vi.mocked(api.products.create).mockResolvedValue(products[0]);
    renderProducts();
    await screen.findByText("Starter license");

    fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    const dialog = await screen.findByRole("dialog", { name: "Add product" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "  Workshop day  " },
    });
    fireEvent.change(within(dialog).getByLabelText("Unit price (USD)"), {
      target: { value: "1,250.50" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(api.products.create).toHaveBeenCalledWith({
        name: "Workshop day",
        description: null,
        price_cents: 125_050,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("pre-fills the edit form and saves its values", async () => {
    vi.mocked(api.products.update).mockResolvedValue(products[1]);
    renderProducts();
    await screen.findByText("Priority support");

    fireEvent.click(
      within(rowFor("Priority support")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Edit product" });

    expect(
      (within(dialog).getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Priority support");
    expect(
      (within(dialog).getByLabelText("Description") as HTMLTextAreaElement)
        .value,
    ).toBe("Same-day replies.");
    expect(
      (within(dialog).getByLabelText("Unit price (USD)") as HTMLInputElement)
        .value,
    ).toBe("$149.50");

    fireEvent.change(within(dialog).getByLabelText("Description"), {
      target: { value: "Same-day replies and a channel." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.products.update).toHaveBeenCalledWith(2, {
        name: "Priority support",
        description: "Same-day replies and a channel.",
        price_cents: 14_950,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps an archived product archived after an edit", async () => {
    mockListFor(new Set([4]));
    vi.mocked(api.products.update).mockResolvedValue(products[3]);
    renderProducts();
    await screen.findByText("Starter license");
    fireEvent.click(screen.getByRole("checkbox", { name: "Show archived" }));
    await screen.findByText("Legacy add-on");

    const archived = rowFor("Legacy add-on");
    expect(
      within(archived).getByRole("button", { name: "Restore" }),
    ).toBeTruthy();
    expect(
      within(archived).queryByRole("button", { name: "Archive" }),
    ).toBeNull();

    fireEvent.click(within(archived).getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit product" });
    fireEvent.change(within(dialog).getByLabelText("Unit price (USD)"), {
      target: { value: "45" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.products.update).toHaveBeenCalledWith(4, {
        name: "Legacy add-on",
        description: "An older add-on.",
        price_cents: 4_500,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(within(rowFor("Legacy add-on")).getByText("Archived")).toBeTruthy();
  });

  it("keeps the form open with a message when the price is invalid", async () => {
    renderProducts();
    await screen.findByText("Starter license");

    fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    const dialog = await screen.findByRole("dialog", { name: "Add product" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Workshop day" },
    });
    fireEvent.change(within(dialog).getByLabelText("Unit price (USD)"), {
      target: { value: "not a price" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    const alert = within(dialog).getByRole("alert");
    expect(alert.textContent).toBe(
      "Enter a price in US dollars, for example 49.50.",
    );
    expect(api.products.create).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Add product" })).toBeTruthy();
  });

  it("shows the API's duplicate message in the form", async () => {
    vi.mocked(api.products.create).mockRejectedValue(
      new Error('A product named "Priority support" already exists.'),
    );
    renderProducts();
    await screen.findByText("Starter license");

    fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    const dialog = await screen.findByRole("dialog", { name: "Add product" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "PRIORITY SUPPORT" },
    });
    fireEvent.change(within(dialog).getByLabelText("Unit price (USD)"), {
      target: { value: "149.50" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      'A product named "Priority support" already exists.',
    );
    expect(screen.getByRole("dialog", { name: "Add product" })).toBeTruthy();
  });

  it("archives an active product and the row leaves the list", async () => {
    const archivedIds = new Set<number>([4]);
    mockListFor(archivedIds);
    vi.mocked(api.products.archive).mockImplementation((id) => {
      archivedIds.add(id);
      return Promise.resolve(products.find((product) => product.id === id)!);
    });
    renderProducts();
    await screen.findByText("Starter license");

    fireEvent.click(
      within(rowFor("Starter license")).getByRole("button", {
        name: "Archive",
      }),
    );

    await waitFor(() => expect(api.products.archive).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(screen.queryByText("Starter license")).toBeNull(),
    );
    expect(visibleNames()).toEqual(["Priority support", "Onsite training day"]);
  });

  it("restores an archived product and the row becomes active", async () => {
    const archivedIds = new Set<number>([4]);
    mockListFor(archivedIds);
    vi.mocked(api.products.restore).mockImplementation((id) => {
      archivedIds.delete(id);
      return Promise.resolve(products.find((product) => product.id === id)!);
    });
    renderProducts();
    await screen.findByText("Starter license");
    fireEvent.click(screen.getByRole("checkbox", { name: "Show archived" }));
    await screen.findByText("Legacy add-on");

    fireEvent.click(
      within(rowFor("Legacy add-on")).getByRole("button", { name: "Restore" }),
    );

    await waitFor(() => expect(api.products.restore).toHaveBeenCalledWith(4));
    await waitFor(() =>
      expect(within(rowFor("Legacy add-on")).getByText("Active")).toBeTruthy(),
    );
  });

  it("leaves the row and shows a message when the action fails", async () => {
    vi.mocked(api.products.archive).mockRejectedValue(
      new Error("Could not archive the product."),
    );
    renderProducts();
    await screen.findByText("Starter license");

    fireEvent.click(
      within(rowFor("Starter license")).getByRole("button", {
        name: "Archive",
      }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not archive the product.");
    expect(screen.getByText("Starter license")).toBeTruthy();
    expect(api.products.list).toHaveBeenCalledTimes(1);
  });

  it("shows a loading message while the list is pending", () => {
    vi.mocked(api.products.list).mockImplementation(
      () => new Promise(() => {}),
    );
    renderProducts();

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("reports an error when the list fails to load", async () => {
    vi.mocked(api.products.list).mockRejectedValue(new Error("boom"));
    renderProducts();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not load products.");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the empty-state message when there are no products", async () => {
    vi.mocked(api.products.list).mockResolvedValue([]);
    renderProducts();

    expect(await screen.findByText("No records yet.")).toBeTruthy();
  });

  it("fills the table search from ?q=", async () => {
    renderProducts("/products?q=training");

    expect(await screen.findByText("Onsite training day")).toBeTruthy();
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Search products",
        }) as HTMLInputElement
      ).value,
    ).toBe("training");
    expect(visibleNames()).toEqual(["Onsite training day"]);
  });

  it("takes a new search while already on the page without losing Show archived", async () => {
    renderWithLink("/products?q=training");
    await screen.findByText("Onsite training day");

    fireEvent.click(screen.getByRole("checkbox", { name: "Show archived" }));
    await waitFor(() => expect(api.products.list).toHaveBeenCalledWith(true));
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Show archived",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "go to /products?q=priority" }),
    );

    expect(await screen.findByText("Priority support")).toBeTruthy();
    expect(screen.queryByText("Onsite training day")).toBeNull();
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Show archived",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search products" }),
      { target: { value: "" } },
    );
    expect(visibleNames()).toContain("Legacy add-on");
  });
});
