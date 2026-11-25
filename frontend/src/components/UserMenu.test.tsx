import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSessionState, signInLocal } from "../lib/session";
import UserMenu from "./UserMenu";

function renderMenu() {
  render(
    <MemoryRouter>
      <UserMenu />
    </MemoryRouter>,
  );
}

function renderWithSettingsPage() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <UserMenu />
      <Routes>
        <Route path="/" element={<p>Home page</p>} />
        <Route path="/settings" element={<p>Settings page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function trigger() {
  return screen.getByRole("button", { name: "alex@brightloop.example" });
}

function open() {
  fireEvent.click(trigger());
}

beforeEach(async () => {
  vi.resetAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
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
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("UserMenu", () => {
  it("shows the initials on a button that names its person", () => {
    renderMenu();

    const button = trigger();
    expect(button.textContent).toBe("A");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the email, Settings, the three themes with the current one marked, and Sign out", () => {
    renderMenu();
    open();

    expect(screen.getByText("alex@brightloop.example")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    for (const label of ["Light", "Dark", "System"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(
      screen
        .getByRole("button", { name: "Light" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: "System" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("applies the choice and closes", () => {
    renderMenu();
    open();

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();

    open();
    expect(
      screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("opens Settings after the email and closes the menu", () => {
    renderWithSettingsPage();
    open();

    const email = screen.getByText("alex@brightloop.example");
    const settings = screen.getByRole("link", { name: "Settings" });
    const themes = screen.getByRole("group", { name: "Theme" });
    expect(settings.getAttribute("href")).toBe("/settings");
    expect(
      email.compareDocumentPosition(settings) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);
    expect(
      settings.compareDocumentPosition(themes) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);

    fireEvent.click(settings);

    expect(screen.getByText("Settings page")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("Escape closes the menu and returns focus to the button", () => {
    renderMenu();
    open();
    const signOutButton = screen.getByRole("button", { name: "Sign out" });
    signOutButton.focus();

    fireEvent.keyDown(signOutButton, { key: "Escape" });

    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("signs out when Sign out is clicked", () => {
    renderMenu();
    open();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(getSessionState().session).toBeNull();
    expect(getSessionState().message).toBeNull();
  });
});
