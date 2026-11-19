import { expect } from "@playwright/test";

import { resetSampleData, watchConsole, signIn, test } from "./helpers";

const sections = [
  { path: "/", label: "Dashboard" },
  { path: "/organizations", label: "Organizations" },
  { path: "/contacts", label: "Contacts" },
  { path: "/deals", label: "Deals" },
  { path: "/pipeline", label: "Pipeline" },
];

test.beforeAll(() => {
  resetSampleData();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the app starts on the dashboard with no console errors", async ({
  page,
}) => {
  const consoleErrors = watchConsole(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  for (const { label } of sections) {
    await expect(page.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(240, 244, 245)",
  );

  expect(consoleErrors()).toEqual([]);
});

test("every section shows the sample data", async ({ page }) => {
  await page.goto("/organizations");
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(page.locator("tbody tr").first()).toContainText(
    "Northwind Traders",
  );

  await page.goto("/contacts");
  await expect(page.locator("tbody tr")).toHaveCount(12);
  await expect(page.locator(".badge-customer").first()).toBeVisible();

  await page.goto("/deals");
  await expect(page.locator("tbody tr")).toHaveCount(14);
  await expect(page.locator(".badge-Won").first()).toBeVisible();

  await page.goto("/pipeline");
  for (const stage of [
    "New",
    "Qualified",
    "Proposal",
    "Negotiation",
    "Won",
    "Lost",
  ]) {
    await expect(page.locator(`[aria-label="${stage} column"]`)).toBeVisible();
  }
  await expect(page.locator(".deal-card")).toHaveCount(14);

  await page.goto("/");
  await expect(page.locator(".kpi-grid .kpi")).toHaveCount(4);
});

test("the API serves the sample data through the frontend", async ({
  request,
}) => {
  const organizations = await request.get("/api/organizations");
  expect(organizations.ok()).toBe(true);
  const records = (await organizations.json()) as { name: string }[];
  expect(records.length).toBeGreaterThan(0);

  const deals = await request.get("/api/deals");
  expect(deals.ok()).toBe(true);
  expect(((await deals.json()) as unknown[]).length).toBeGreaterThan(0);
});
