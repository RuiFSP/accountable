import { expect, type Page } from "@playwright/test";

import {
  chooseTheme,
  resetSampleData,
  SIGNED_IN_AS,
  signIn,
  test,
  watchConsole,
} from "./helpers";

// The menu under your initials holds the theme — light, dark or system —
// and signing out (docs/specs/look-and-feel.md, decision 11). Playwright
// gives each test a fresh context, so storage starts empty and every visit
// begins light.

const LIGHT_PAGE = "rgb(240, 244, 245)";
const DARK_PAGE = "rgb(4, 35, 46)";
const DARK_PANEL = "rgb(0, 0, 0)";

const sections = [
  "/",
  "/organizations",
  "/contacts",
  "/deals",
  "/products",
  "/pipeline",
  "/money",
  "/money/quotes",
  "/money/invoices",
  "/money/bills",
  "/settings",
];

test.beforeAll(() => {
  resetSampleData();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

function menuButton(page: Page) {
  return page.getByRole("button", { name: SIGNED_IN_AS });
}

/** The first panel-colored surface of a path: cards on the board, panels elsewhere. */
function panelOf(page: Page, path: string) {
  return path === "/pipeline"
    ? page.locator(".deal-card").first()
    : page.locator(".panel").first();
}

test("the top bar links to the seven sections and fits at 1024px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");

  const links = page.getByRole("navigation").getByRole("link");
  await expect(links).toHaveCount(7);
  await expect(page.getByRole("link", { name: "Money" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New deal" })).toBeVisible();

  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(sideways).toBeLessThanOrEqual(0);
});

test("the menu is on every route and a record's page, and names its person", async ({
  page,
  request,
}) => {
  const ids = async (resource: string): Promise<number[]> => {
    const response = await request.get(`/api/${resource}`);
    const records = (await response.json()) as { id: number }[];
    return records.map((record) => record.id);
  };
  const [orgId] = await ids("organizations");
  const [contactId] = await ids("contacts");
  const [dealId] = await ids("deals");
  const { quotes } = (await (await request.get("/api/quotes")).json()) as {
    quotes: { id: number }[];
  };

  const paths = [
    ...sections,
    `/organizations/${orgId}`,
    `/contacts/${contactId}`,
    `/deals/${dealId}`,
    `/money/quotes/${quotes[0].id}`,
  ];
  for (const path of paths) {
    await page.goto(path);
    await expect(menuButton(page), path).toBeVisible();
    await expect(
      page.getByRole("switch", { name: "Dark mode" }),
      path,
    ).toHaveCount(0);
  }

  await menuButton(page).click();
  await expect(page.getByText(SIGNED_IN_AS)).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("Light, Dark and System each apply at once and survive a reload", async ({
  page,
}) => {
  await page.goto("/");

  for (const [label, mode] of [
    ["Light", "light"],
    ["Dark", "dark"],
    ["System", "light"],
  ] as const) {
    await chooseTheme(page, label);
    await expect(page.locator("html"), label).toHaveAttribute(
      "data-theme",
      mode,
    );

    await page.reload();
    await expect(page.locator("html"), label).toHaveAttribute(
      "data-theme",
      mode,
    );
  }
});

test("the menu trigger keeps its initials legible on hover in dark mode", async ({
  page,
}) => {
  await page.goto("/");
  await chooseTheme(page, "Dark");

  const trigger = menuButton(page);
  await trigger.hover();

  // Sea Green Ink fill with Midnight initials, as the primary button hover.
  await expect(trigger).toHaveCSS("background-color", "rgb(28, 199, 155)");
  await expect(trigger).toHaveCSS("color", "rgb(4, 35, 46)");
});

test("System follows the device while the page is open", async ({ page }) => {
  await chooseTheme(page, "System");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("with System on a dark device the page is dark before the app runs", async ({
  page,
}) => {
  await chooseTheme(page, "System");
  await page.emulateMedia({ colorScheme: "dark" });

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("sign out from the menu", async ({ page }) => {
  await page.goto("/contacts/1");

  await menuButton(page).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(
    page.getByRole("heading", { name: "Accountable" }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});

test("a fresh visit starts light and the menu flips every page", async ({
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
  const { quotes } = (await (await request.get("/api/quotes")).json()) as {
    quotes: { id: number }[];
  };
  const quotePath = `/money/quotes/${quotes[0].id}`;

  const paths = [
    ...sections,
    `/organizations/${orgId}`,
    `/contacts/${contactId}`,
    `/deals/${dealId}`,
    quotePath,
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

    await chooseTheme(page, "Dark");
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
    // The quote document is the customer's paper: it stays white in dark mode.
    if (path === quotePath) {
      await expect(page.locator(".quote-document"), path).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
    }

    await chooseTheme(page, "Light");
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
  await chooseTheme(page, "Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", DARK_PAGE);
  await menuButton(page).click();
  await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  expect(consoleErrors()).toEqual([]);
});

test("a dialog and the charts are dark while dark", async ({ page }) => {
  const consoleErrors = watchConsole(page);

  await page.goto("/");
  await chooseTheme(page, "Dark");
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
