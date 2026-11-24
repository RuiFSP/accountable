import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  expect,
  test as base,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

// The database playwright.config.ts points the servers at. scripts/e2e.mjs
// gives every run its own, so two runs can't reset each other's data. Computed
// here too, so a spec can never accidentally reset the real data.
const E2E_DATABASE = path.resolve(
  process.env.ACCOUNTABLE_DB ?? "accountable-e2e.db",
);

/**
 * Reload the sample data, so every spec file starts from a known state.
 * Runs the real `npm run seed` command — confirmation included — against the
 * e2e database only.
 */
export function resetSampleData(): void {
  const result = spawnSync("npm", ["run", "seed"], {
    input: "y\n",
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, ACCOUNTABLE_DB: E2E_DATABASE },
  });
  if (result.status !== 0) {
    throw new Error(`npm run seed failed:\n${result.stderr || result.stdout}`);
  }
}

/** Collect console errors and page errors; assert the list is empty at the end. */
export function watchConsole(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return () => errors;
}

/** A local "YYYY-MM-DD" date offset from today, for follow-up fields. */
export function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const CHECKED_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);

/**
 * Whether a URL stays on this machine. A URL that can't be read is not one
 * we trust: the tests never touch Supabase or anything else out there
 * (docs/changes/multi-user/intent.md).
 */
export function isLocal(url: string, base?: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return false;
  }
  if (!CHECKED_PROTOCOLS.has(parsed.protocol)) {
    return true;
  }
  return LOCAL_HOSTS.has(parsed.hostname);
}

/** Sign in on the page by picking a made-up teammate, as a person would. */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /Alex Rivera/ }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}

/** The teammate every spec signs in as; the menu button carries the email. */
export const SIGNED_IN_AS = "alex@brightloop.example";

/** Open the user menu and pick a theme, as a person would. */
export async function chooseTheme(
  page: Page,
  label: "Light" | "Dark" | "System",
): Promise<void> {
  await page.getByRole("button", { name: SIGNED_IN_AS }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
}

const API_URL_METHODS = new Set([
  "fetch",
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
]);

/** The API requests of a test, refusing any URL beyond this machine. */
function guardApi(
  api: APIRequestContext,
  baseURL: string | undefined,
): APIRequestContext {
  return new Proxy(api, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value !== "function") {
        return value;
      }
      const method = String(property);
      const bound = (value as (...args: unknown[]) => unknown).bind(target);
      if (!API_URL_METHODS.has(method)) {
        return bound;
      }
      return (...args: unknown[]) => {
        if (!isLocal(String(args[0]), baseURL)) {
          throw new Error(
            `This test tried to leave the machine: ${String(args[0])}`,
          );
        }
        return bound(...args);
      };
    },
  });
}

/**
 * Every spec runs behind two guards: the browser may only talk to this
 * machine, and a spec's API `request` calls arrive signed in with the local
 * token. A test that wants to see a refusal clears the header itself
 * (e2e/security.spec.ts).
 */
export const test = base.extend({
  context: async ({ context }, provide) => {
    const left: string[] = [];
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (isLocal(url)) {
        return route.continue();
      }
      left.push(url);
      return route.abort();
    });
    await provide(context);
    if (left.length > 0) {
      throw new Error(
        `This test tried to leave the machine: ${left.join(", ")}`,
      );
    }
  },
  request: async ({ playwright, baseURL }, provide) => {
    const signInContext = await playwright.request.newContext({ baseURL });
    const token = await signInContext
      .post("/api/local/sign-in", { data: { user_id: "alex" } })
      .then(async (response) => {
        if (!response.ok()) {
          throw new Error(
            `local sign-in failed with status ${response.status()}`,
          );
        }
        return ((await response.json()) as { token: string }).token;
      })
      .finally(() => signInContext.dispose());

    const api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    try {
      await provide(guardApi(api, baseURL));
    } finally {
      await api.dispose();
    }
  },
});
