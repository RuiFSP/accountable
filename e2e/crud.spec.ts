import { expect } from "@playwright/test";

import { resetSampleData, signIn, test } from "./helpers";

test.beforeAll(() => {
  resetSampleData();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("an organization can be added, searched, sorted and edited, and survives a refresh", async ({
  page,
}) => {
  await page.goto("/organizations");

  await page.getByRole("button", { name: "Add organization" }).click();
  const modal = page.getByRole("dialog", { name: "Add organization" });
  await modal.getByLabel("Name", { exact: true }).fill("Granite Works");
  await modal.getByLabel("Industry").fill("Utilities");
  await modal.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.locator("tbody tr", { hasText: "Granite Works" }),
  ).toBeVisible();

  await page.getByRole("searchbox").fill("granite");
  await expect(page.locator("tbody tr")).toHaveCount(1);

  await page.getByRole("searchbox").fill("");

  await page.getByRole("button", { name: "Name" }).click();
  await expect(page.locator("tbody tr").first()).toContainText(
    "Acme Manufacturing",
  );
  await page.getByRole("button", { name: "Name" }).click();
  await expect(page.locator("tbody tr").first()).toContainText(
    "Northwind Traders",
  );

  await page
    .locator("tbody tr", { hasText: "Granite Works" })
    .getByRole("button", { name: "Edit" })
    .click();
  const editModal = page.getByRole("dialog", { name: "Edit organization" });
  await editModal.getByLabel("Website").fill("graniteworks.example");
  await editModal.getByRole("button", { name: "Save" }).click();
  await expect(
    page.locator("tbody tr", { hasText: "Granite Works" }),
  ).toContainText("graniteworks.example");

  await page.reload();
  await expect(
    page.locator("tbody tr", { hasText: "Granite Works" }),
  ).toContainText("graniteworks.example");
});

test("a contact and a deal can be added and are found by search", async ({
  page,
}) => {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Add contact" }).click();
  const contactModal = page.getByRole("dialog", { name: "Add contact" });
  await contactModal.getByLabel("Name", { exact: true }).fill("Riley Granite");
  await contactModal.getByLabel("Email").fill("riley@graniteworks.example");
  await contactModal
    .getByLabel("Organization")
    .selectOption({ label: "Granite Works" });
  await contactModal.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("searchbox").fill("riley");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText("Riley Granite");

  await page.goto("/deals");
  await page.getByRole("button", { name: "Add deal" }).click();
  const dealModal = page.getByRole("dialog", { name: "Add deal" });
  await dealModal.getByLabel("Name", { exact: true }).fill("Granite pilot");
  await dealModal
    .getByLabel("Organization")
    .selectOption({ label: "Granite Works" });
  await dealModal
    .getByLabel("Contact")
    .selectOption({ label: "Riley Granite" });
  await dealModal.getByLabel("Value (USD)").fill("7,500");
  await dealModal.getByLabel("Close date").fill("2027-03-01");
  await dealModal.getByRole("button", { name: "Add", exact: true }).click();

  await page.getByRole("searchbox").fill("Granite pilot");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText("$7,500");

  await page.reload();
  await expect(
    page.locator("tbody tr", { hasText: "Granite pilot" }),
  ).toBeVisible();
});

test("the delete confirmation lists every linked record and activity", async ({
  page,
}) => {
  // An activity on the deal, so the cascade list has all three kinds.
  await page.goto("/deals");
  await page.getByRole("searchbox").fill("Granite pilot");
  await page
    .locator("tbody tr", { hasText: "Granite pilot" })
    .getByRole("button", { name: "View" })
    .click();
  await page.waitForURL(/\/deals\/\d+/);
  await page.getByRole("button", { name: "Log activity" }).click();
  const activityModal = page.getByRole("dialog", { name: "Log activity" });
  await activityModal
    .getByLabel("Description")
    .fill("Kickoff call for Granite pilot");
  await activityModal.getByRole("button", { name: "Log", exact: true }).click();
  await expect(
    page.locator(".timeline-item", {
      hasText: "Kickoff call for Granite pilot",
    }),
  ).toBeVisible();

  await page.goto("/organizations");
  await page.getByRole("searchbox").fill("Granite");
  await page
    .locator("tbody tr", { hasText: "Granite Works" })
    .getByRole("button", { name: "Delete" })
    .click();

  const dialog = page.getByRole("alertdialog", {
    name: "Delete Granite Works?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Riley Granite");
  await expect(dialog).toContainText("Granite pilot");
  await expect(dialog).toContainText("Kickoff call for Granite pilot");

  // Cancel leaves everything in place.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.locator("tbody tr", { hasText: "Granite Works" }),
  ).toBeVisible();
});

test("confirming the delete removes the record and everything linked to it", async ({
  page,
  request,
}) => {
  await page.goto("/organizations");
  await page.getByRole("searchbox").fill("Granite");
  await page
    .locator("tbody tr", { hasText: "Granite Works" })
    .getByRole("button", { name: "Delete" })
    .click();
  const dialog = page.getByRole("alertdialog", {
    name: "Delete Granite Works?",
  });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No matches.")).toBeVisible();

  await page.goto("/contacts");
  await page.getByRole("searchbox").fill("riley");
  await expect(page.getByText("No matches.")).toBeVisible();

  await page.goto("/deals");
  await page.getByRole("searchbox").fill("Granite pilot");
  await expect(page.getByText("No matches.")).toBeVisible();

  const activities = (await (await request.get("/api/activities")).json()) as {
    description: string;
  }[];
  expect(activities.map((activity) => activity.description)).not.toContain(
    "Kickoff call for Granite pilot",
  );
});

test("npm run seed with confirmation brings back the sample data", async ({
  page,
}) => {
  await page.goto("/organizations");
  await page
    .locator("tbody tr", { hasText: "Evergreen Coffee" })
    .getByRole("button", { name: "Delete" })
    .click();
  await page
    .getByRole("alertdialog", { name: "Delete Evergreen Coffee?" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(5);

  resetSampleData(); // the real command, confirmation included

  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(
    page.locator("tbody tr", { hasText: "Evergreen Coffee" }),
  ).toBeVisible();
});

test("the top-bar New deal action opens the form from the deals page", async ({
  page,
}) => {
  await page.goto("/deals");
  await page.getByRole("button", { name: "New deal" }).click();

  const modal = page.getByRole("dialog", { name: "Add deal" });
  await expect(modal).toBeVisible();

  await modal.getByRole("button", { name: "Cancel" }).click();
  await expect(modal).toBeHidden();
  await expect(page).toHaveURL(/\/deals$/);
});

test("the delete dialog lists a stage entry written moments earlier by an edit", async ({
  page,
}) => {
  await page.goto("/deals");
  const row = page.locator("tbody tr", { hasText: "Delta renewal" });
  await row.getByRole("button", { name: "Edit" }).click();

  const modal = page.getByRole("dialog", { name: "Edit deal" });
  await modal.getByLabel("Stage").selectOption("Proposal");
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("Proposal");

  // The stage change wrote a system activity; the preview must show it even
  // though nothing has reloaded the page since.
  await row.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Delete Delta renewal?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Moved from Negotiation to Proposal");
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("a new record shows who added it, and an edit by another teammate who last changed it", async ({
  page,
  request,
}) => {
  await page.goto("/organizations");
  await page.getByRole("button", { name: "Add organization" }).click();
  const modal = page.getByRole("dialog", { name: "Add organization" });
  await modal.getByLabel("Name", { exact: true }).fill("Attribution Works");
  await modal.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.locator("tbody tr", { hasText: "Attribution Works" }),
  ).toBeVisible();

  await page
    .locator("tbody tr", { hasText: "Attribution Works" })
    .getByRole("button", { name: "View" })
    .click();
  await page.waitForURL(/\/organizations\/\d+/);
  await expect(
    page.getByRole("heading", { name: "Attribution Works", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Added by")).toBeVisible();
  await expect(page.getByText("Last changed by")).toBeVisible();
  // On an add, both lines name the teammate who made it.
  await expect(page.getByText("alex@brightloop.example")).toHaveCount(2);

  // Another teammate edits it: sign in as Priya through the local route and
  // save a change as her, the way her browser would.
  const path = `/api${new URL(page.url()).pathname}`;
  const signIn = await request.post("/api/local/sign-in", {
    data: { user_id: "priya" },
  });
  const { token } = (await signIn.json()) as { token: string };
  const saved = await request.put(path, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: "Attribution Works",
      website: null,
      industry: null,
      notes: "Edited by Priya",
    },
  });
  expect(saved.ok(), `${saved.status()}: ${await saved.text()}`).toBe(true);

  await page.reload();
  await expect(page.getByText("Last changed by")).toBeVisible();
  await expect(page.getByText("priya@brightloop.example")).toBeVisible();
  await expect(page.getByText("alex@brightloop.example")).toBeVisible();
});
