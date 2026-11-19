import { expect } from "@playwright/test";

import { isoDaysFromNow, resetSampleData, signIn, test } from "./helpers";

test.beforeAll(() => {
  resetSampleData();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("a logged activity with a follow-up appears on the timeline, newest first", async ({
  page,
}) => {
  await page.goto("/contacts");
  await page
    .locator("tbody tr", { hasText: "Diego Ramirez" })
    .getByRole("button", { name: "View" })
    .click();
  await page.waitForURL(/\/contacts\/\d+/);

  await page.getByRole("button", { name: "Log activity" }).click();
  const modal = page.getByRole("dialog", { name: "Log activity" });
  await modal.getByLabel("Type").selectOption("call");
  await modal.getByLabel("Description").fill("E2E follow-up call");
  await modal.getByLabel("Follow-up", { exact: true }).fill(isoDaysFromNow(3));
  await modal.getByRole("button", { name: "Log", exact: true }).click();

  const items = page.locator(".timeline-item");
  await expect(items.first()).toContainText("E2E follow-up call");
  await expect(items.first()).toContainText("Follow-up:");
  // The entry says who logged it.
  await expect(items.first()).toContainText("alex@brightloop.example");
  // The sample activity is older, so it sits below the new one.
  await expect(items.nth(1)).toContainText(
    "Sent the revised scope and pricing for review.",
  );

  await page.reload();
  await expect(items.first()).toContainText("E2E follow-up call");
});

test("a stage move adds its own read-only entry to the deal's timeline", async ({
  page,
}) => {
  await page.goto("/pipeline");
  const moved = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/stage"),
  );
  await page.dragAndDrop(
    '.deal-card:has-text("Delta cold-chain tracking")',
    '[aria-label="Qualified column"]',
    { steps: 12 },
  );
  expect((await moved).ok()).toBe(true);

  await page.goto("/deals");
  await page
    .locator("tbody tr", { hasText: "Delta cold-chain tracking" })
    .getByRole("button", { name: "View" })
    .click();
  await page.waitForURL(/\/deals\/\d+/);

  const entry = page.locator(".timeline-item", {
    hasText: "Moved from New to Qualified",
  });
  await expect(entry).toBeVisible();
  await expect(entry.locator(".type-tag")).toHaveText("Stage change");
  await expect(entry.locator(".timeline-actions")).toHaveCount(0); // read-only
  // The move went down to whoever dragged the card.
  await expect(entry).toContainText("alex@brightloop.example");

  // The same entry shows up in the dashboard's recent activity.
  await page.goto("/");
  await expect(page.locator(".activity-list")).toContainText(
    "Moved from New to Qualified",
  );
});

test("follow-ups show on the dashboard until they are marked done", async ({
  page,
}) => {
  await page.goto("/");

  const followUp = page.locator(".followup-row", {
    hasText: "E2E follow-up call",
  });
  await expect(followUp).toBeVisible();

  await followUp.locator(".followup-check").click();
  await expect(
    page.locator(".followup-row", { hasText: "E2E follow-up call" }),
  ).toHaveCount(0);

  // Marking done persists across a reload.
  await page.reload();
  await expect(
    page.locator(".followup-row", { hasText: "E2E follow-up call" }),
  ).toHaveCount(0);
});

test("activities can be edited and deleted from the timeline", async ({
  page,
}) => {
  await page.goto("/contacts");
  await page
    .locator("tbody tr", { hasText: "Diego Ramirez" })
    .getByRole("button", { name: "View" })
    .click();

  const item = page.locator(".timeline-item", {
    hasText: "E2E follow-up call",
  });
  await item.getByRole("button", { name: "Edit" }).click();
  const editModal = page.getByRole("dialog", { name: "Edit activity" });
  await editModal.getByLabel("Description").fill("E2E follow-up call, edited");
  await editModal.getByRole("button", { name: "Save" }).click();
  await expect(
    page.locator(".timeline-item", { hasText: "E2E follow-up call, edited" }),
  ).toBeVisible();

  await page
    .locator(".timeline-item", { hasText: "E2E follow-up call, edited" })
    .getByRole("button", { name: "Delete" })
    .click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.locator(".timeline-item", { hasText: "E2E follow-up call, edited" }),
  ).toHaveCount(0);
});
