import { expect } from "@playwright/test";

import { resetSampleData, signIn, test } from "./helpers";

test.beforeAll(() => {
  resetSampleData();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

function stageMoveResponse(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/stage"),
  );
}

test("the board shows six columns and late deals stand out", async ({
  page,
  request,
}) => {
  const deals = (await (await request.get("/api/deals")).json()) as unknown[];
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
  await expect(page.locator(".deal-card")).toHaveCount(deals.length);
  await expect(
    page.locator(".deal-card.late", { hasText: "Delta renewal" }),
  ).toBeVisible();
  await expect(page.locator(".late-pill").first()).toBeVisible();

  // The deals table stands out too — intent: "in the table and on its card".
  await page.goto("/deals");
  const lateRow = page.locator("tbody tr", { hasText: "Delta renewal" });
  await expect(lateRow.locator(".late-pill")).toBeVisible();
  const aheadRow = page.locator("tbody tr", {
    hasText: "Bluebird brand refresh",
  });
  await expect(aheadRow.locator(".late-pill")).toHaveCount(0);
});

test("dragging a card to another column changes stage, probability and totals", async ({
  page,
}) => {
  await page.goto("/pipeline");
  const boardBefore = await page.locator(".board-header").innerText();
  const columnBefore = await page
    .locator('[aria-label="Qualified column"] .column-totals')
    .innerText();

  const moved = stageMoveResponse(page);
  await page.dragAndDrop(
    '.deal-card:has-text("Evergreen wholesale expansion")',
    '[aria-label="Qualified column"]',
    { steps: 12 },
  );
  expect((await moved).ok()).toBe(true);

  const card = page.locator(
    '.deal-card:has-text("Evergreen wholesale expansion")',
  );
  await expect(page.locator('[aria-label="Qualified column"]')).toContainText(
    "Evergreen wholesale expansion",
  );
  await expect(card).toContainText("25%"); // Qualified's default probability
  await expect(page.locator(".board-header")).not.toHaveText(boardBefore);
  await expect(
    page.locator('[aria-label="Qualified column"] .column-totals'),
  ).not.toHaveText(columnBefore);

  // The deals list agrees, after a fresh page load.
  await page.goto("/deals");
  const row = page.locator("tbody tr", {
    hasText: "Evergreen wholesale expansion",
  });
  await expect(row).toContainText("Qualified");
  await expect(row).toContainText("25%");
});

test("a card dropped within a column keeps its exact slot after a refresh", async ({
  page,
}) => {
  await page.goto("/pipeline");
  const column = page.locator(
    '[aria-label="Qualified column"] .deal-card-name',
  );
  await expect(
    page.locator('[aria-label="Qualified column"] .deal-card').first(),
  ).toBeVisible();
  const before = await column.allInnerTexts();
  expect(before.length).toBeGreaterThanOrEqual(3);

  const cards = page.locator('[aria-label="Qualified column"] .deal-card');
  await cards.first().scrollIntoViewIfNeeded();
  await cards.nth(1).scrollIntoViewIfNeeded();

  const moved = stageMoveResponse(page);
  await cards.first().dragTo(cards.nth(1), { steps: 12 });
  expect((await moved).ok()).toBe(true);

  const after = await column.allInnerTexts();
  expect(after[0]).toBe(before[1]);
  expect(after[1]).toBe(before[0]);

  await page.reload();
  await expect(
    page.locator('[aria-label="Qualified column"] .deal-card').first(),
  ).toBeVisible();
  expect(await column.allInnerTexts()).toEqual(after);
});

test("a deal added straight into a column starts at that stage", async ({
  page,
}) => {
  await page.goto("/pipeline");
  await page
    .locator('[aria-label="Negotiation column"] .column-head .link-button')
    .click();

  const modal = page.getByRole("dialog", { name: "Add deal" });
  await expect(modal.getByLabel("Stage")).toHaveValue("Negotiation");
  await modal.getByLabel("Name", { exact: true }).fill("Column entry deal");
  await modal.getByLabel("Organization").selectOption({ index: 1 });
  await modal.getByLabel("Contact").selectOption({ index: 1 });
  await modal.getByLabel("Value (USD)").fill("2,500");
  await modal.getByLabel("Close date").fill("2027-04-01");

  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/api/deals"),
  );
  await modal.getByRole("button", { name: "Add", exact: true }).click();
  expect((await created).ok()).toBe(true);

  await expect(
    page.locator(
      '[aria-label="Negotiation column"] .deal-card:has-text("Column entry deal")',
    ),
  ).toBeVisible();
  await expect(
    page.locator(
      '[aria-label="Negotiation column"] .deal-card:has-text("Column entry deal")',
    ),
  ).toContainText("75%"); // Negotiation's default probability
});
