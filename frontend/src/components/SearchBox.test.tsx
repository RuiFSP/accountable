import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type SearchResult } from "../api/client";
import SearchBox from "./SearchBox";

vi.mock("../api/client", () => ({
  api: { search: { find: vi.fn() } },
}));

function At() {
  const location = useLocation();
  return <div data-testid="at">{location.pathname + location.search}</div>;
}

function renderBox() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <SearchBox />
      <At />
    </MemoryRouter>,
  );
}

function type(text: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Search" }), {
    target: { value: text },
  });
}

function press(key: string) {
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Search" }), { key });
}

/** A promise whose answer the test hands over when it chooses to. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  const box: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>((resolve) => {
    box.resolve = resolve;
  });
  return { promise, resolve: (value: T) => box.resolve?.(value) };
}

const deal: SearchResult = { kind: "deal", id: 9, name: "Store rollout" };
const contact: SearchResult = { kind: "contact", id: 1, name: "Ana Silva" };
const organization: SearchResult = {
  kind: "organization",
  id: 7,
  name: "Northwind Traders",
};
const product: SearchResult = {
  kind: "product",
  id: 12,
  name: "Priority support",
};

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(cleanup);

describe("SearchBox", () => {
  it("asks nothing before the pause has passed", async () => {
    vi.mocked(api.search.find).mockResolvedValue([]);
    renderBox();

    type("north");
    expect(api.search.find).not.toHaveBeenCalled();

    await waitFor(() => expect(api.search.find).toHaveBeenCalledWith("north"));
  });

  it("a late reply never replaces a newer one", async () => {
    const older = deferred<SearchResult[]>();
    const newer = deferred<SearchResult[]>();
    vi.mocked(api.search.find)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    renderBox();

    type("n");
    await waitFor(() => expect(api.search.find).toHaveBeenCalledTimes(1));
    type("no");
    await waitFor(() => expect(api.search.find).toHaveBeenCalledTimes(2));

    newer.resolve([deal]);
    await screen.findByText("Store rollout");
    older.resolve([contact]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByText("Ana Silva")).toBeNull();
    expect(screen.getByText("Store rollout")).toBeTruthy();
  });

  it("groups the matches with their kind shown", async () => {
    vi.mocked(api.search.find).mockResolvedValue([
      deal,
      organization,
      contact,
      product,
    ]);
    renderBox();

    type("a");
    await screen.findByText("Store rollout");

    expect(screen.getByText("Organizations")).toBeTruthy();
    expect(screen.getByText("Contacts")).toBeTruthy();
    expect(screen.getByText("Deals")).toBeTruthy();
    expect(screen.getByText("Products")).toBeTruthy();
    expect(screen.getByText("Northwind Traders")).toBeTruthy();
    expect(screen.getByText("Ana Silva")).toBeTruthy();
    expect(screen.getByText("Priority support")).toBeTruthy();
  });

  it("opens a match on click", async () => {
    vi.mocked(api.search.find).mockResolvedValue([deal]);
    renderBox();

    type("roll");
    await screen.findByText("Store rollout");
    fireEvent.click(screen.getByRole("button", { name: "Store rollout" }));

    expect(screen.getByTestId("at").textContent).toBe("/deals/9");
    expect(
      (screen.getByRole("textbox", { name: "Search" }) as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("opens the first match on Enter", async () => {
    vi.mocked(api.search.find).mockResolvedValue([contact, deal]);
    renderBox();

    type("a");
    await screen.findByText("Ana Silva");
    press("Enter");

    expect(screen.getByTestId("at").textContent).toBe("/contacts/1");
  });

  it("opens a product on the table's search by click and by Enter", async () => {
    vi.mocked(api.search.find).mockResolvedValue([product]);
    renderBox();

    type("prio");
    await screen.findByText("Priority support");
    fireEvent.click(screen.getByRole("button", { name: "Priority support" }));

    expect(screen.getByTestId("at").textContent).toBe(
      "/products?q=Priority%20support",
    );
    expect(
      (screen.getByRole("textbox", { name: "Search" }) as HTMLInputElement)
        .value,
    ).toBe("");

    type("prio");
    await screen.findByText("Priority support");
    press("Enter");

    expect(screen.getByTestId("at").textContent).toBe(
      "/products?q=Priority%20support",
    );
  });

  it("closes the results on Escape", async () => {
    vi.mocked(api.search.find).mockResolvedValue([deal]);
    renderBox();

    type("roll");
    await screen.findByText("Store rollout");
    press("Escape");

    expect(screen.queryByText("Store rollout")).toBeNull();
    expect(
      (screen.getByRole("textbox", { name: "Search" }) as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("clears the results when the box is emptied", async () => {
    vi.mocked(api.search.find).mockResolvedValue([deal]);
    renderBox();

    type("roll");
    await screen.findByText("Store rollout");
    type("");

    expect(screen.queryByText("Store rollout")).toBeNull();
    expect(api.search.find).toHaveBeenCalledTimes(1);

    // Nothing left to open: Enter must not go anywhere.
    press("Enter");
    expect(screen.getByTestId("at").textContent).toBe("/");
  });

  it("a question that fails leaves nothing stale behind", async () => {
    vi.mocked(api.search.find)
      .mockResolvedValueOnce([deal])
      .mockRejectedValueOnce(new Error("the network gave up"));
    renderBox();

    type("roll");
    await screen.findByText("Store rollout");
    type("north");
    await waitFor(() => expect(api.search.find).toHaveBeenCalledTimes(2));

    // The first answer belonged to the other text: it must not survive the
    // failure, and Enter must not be able to open it.
    await waitFor(() => expect(screen.queryByText("Store rollout")).toBeNull());
    press("Enter");
    expect(screen.getByTestId("at").textContent).toBe("/");
  });
});
