import { expect } from "@playwright/test";

import { resetSampleData, signIn, test } from "./helpers";

test.beforeAll(() => {
  resetSampleData();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

function searchBox(page: import("@playwright/test").Page) {
  return page.getByRole("textbox", { name: "Search" });
}

test("an organization, a contact and a deal found by part of a name in another case", async ({
  page,
}) => {
  const search = searchBox(page);
  const results = page.locator(".search-results");

  await search.fill("nOrThWi");
  await expect(
    results.getByRole("button", { name: "Northwind Traders" }),
  ).toBeVisible();
  await results.getByRole("button", { name: "Northwind Traders" }).click();
  await expect(page).toHaveURL(/\/organizations\/\d+/);
  await expect(
    page.getByRole("heading", { name: "Northwind Traders", level: 1 }),
  ).toBeVisible();

  await search.fill("aNa SiL");
  await expect(
    results.getByRole("button", { name: "Ana Silva" }),
  ).toBeVisible();
  await results.getByRole("button", { name: "Ana Silva" }).click();
  await expect(page).toHaveURL(/\/contacts\/\d+/);
  await expect(
    page.getByRole("heading", { name: "Ana Silva", level: 1 }),
  ).toBeVisible();

  await search.fill("sTOre RoLL");
  await expect(
    results.getByRole("button", { name: "Store rollout" }),
  ).toBeVisible();
  await search.press("Enter");
  await expect(page).toHaveURL(/\/deals\/\d+/);
  await expect(
    page.getByRole("heading", { name: "Store rollout", level: 1 }),
  ).toBeVisible();
});

test("the box clears on Escape", async ({ page }) => {
  const search = searchBox(page);

  await search.fill("north");
  await expect(page.locator(".search-results")).toBeVisible();

  await search.press("Escape");

  await expect(page.locator(".search-results")).toHaveCount(0);
  await expect(search).toHaveValue("");
});

test("a product match opens the Products table with its search filled", async ({
  page,
}) => {
  const search = searchBox(page);
  const results = page.locator(".search-results");

  await search.fill("priority");
  await expect(results.getByText("Products")).toBeVisible();
  await results.getByRole("button", { name: "Priority support" }).click();

  await expect(page).toHaveURL(/\/products\?q=Priority%20support/);
  await expect(
    page.getByRole("heading", { name: "Products", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText(
    "Priority support",
  );
  await expect(page.getByRole("searchbox")).toHaveValue("Priority support");
});

test("an archived product has no match in the top bar", async ({ page }) => {
  const search = searchBox(page);
  const answered = page.waitForResponse((response) =>
    response.url().includes("/api/search?q=legacy"),
  );

  await search.fill("legacy");
  await answered;

  await expect(page.locator(".search-results")).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/");
});

test("the per-table search still works", async ({ page }) => {
  await page.goto("/organizations");

  await page.getByRole("searchbox").fill("northwind");

  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Northwind Traders");
});
