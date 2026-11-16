import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTheme, setTheme, THEME_STORAGE_KEY, toggleTheme } from "./theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme", () => {
  it("starts light on a fresh browser without consulting the OS", () => {
    const matchMedia = vi.fn();
    vi.stubGlobal("matchMedia", matchMedia);

    expect(getTheme()).toBe("light");
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it("toggles to dark, writes the choice and marks <html>", () => {
    expect(toggleTheme()).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    expect(toggleTheme()).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("round-trips a stored choice", () => {
    setTheme("dark");
    expect(getTheme()).toBe("dark");

    setTheme("light");
    expect(getTheme()).toBe("light");
  });

  it("falls back to light on an unknown stored value", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");

    expect(getTheme()).toBe("light");
  });

  it("reads the same storage key from index.html's blocking script", () => {
    const frontendDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    const html = fs.readFileSync(path.join(frontendDir, "index.html"), "utf8");

    expect(html).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
    expect(html).toContain('setAttribute("data-theme"');
  });
});
