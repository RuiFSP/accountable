import { expect } from "@playwright/test";

import {
  createWonDeal,
  expectedRefusals,
  isoDaysFromNow,
  issueInvoice,
  pdfText,
  resetSampleData,
  signIn,
  test,
  watchConsole,
} from "./helpers";

// Payments arrive against an issued invoice and are the only thing that moves
// its balance (docs/specs/invoices.md). Every test issues an invoice of its
// own first, so the sample data's invoices are left alone.

test.beforeAll(() => {
  resetSampleData();
});

const PAYMENT_REFUSED =
  "A payment must be more than zero and no more than what is still owed.";

const usd = (cents: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/** The invoice page of a fresh invoice we issued `daysAgo` days ago. */
async function openInvoice(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
  name: string,
  valueCents: number,
  daysAgo: number,
): Promise<void> {
  const deal = await createWonDeal(request, name, valueCents);
  const invoiceId = await issueInvoice(
    request,
    deal.id,
    isoDaysFromNow(-daysAgo),
  );
  await page.goto(`/money/invoices/${invoiceId}`);
}

async function recordPayment(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Record payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Record payment" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("recording a payment takes the balance to zero and the invoice reads paid", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  await signIn(page);
  await openInvoice(page, request, "E2E paid in full", 200_000, 6);

  // $200,000 plus the sample's 8.875% tax: $2,177.50 in total.
  await expect(page.locator(".paid-summary")).toContainText(
    "Still owed $2,177.50",
  );
  const dialog = await recordPayment(page);
  await expect(dialog.getByLabel("Amount (USD)")).toHaveValue("$2,177.50");

  await dialog.getByRole("button", { name: "Record" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator(".page-title .badge")).toHaveText("Paid");
  await expect(page.locator(".paid-summary")).toContainText(
    "Paid $2,177.50 of $2,177.50",
  );
  await expect(page.locator(".paid-summary")).toContainText("Still owed $0.00");
  await expect(page.locator(".paid-bar")).toHaveAttribute(
    "aria-valuenow",
    "217750",
  );
  await expect(page.getByRole("heading", { name: "Payments 1" })).toBeVisible();

  expect(consoleErrors()).toEqual([]);
});

test("a payment for more than the balance is refused with its message", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  await signIn(page);
  await openInvoice(page, request, "E2E too much", 200_000, 6);

  const dialog = await recordPayment(page);
  await dialog.getByLabel("Amount (USD)").fill("$9,999.00");
  await dialog.getByRole("button", { name: "Record" }).click();

  await expect(dialog.getByRole("alert")).toHaveText(PAYMENT_REFUSED);
  await expect(dialog).toBeVisible();
  await expect(page.locator(".paid-summary")).toContainText(
    "Still owed $2,177.50",
  );

  expect(expectedRefusals(consoleErrors())).toEqual([]);
});

test("deleting a payment puts the balance back", async ({ page, request }) => {
  const consoleErrors = watchConsole(page);
  await signIn(page);
  await openInvoice(page, request, "E2E payment removed", 200_000, 6);

  const dialog = await recordPayment(page);
  await dialog.getByRole("button", { name: "Record" }).click();
  await expect(page.getByRole("heading", { name: "Payments 1" })).toBeVisible();

  const payments = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /^Payments/ }) });
  await payments.getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("No payments yet.")).toBeVisible();
  await expect(page.locator(".page-title .badge")).toHaveText("Issued");
  await expect(page.locator(".paid-summary")).toContainText(
    "Still owed $2,177.50",
  );

  expect(expectedRefusals(consoleErrors())).toEqual([]);
});

test("an invoice past its due date reads overdue on its page, in the list, on the dashboard, and its PDF carries the mark", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  await signIn(page);
  await openInvoice(page, request, "E2E overdue invoice", 300_000, 40);

  // On its own page, and on the document it draws.
  await expect(page.locator(".page-title .badge")).toHaveText("Overdue");
  await expect(page.locator(".sheet-mark")).toHaveText("OVERDUE");

  // In the list.
  await page.goto("/money/invoices");
  await page.getByLabel("Search invoices").fill("E2E overdue invoice");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".data-table tbody tr .badge")).toHaveText(
    "Overdue",
  );

  // On the dashboard, where the figure comes from the invoices themselves.
  const dashboard = (await (await request.get("/api/dashboard")).json()) as {
    money: { overdue_cents: number };
  };
  expect(dashboard.money.overdue_cents).toBeGreaterThan(0);
  await page.goto("/");
  const overdue = page
    .locator(".money-kpis .kpi")
    .filter({ hasText: "Overdue" })
    .first();
  await expect(overdue.locator(".kpi-value")).toHaveText(
    usd(dashboard.money.overdue_cents),
  );

  // And on the PDF it downloads.
  await page.goto("/money/invoices");
  await page.getByLabel("Search invoices").fill("E2E overdue invoice");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .locator(".data-table tbody tr", { hasText: "E2E overdue invoice" })
      .getByRole("button", { name: "Download PDF" })
      .click(),
  ]);
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  expect(pdfText(filePath!)).toContain("OVERDUE");

  expect(consoleErrors()).toEqual([]);
});
