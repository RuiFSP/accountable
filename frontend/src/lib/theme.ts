/**
 * The remembered theme: localStorage only, never the device's preference
 * (docs/changes/dark-mode/intent.md). Light is the default; the choice is
 * written to `data-theme` on <html>, which brand.css scopes its dark
 * palette to. index.html applies the stored value before first paint.
 */

export type Theme = "light" | "dark";

/** Must match the key the blocking script in index.html reads. */
export const THEME_STORAGE_KEY = "theme";

export function getTheme(): Theme {
  return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
