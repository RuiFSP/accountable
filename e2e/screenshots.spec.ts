import { expect, type Page } from "@playwright/test";

import { chooseTheme, resetSampleData, signIn, test } from "./helpers";

// docs/changes/dark-mode/intent.md, criterion 3: the dashboard and the
// pipeline captured in both modes into docs/changes/dark-mode/. Fixed
// laptop viewport, sample data reset, fonts and charts settled first, so
// the four PNGs change only when the visuals do. The mode is switched
// through the user menu, which is where the theme lives now.

const OUT = "docs/changes/dark-mode";

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeAll(() => {
  resetSampleData();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

/** Fonts loaded and the dashboard's chart animations finished. */
async function settleDashboard(page: Page): Promise<void> {
  await page.locator(".kpi-grid .kpi").first().waitFor();
  for (const heading of [
    "Revenue won per month",
    "Deals won per month",
    "Payments received",
  ]) {
    await expect(
      page.locator(".panel").filter({ hasText: heading }).locator("svg"),
    ).toBeVisible();
  }
  await expect(
    page.locator(".recharts-cartesian-axis-tick-value").first(),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Recharts' area animation runs 1.5s; catch it at its final frame.
  await page.waitForTimeout(2000);
}

test("dashboard and pipeline in both modes", async ({ page }) => {
  await page.goto("/");
  await settleDashboard(page);
  await page.screenshot({
    path: `${OUT}/dashboard-light.png`,
    fullPage: true,
  });

  await chooseTheme(page, "Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: `${OUT}/dashboard-dark.png`, fullPage: true });

  await page.goto("/pipeline");
  await expect(page.locator(".deal-card").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.screenshot({
    path: `${OUT}/pipeline-dark.png`,
    fullPage: true,
  });

  await chooseTheme(page, "Light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: `${OUT}/pipeline-light.png`,
    fullPage: true,
  });
});
