import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { AppRoutes } from "./routes";

afterEach(cleanup);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
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
