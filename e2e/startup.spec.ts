import { expect, test } from "@playwright/test";

const sections = [
  { path: "/", label: "Dashboard" },
  { path: "/organizations", label: "Organizations" },
  { path: "/contacts", label: "Contacts" },
  { path: "/deals", label: "Deals" },
  { path: "/pipeline", label: "Pipeline" },
];

test("the app starts on the dashboard with no console errors", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  for (const { label } of sections) {
    await expect(page.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(240, 244, 245)",
  );

  expect(consoleErrors).toEqual([]);
});

test("every section is reachable from the sidebar", async ({ page }) => {
  await page.goto("/");

  for (const { path, label } of sections) {
    await page.click(`a[href="${path}"]`);
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
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
});
