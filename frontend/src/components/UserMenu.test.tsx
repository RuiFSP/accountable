import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

  it("shows the email, the three themes with the current one marked, and Sign out", () => {
    renderMenu();
    open();

    expect(screen.getByText("alex@brightloop.example")).toBeTruthy();
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
