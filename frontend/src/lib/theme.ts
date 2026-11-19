/**
 * The remembered theme: `light`, `dark`, or `system` — the device's own
 * setting. The choice lives in localStorage under `theme` (an old `light` or
 * `dark` from before `system` existed still applies), while what's on screen
 * is always one of the two and goes to `data-theme` on <html>, which
 * brand.css scopes its palette to. index.html applies it before first paint,
 * so a System reload never flashes the wrong mode.
 */

/** What is actually on screen. */
export type Theme = "light" | "dark";

/** What the user chose: a mode, or the device's. */
export type ThemeChoice = Theme | "system";

/** Must match the key the blocking script in index.html reads. */
export const THEME_STORAGE_KEY = "theme";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** What the device is set to right now. */
function deviceTheme(): Theme {
  return window.matchMedia?.(MEDIA_QUERY)?.matches ? "dark" : "light";
}

/**
 * The remembered choice: no choice, an unknown value or denied storage all
 * give Light.
 */
export function getThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "light";
  } catch {
    return "light";
  }
}

/** The mode a choice puts on screen: the device's while it's System. */
function modeOf(choice: ThemeChoice): Theme {
  return choice === "system" ? deviceTheme() : choice;
}

/** The mode on screen: the choice, or the device's while it's System. */
export function getTheme(): Theme {
  return modeOf(getThemeChoice());
}

/** Remember the choice and put its mode on <html>. */
export function setTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Can't remember it, but the choice still applies for this session.
  }
  document.documentElement.setAttribute("data-theme", modeOf(choice));
}

/**
 * While System is the choice, follow the device as it changes. Returns the
 * way to stop following.
 */
export function followDeviceTheme(): () => void {
  const media = window.matchMedia?.(MEDIA_QUERY);
  if (!media) {
    return () => undefined;
  }
  const changed = () => {
    if (getThemeChoice() === "system") {
      document.documentElement.setAttribute("data-theme", getTheme());
    }
  };
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
}
