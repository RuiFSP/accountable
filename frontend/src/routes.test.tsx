import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppRoutes } from "./routes";

afterEach(cleanup);

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

describe("app shell", () => {
  it("lands on the dashboard with links to the five sections", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    for (const label of [
      "Dashboard",
      "Organizations",
      "Contacts",
      "Deals",
      "Pipeline",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
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

describe("theme toggle", () => {
  const topBarPaths = [
    "/",
    "/organizations",
    "/contacts",
    "/deals",
    "/pipeline",
    "/organizations/1",
    "/contacts/1",
    "/deals/1",
  ];

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("sits in the top bar with an accessible name on every page", () => {
    for (const path of topBarPaths) {
      renderAt(path);

      expect(
        screen.getByRole("switch", { name: "Dark mode" }),
        path,
      ).toBeTruthy();
      cleanup();
    }
  });

  it("reads light on a fresh load", () => {
    renderAt("/");

    const toggle = screen.getByRole("switch", { name: "Dark mode" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("flips data-theme on <html> when clicked", () => {
    renderAt("/");

    const toggle = screen.getByRole("switch", { name: "Dark mode" });
    fireEvent.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});
