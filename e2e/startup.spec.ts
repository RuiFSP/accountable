import { expect } from "@playwright/test";

import { resetSampleData, watchConsole, signIn, test } from "./helpers";

const sections = [
  { path: "/", label: "Dashboard" },
  { path: "/organizations", label: "Organizations" },
  { path: "/contacts", label: "Contacts" },
  { path: "/deals", label: "Deals" },
  { path: "/products", label: "Products" },
  { path: "/pipeline", label: "Pipeline" },
  { path: "/money", label: "Money" },
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

test("every section shows the sample data", async ({ page, request }) => {
  const count = async (resource: string): Promise<number> =>
    ((await (await request.get(`/api/${resource}`)).json()) as unknown[])
      .length;

  const organizations = await count("organizations");
  const contacts = await count("contacts");
  const deals = await count("deals");

  await page.goto("/organizations");
  await expect(page.locator("tbody tr")).toHaveCount(organizations);
  await expect(page.locator("tbody tr").first()).toContainText(
    "Northwind Traders",
  );

  await page.goto("/contacts");
  await expect(page.locator("tbody tr")).toHaveCount(contacts);
  await expect(page.locator(".badge-customer").first()).toBeVisible();

  await page.goto("/deals");
  await expect(page.locator("tbody tr")).toHaveCount(deals);
  await expect(page.locator(".badge-Won").first()).toBeVisible();

  await page.goto("/products");
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(page.locator(".badge-active").first()).toBeVisible();

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
  await expect(page.locator(".deal-card")).toHaveCount(deals);

  await page.goto("/");
  for (const label of [
    "Revenue won",
    "Open pipeline",
    "Expected revenue",
    "Overdue follow-ups",
  ]) {
    await expect(page.locator(".kpi").filter({ hasText: label })).toBeVisible();
  }
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

  const products = await request.get("/api/products");
  expect(products.ok()).toBe(true);
  const productRecords = (await products.json()) as { name: string }[];
  expect(productRecords).toHaveLength(10);

  const archived = await request.get("/api/products?include_archived=true");
  expect(archived.ok()).toBe(true);
  expect(((await archived.json()) as unknown[]).length).toBe(12);
});
