import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  followDeviceTheme,
  getTheme,
  getThemeChoice,
  setTheme,
  THEME_STORAGE_KEY,
} from "./theme";

const indexHtml = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../index.html",
);

/** The device's colour scheme, standable-in and able to change mid-test. */
function stubDevice(colorScheme: "light" | "dark") {
  const listeners = new Set<() => void>();
  const media = {
    matches: colorScheme === "dark",
    addEventListener: (_event: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: () => void) => {
      listeners.delete(listener);
    },
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
  return {
    changeTo(next: "light" | "dark") {
      media.matches = next === "dark";
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

/** index.html's blocking script, run the way the browser runs it before paint. */
function runEarlyScript(): void {
  const html = fs.readFileSync(indexHtml, "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) {
    throw new Error("index.html has no blocking script");
  }
  new Function(script)();
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("theme", () => {
  it("saves and reads back Light, Dark and System", () => {
    for (const choice of ["light", "dark", "system"] as const) {
      setTheme(choice);

      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(choice);
      expect(getThemeChoice()).toBe(choice);
    }
  });

  it("carries over an old saved Light or Dark", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(getThemeChoice()).toBe("dark");

    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(getThemeChoice()).toBe("light");
  });

  it("gives Light with no choice, an unknown one, or denied storage", () => {
    expect(getThemeChoice()).toBe("light");
    expect(getTheme()).toBe("light");

    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(getThemeChoice()).toBe("light");

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage denied");
    });
    expect(getThemeChoice()).toBe("light");
    expect(getTheme()).toBe("light");
  });

  it("starts light on a fresh browser without consulting the OS", () => {
    const matchMedia = vi.fn();
    vi.stubGlobal("matchMedia", matchMedia);

    expect(getTheme()).toBe("light");
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it("still marks <html> when writing storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage denied");
    });

    expect(() => setTheme("dark")).not.toThrow();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("follows the device while System is chosen, and only then", () => {
    const device = stubDevice("light");
    setTheme("system");
    const stop = followDeviceTheme();

    device.changeTo("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    device.changeTo("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    stop();
    device.changeTo("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("keeps a chosen mode while the device changes", () => {
    const device = stubDevice("light");
    setTheme("dark");
    const stop = followDeviceTheme();

    device.changeTo("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    stop();
  });

  it("runs index.html's blocking script in step with theme.ts", () => {
    const cases: {
      stored: string | null;
      device: "light" | "dark";
      mode: "light" | "dark";
    }[] = [
      { stored: null, device: "light", mode: "light" },
      { stored: "light", device: "dark", mode: "light" },
      { stored: "dark", device: "light", mode: "dark" },
      { stored: "system", device: "light", mode: "light" },
      { stored: "system", device: "dark", mode: "dark" },
      { stored: "sepia", device: "dark", mode: "light" },
    ];

    for (const { stored, device, mode } of cases) {
      const name = `stored=${stored ?? "none"} device=${device}`;
      localStorage.clear();
      if (stored) {
        localStorage.setItem(THEME_STORAGE_KEY, stored);
      }
      stubDevice(device);
      document.documentElement.removeAttribute("data-theme");

      runEarlyScript();

      expect(document.documentElement.getAttribute("data-theme"), name).toBe(
        mode,
      );
      expect(getTheme(), name).toBe(mode);
    }
  });
});
