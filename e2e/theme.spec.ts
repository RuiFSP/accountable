import { expect, test, type Page } from "@playwright/test";

import { resetSampleData, watchConsole } from "./helpers";

// docs/changes/dark-mode/intent.md, criterion 2: the toggle works and the
// choice is remembered after a reload. Playwright gives each test a fresh
// context, so storage starts empty and every visit begins light.

const LIGHT_PAGE = "rgb(240, 244, 245)";
const DARK_PAGE = "rgb(4, 35, 46)";
const DARK_PANEL = "rgb(0, 0, 0)";

const sections = ["/", "/organizations", "/contacts", "/deals", "/pipeline"];

test.beforeAll(() => {
  resetSampleData();
});

function toggle(page: Page) {
  return page.getByRole("switch", { name: "Dark mode" });
}

/** The first panel-colored surface of a path: cards on the board, panels elsewhere. */
function panelOf(page: Page, path: string) {
  return path === "/pipeline"
    ? page.locator(".deal-card").first()
    : page.locator(".panel").first();
}

test("a fresh visit starts light and the toggle flips every page", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_PAGE);

  const ids = async (resource: string): Promise<number[]> => {
    const response = await request.get(`/api/${resource}`);
    const records = (await response.json()) as { id: number }[];
    return records.map((record) => record.id);
  };
  const [orgId] = await ids("organizations");
  const [contactId] = await ids("contacts");
  const [dealId] = await ids("deals");

  const paths = [
    ...sections,
    `/organizations/${orgId}`,
    `/contacts/${contactId}`,
    `/deals/${dealId}`,
  ];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("html"), path).toHaveAttribute(
      "data-theme",
      "light",
    );
    await expect(page.locator("body"), path).toHaveCSS(
      "background-color",
      LIGHT_PAGE,
    );

    await toggle(page).click();
    await expect(page.locator("html"), path).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await expect(page.locator("body"), path).toHaveCSS(
      "background-color",
      DARK_PAGE,
    );
    await expect(panelOf(page, path), path).toHaveCSS(
      "background-color",
      DARK_PANEL,
    );

    await toggle(page).click();
    await expect(page.locator("body"), path).toHaveCSS(
      "background-color",
      LIGHT_PAGE,
    );
  }

  expect(consoleErrors()).toEqual([]);
});

test("the choice is still dark after a reload", async ({ page }) => {
  const consoleErrors = watchConsole(page);

  await page.goto("/");
  await toggle(page).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", DARK_PAGE);
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");

  expect(consoleErrors()).toEqual([]);
});

test("a dialog and the charts are dark while dark", async ({ page }) => {
  const consoleErrors = watchConsole(page);

  await page.goto("/");
  await toggle(page).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await expect(page.locator(".chart-box svg")).toHaveCount(2);
  await expect(
    page.locator(".recharts-cartesian-axis-tick-value").first(),
  ).toHaveCSS("fill", "rgb(147, 170, 179)");
  await expect(
    page.locator(".recharts-cartesian-grid-horizontal line").first(),
  ).toHaveCSS("stroke", "rgba(205, 216, 219, 0.15)");

  await page.goto("/deals?new=1");
  await expect(page.locator(".modal")).toBeVisible();
  await expect(page.locator(".modal")).toHaveCSS(
    "background-color",
    DARK_PANEL,
  );
  await expect(page.locator(".modal-overlay")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0.65)",
  );
  await expect(page.locator(".modal input").first()).toHaveCSS(
    "background-color",
    DARK_PAGE,
  );

  expect(consoleErrors()).toEqual([]);
});
