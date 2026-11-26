import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signInLocal, signOut } from "./lib/session";
import { AppRoutes } from "./routes";

/** Sign in the way the screen does, then leave fetch alone for the pages. */
async function signInForTests(): Promise<void> {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: "local-token",
        email: "alex@brightloop.example",
      }),
    }),
  );
  await signInLocal("alex");
  vi.unstubAllGlobals();
}

afterEach(cleanup);

beforeEach(async () => {
  await signInForTests();
});

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("signed out", () => {
  it("shows the sign-in screen with no top bar at any address", async () => {
    for (const path of ["/", "/contacts/5", "/settings", "/nowhere"]) {
      signOut();
      renderAt(path);

      expect(
        await screen.findByRole("heading", { name: "Accountable" }),
        path,
      ).toBeTruthy();
      expect(screen.queryByRole("navigation"), path).toBeNull();
      expect(
        screen.queryByRole("button", { name: "New deal" }),
        path,
      ).toBeNull();
      cleanup();
    }
  });
});

describe("app shell", () => {
  it("lands on the dashboard with links to every section", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    for (const label of [
      "Dashboard",
      "Organizations",
      "Contacts",
      "Deals",
      "Products",
      "Pipeline",
      "Money",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
  });

  it("opens the Money tabs from its section link", () => {
    renderAt("/money");

    expect(screen.getByRole("heading", { name: "Quotes" })).toBeTruthy();
    for (const label of ["Quotes", "Invoices", "Bills"]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
  });

  it("opens Quotes for an unknown Money tab", () => {
    renderAt("/money/nowhere");

    expect(screen.getByRole("heading", { name: "Quotes" })).toBeTruthy();
  });

  it("holds the search box in the top bar, between the nav and the actions", () => {
    renderAt("/");

    const topbar = screen.getByRole("banner");
    const search = within(topbar).getByRole("textbox", { name: "Search" });
    const nav = within(topbar).getByRole("navigation");
    const actions = within(topbar).getByRole("button", { name: "New deal" });

    expect(
      nav.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);
    expect(
      search.compareDocumentPosition(actions) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);
  });

  it("shows a section when its link is clicked", () => {
    renderAt("/");

    fireEvent.click(screen.getByRole("link", { name: "Organizations" }));

    expect(screen.getByRole("heading", { name: "Organizations" })).toBeTruthy();
  });

  it("sends unknown paths to the dashboard", () => {
    renderAt("/nowhere");

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
  });
});

describe("user menu", () => {
  const topBarPaths = [
    "/",
    "/organizations",
    "/contacts",
    "/deals",
    "/products",
    "/pipeline",
    "/money",
    "/money/quotes",
    "/money/invoices",
    "/money/bills",
    "/settings",
    "/organizations/1",
    "/contacts/1",
    "/deals/1",
  ];

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("holds the nav, the search box and the menu, and no dark-mode switch, on every page", () => {
    for (const path of topBarPaths) {
      renderAt(path);

      const topbar = screen.getByRole("banner");
      expect(within(topbar).getByRole("navigation"), path).toBeTruthy();
      expect(
        within(topbar).getByRole("textbox", { name: "Search" }),
        path,
      ).toBeTruthy();
      expect(
        within(topbar).getByRole("button", { name: "alex@brightloop.example" }),
        path,
      ).toBeTruthy();
      expect(
        screen.queryByRole("switch", { name: "Dark mode" }),
        path,
      ).toBeNull();
      expect(
        within(topbar).queryByRole("link", { name: "Settings" }),
        path,
      ).toBeNull();
      cleanup();
    }
  });

  it("opens the Settings page from the menu", () => {
    renderAt("/");

    fireEvent.click(
      screen.getByRole("button", { name: "alex@brightloop.example" }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Settings" }));

    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("applies the theme chosen from the menu, then closes", () => {
    renderAt("/");

    fireEvent.click(
      screen.getByRole("button", { name: "alex@brightloop.example" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Dark$/ }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});
