import { expect, type Page } from "@playwright/test";

import {
  expectedRefusals,
  resetSampleData,
  SIGNED_IN_AS,
  signIn,
  test,
  watchConsole,
} from "./helpers";

// Company settings live on one row for the whole team
// (docs/specs/company-settings.md). Every test changes that row, so the
// sample data is reset before each one — and that reset takes about twenty
// seconds on this machine, so the file's tests get more than the default
// thirty, the way products.spec.ts's do.
test.describe.configure({ timeout: 90_000 });

const BRIGHTLOOP_ADDRESS = "1 Brightloop Plaza, Floor 12, New York, NY 10004";

const TAX_RATE_MESSAGE = "The tax rate must be between 0 and 100.";
const TERMS_MESSAGE =
  "Payment terms must be a whole number of days from 0 to 365.";
const PREFIX_MESSAGE =
  "A prefix can be at most 10 characters of letters, digits and hyphens.";
const EMAIL_MESSAGE = "The email must look like an email.";
const NAME_MESSAGE = "The company name is required.";

test.beforeEach(() => {
  resetSampleData();
});

async function openSettings(page: Page, email = SIGNED_IN_AS): Promise<void> {
  await page.getByRole("button", { name: email }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

async function save(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

async function saved(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Saved.");
}

test("opens from the menu with Brightloop's values and the last-change line", async ({
  page,
}) => {
  const consoleErrors = watchConsole(page);
  await signIn(page);

  await openSettings(page);

  expect(new URL(page.url()).pathname).toBe("/settings");
  await expect(page.getByLabel("Company name")).toHaveValue("Brightloop");
  await expect(page.getByLabel("Address")).toHaveValue(BRIGHTLOOP_ADDRESS);
  await expect(page.getByLabel("Email")).toHaveValue(
    "hello@brightloop.example",
  );
  await expect(page.getByLabel("Phone")).toHaveValue("+1 555 0100");
  await expect(page.getByLabel("Tax label")).toHaveValue("Sales tax");
  await expect(page.getByLabel("Tax rate")).toHaveValue("8.875");
  await expect(page.getByLabel("Payment terms")).toHaveValue("30");
  await expect(page.getByLabel("Quote prefix")).toHaveValue("QT-");
  await expect(page.getByLabel("Invoice prefix")).toHaveValue("INV-");
  await expect(
    page.getByText(/^Last changed by priya@brightloop\.example on /),
  ).toBeVisible();

  expect(consoleErrors()).toEqual([]);
});

test("a save survives a reload and Priya sees the same values", async ({
  page,
}) => {
  await signIn(page);
  await openSettings(page);

  await page.getByLabel("Company name").fill("Brightloop Studio");
  await page.getByLabel("Address").fill("9 Market Street, New York, NY 10005");
  await page.getByLabel("Tax rate").fill("7.25");
  await page.getByLabel("Payment terms").fill("45");
  await page.getByLabel("Quote prefix").fill("Q2-");
  await page.getByLabel("Invoice prefix").fill("I2-");
  await save(page);
  await saved(page);

  await page.reload();
  await expect(page.getByLabel("Company name")).toHaveValue(
    "Brightloop Studio",
  );
  await expect(page.getByLabel("Address")).toHaveValue(
    "9 Market Street, New York, NY 10005",
  );
  await expect(page.getByLabel("Tax rate")).toHaveValue("7.25");
  await expect(page.getByLabel("Payment terms")).toHaveValue("45");
  await expect(page.getByLabel("Quote prefix")).toHaveValue("Q2-");
  await expect(page.getByLabel("Invoice prefix")).toHaveValue("I2-");
  await expect(
    page.getByText(/^Last changed by alex@brightloop\.example on /),
  ).toBeVisible();

  // Another teammate signs in and sees the same row.
  await page.getByRole("button", { name: SIGNED_IN_AS }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: /Priya Nair/ }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await openSettings(page, "priya@brightloop.example");

  await expect(page.getByLabel("Company name")).toHaveValue(
    "Brightloop Studio",
  );
  await expect(page.getByLabel("Tax rate")).toHaveValue("7.25");
  await expect(page.getByLabel("Payment terms")).toHaveValue("45");
  await expect(
    page.getByText(/^Last changed by alex@brightloop\.example on /),
  ).toBeVisible();
});

test("a blank tax rate and blank terms save and show as 0", async ({
  page,
}) => {
  await signIn(page);
  await openSettings(page);

  await page.getByLabel("Tax rate").fill("");
  await page.getByLabel("Payment terms").fill("");
  await save(page);
  await saved(page);

  await page.reload();
  await expect(page.getByLabel("Tax rate")).toHaveValue("0");
  await expect(page.getByLabel("Payment terms")).toHaveValue("0");
});

test("a save that changes nothing leaves the last-change line alone", async ({
  page,
}) => {
  await signIn(page);
  await openSettings(page);
  const line = page.getByText(/^Last changed by /);
  const before = await line.textContent();

  await save(page);
  await saved(page);

  await expect(line).toHaveText(before ?? "");
});

test("the page and the API refuse out-of-range values and bad shapes", async ({
  page,
  request,
}) => {
  await signIn(page);
  await openSettings(page);

  // The page speaks first, before any call to the API.
  await page.getByLabel("Tax rate").fill("150");
  await save(page);
  await expect(page.getByRole("alert")).toHaveText(TAX_RATE_MESSAGE);

  await page.getByLabel("Tax rate").fill("8.875");
  await page.getByLabel("Payment terms").fill("400");
  await save(page);
  await expect(page.getByRole("alert")).toHaveText(TERMS_MESSAGE);

  await page.getByLabel("Payment terms").fill("30");
  await page.getByLabel("Quote prefix").fill("ABCDEFGHIJK");
  await save(page);
  await expect(page.getByRole("alert")).toHaveText(PREFIX_MESSAGE);

  await page.getByLabel("Quote prefix").fill("QT-");
  await page.getByLabel("Email").fill("not-an-email");
  await save(page);
  await expect(page.getByRole("alert")).toHaveText(EMAIL_MESSAGE);

  await page.getByLabel("Email").fill("hello@brightloop.example");
  await page.getByLabel("Company name").fill("   ");
  await save(page);
  await expect(page.getByRole("alert")).toHaveText(NAME_MESSAGE);

  // Straight to the API, every one of them is a 400 with a plain message.
  const stored = (await (await request.get("/api/settings")).json()) as Record<
    string,
    unknown
  >;
  const base = {
    name: stored.name,
    address: stored.address,
    email: stored.email,
    phone: stored.phone,
    tax_label: stored.tax_label,
    tax_rate_thousandths: stored.tax_rate_thousandths,
    payment_terms_days: stored.payment_terms_days,
    quote_prefix: stored.quote_prefix,
    invoice_prefix: stored.invoice_prefix,
  };
  for (const change of [
    { tax_rate_thousandths: 150_000 },
    { payment_terms_days: 400 },
    { quote_prefix: "ABCDEFGHIJK" },
    { email: "not-an-email" },
    { name: "   " },
  ]) {
    const response = await request.put("/api/settings", {
      data: { ...base, ...change },
    });

    expect(response.status(), JSON.stringify(change)).toBe(400);
    const body = (await response.json()) as { detail?: unknown };
    expect(typeof body.detail, JSON.stringify(change)).toBe("string");
  }

  // Nothing invalid was stored.
  await page.reload();
  await expect(page.getByLabel("Company name")).toHaveValue("Brightloop");
  await expect(page.getByLabel("Tax rate")).toHaveValue("8.875");
  await expect(page.getByLabel("Payment terms")).toHaveValue("30");
  await expect(page.getByLabel("Quote prefix")).toHaveValue("QT-");
});

const ACCENT_CONTRAST =
  "The accent is too light to read on white. Choose a darker color.";
const NOT_AN_IMAGE = "The logo must really be a PNG or a JPEG image.";

test("the Documents section saves apart, and the sample follows the design and accent", async ({
  page,
}) => {
  const consoleErrors = watchConsole(page);
  await signIn(page);
  await openSettings(page);

  const sheet = page.getByLabel("Invoice document");
  await expect(sheet).toHaveClass(/sheet-classic/);
  await expect(sheet.locator(".sheet-company")).toHaveCSS(
    "color",
    "rgb(7, 59, 76)",
  );

  // The sample follows the choices as they are made, before anything is saved.
  await page.getByLabel("Design").selectOption("modern");
  await expect(sheet).toHaveClass(/sheet-modern/);
  await page.getByLabel("Accent color").fill("#000000");
  await expect(sheet.locator(".sheet-company")).toHaveCSS(
    "color",
    "rgb(0, 0, 0)",
  );

  await page.getByRole("button", { name: "Save documents" }).click();
  await saved(page);

  await page.reload();
  await expect(page.getByLabel("Design")).toHaveValue("modern");
  await expect(page.getByLabel("Accent color")).toHaveValue("#000000");
  await expect(page.getByLabel("Invoice document")).toHaveClass(/sheet-modern/);
  // The company details above were not part of that save, and the one
  // last-change line moved with it.
  await expect(page.getByLabel("Company name")).toHaveValue("Brightloop");
  await expect(
    page.getByText(/^Last changed by alex@brightloop\.example on /),
  ).toBeVisible();

  expect(consoleErrors()).toEqual([]);
});

test("the logo uploads, appears on the sample, and a renamed text file is refused", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  await signIn(page);
  await openSettings(page);

  const logo = page.getByRole("img", { name: "Logo" });
  await expect(logo).toBeVisible();
  const before = await logo.getAttribute("src");

  // A text file that ends in .png is refused, and the logo stays as it was.
  await page.getByLabel("Logo").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a picture at all"),
  });
  await expect(page.getByRole("alert")).toHaveText(NOT_AN_IMAGE);
  await expect(logo).toHaveAttribute("src", before ?? "");

  // A real picture takes its place at once.
  await page.getByLabel("Logo").setInputFiles({
    name: "tiny.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(logo).not.toHaveAttribute("src", before ?? "");
  await expect(page.getByRole("status")).toHaveText("Saved.");

  await page.getByRole("button", { name: "Remove logo" }).click();
  await expect(page.getByRole("img", { name: "Logo" })).toHaveCount(0);
  const settings = (await (await request.get("/api/settings")).json()) as {
    logo_content_type: string | null;
  };
  expect(settings.logo_content_type).toBeNull();

  expect(expectedRefusals(consoleErrors())).toEqual([]);
});

test("an accent below 4.5:1 is refused with its message", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  await signIn(page);
  await openSettings(page);

  await page.getByLabel("Accent color").fill("#118AB2");
  await page.getByRole("button", { name: "Save documents" }).click();

  await expect(page.getByRole("alert")).toHaveText(ACCENT_CONTRAST);
  const settings = (await (await request.get("/api/settings")).json()) as {
    accent_color: string;
  };
  expect(settings.accent_color).toBe("#073B4C");

  expect(consoleErrors()).toEqual([]);
});
