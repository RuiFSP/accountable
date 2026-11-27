import { expect } from "@playwright/test";

import {
  isLocal,
  resetSampleData,
  signIn,
  test,
  watchConsole,
} from "./helpers";

test.beforeAll(() => {
  resetSampleData();
});

test("the guard knows this machine from anywhere else", () => {
  const apiPort = process.env.ACCOUNTABLE_API_PORT ?? "8000";
  const webPort = process.env.ACCOUNTABLE_WEB_PORT ?? "5173";

  expect(isLocal(`http://localhost:${apiPort}/api/organizations`)).toBe(true);
  expect(isLocal(`http://127.0.0.1:${webPort}/`)).toBe(true);
  expect(isLocal("/api/deals", `http://localhost:${webPort}`)).toBe(true);
  expect(isLocal("https://project.supabase.co/auth/v1/token")).toBe(false);
  expect(isLocal("http://10.0.0.0/")).toBe(false);
});

test("every sampled API route refuses without a token", async ({ page }) => {
  await page.goto("/");

  const sample = [
    "/api/organizations",
    "/api/contacts",
    "/api/deals",
    "/api/activities",
    "/api/products",
    "/api/dashboard",
    "/api/settings",
    "/api/bills",
  ];
  for (const path of sample) {
    const reply = await page.evaluate(async (route) => {
      const response = await fetch(route);
      const body = (await response.json()) as { detail?: string };
      return { status: response.status, detail: body.detail };
    }, path);

    expect(reply.status, path).toBe(401);
    expect(reply.detail, path).toBe("Sign in to use Accountable.");
  }
});

test("signed in, the API answers as it did before", async ({ request }) => {
  const organizations = await request.get("/api/organizations");

  expect(organizations.ok()).toBe(true);
  expect((await organizations.json()).length).toBeGreaterThan(0);

  const products = await request.get("/api/products");
  expect(products.ok()).toBe(true);
  expect(((await products.json()) as unknown[]).length).toBe(10);
});

test("a signed-in walk produces no console errors", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  const organizations = (await (
    await request.get("/api/organizations")
  ).json()) as unknown[];

  await signIn(page);
  await page.goto("/organizations");
  await expect(page.locator("tbody tr")).toHaveCount(organizations.length);

  expect(consoleErrors()).toEqual([]);
});
