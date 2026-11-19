import { expect } from "@playwright/test";

import { resetSampleData, signIn, test } from "./helpers";

test.beforeAll(() => {
  resetSampleData();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("contacts filter by status", async ({ page }) => {
  await page.goto("/contacts");
  const filter = page.getByRole("combobox", { name: "Status" });

  await filter.selectOption("lead");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  for (const row of await page.locator("tbody tr").allInnerTexts()) {
    expect(row).toContain("Lead");
  }

  await filter.selectOption("qualified");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  for (const row of await page.locator("tbody tr").allInnerTexts()) {
    expect(row).toContain("Qualified");
  }

  await filter.selectOption("customer");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  for (const row of await page.locator("tbody tr").allInnerTexts()) {
    expect(row).toContain("Customer");
  }

  await filter.selectOption("");
  await expect(page.locator("tbody tr")).toHaveCount(12);
});

test("a contact's page shows its organization and timeline", async ({
  page,
}) => {
  await page.goto("/contacts");
  await page
    .locator("tbody tr", { hasText: "Ana Silva" })
    .getByRole("button", { name: "View" })
    .click();
  await page.waitForURL(/\/contacts\/\d+/);

  await expect(page.locator(".page-title h1")).toHaveText("Ana Silva");
  await expect(page.locator(".detail-grid")).toContainText("Northwind Traders");
  await expect(page.locator(".timeline-item").first()).toContainText(
    "Sent the renewal summary for the pilot stores.",
  );
});

test("an organization's page lists its contacts and deals", async ({
  page,
}) => {
  await page.goto("/organizations");
  await page
    .locator("tbody tr", { hasText: "Northwind Traders" })
    .getByRole("button", { name: "View" })
    .click();
  await page.waitForURL(/\/organizations\/\d+/);

  await expect(page.locator(".page-title h1")).toHaveText("Northwind Traders");
  await expect(page.getByText("Ana Silva")).toBeVisible();
  await expect(page.getByText("Grace Kim")).toBeVisible();
  await expect(page.getByText("Northwind store rollout")).toBeVisible();
  await expect(page.getByText("Northwind e-commerce add-on")).toBeVisible();
});

test("a deal's page shows its linked records and timeline", async ({
  page,
}) => {
  await page.goto("/deals");
  await page
    .locator("tbody tr", { hasText: "Cobalt records migration" })
    .getByRole("button", { name: "View" })
    .click();
  await page.waitForURL(/\/deals\/\d+/);

  await expect(page.locator(".page-title h1")).toHaveText(
    "Cobalt records migration",
  );
  await expect(page.locator(".detail-grid")).toContainText("Cobalt Health");
  await expect(page.locator(".detail-grid")).toContainText("Diego Ramirez");
  await expect(page.locator(".timeline-item").first()).toContainText(
    "Walked through the migration timeline with Diego.",
  );
});

test("linked records open from the detail pages", async ({ page }) => {
  await page.goto("/contacts");
  await page
    .locator("tbody tr", { hasText: "Ana Silva" })
    .getByRole("button", { name: "View" })
    .click();

  await page
    .locator(".detail-grid")
    .getByRole("link", { name: "Northwind Traders" })
    .click();
  await page.waitForURL(/\/organizations\/\d+/);
  await expect(page.locator(".page-title h1")).toHaveText("Northwind Traders");
});
