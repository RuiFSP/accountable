import { expect } from "@playwright/test";

import {
  createWonDeal,
  isoDaysFromNow,
  issueInvoice,
  resetSampleData,
  signIn,
  test,
  watchConsole,
} from "./helpers";

test.beforeAll(() => {
  resetSampleData();
});

/** The invoice's title: its number, or "Draft invoice". */
async function pageHeading(page: import("@playwright/test").Page) {
  return (await page.locator(".page-title h2").innerText()).trim();
}

function dateOn(daysFromNow: number): string {
  const day = new Date();
  day.setDate(day.getDate() + daysFromNow);
  return day.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

test("a won deal takes a three-line invoice that adds up, edits and issues", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  await signIn(page);
  const deal = await createWonDeal(request, "E2E three-line invoice", 39_750);

  await page.goto(`/deals/${deal.id}`);
  await page.getByRole("button", { name: "Create invoice" }).click();
  const dialog = page.getByRole("dialog", { name: "Create invoice" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".invoice-allocation")).toContainText(
    "Deal value $397.50",
  );
  await expect(dialog.locator(".invoice-allocation")).toContainText(
    "Still to allocate $0.00",
  );

  // The one default line becomes three lines from the product list.
  await dialog
    .getByRole("button", { name: "Remove E2E three-line invoice" })
    .click();
  for (const product of [
    "Starter license",
    "Team license",
    "Priority support",
  ]) {
    const select = dialog.getByLabel("Add a line from a product");
    const value = await select
      .locator("option", { hasText: product })
      .first()
      .getAttribute("value");
    await select.selectOption(value!);
  }

  await expect(dialog.locator(".invoice-allocation")).toContainText(
    "Subtotal $397.50",
  );
  await expect(dialog.locator(".invoice-allocation")).toContainText(
    "Still to allocate $0.00",
  );
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();

  // The preview beside the form draws the same document.
  const sheet = dialog.locator(".invoice-sheet");
  for (const product of [
    "Starter license",
    "Team license",
    "Priority support",
  ]) {
    await expect(sheet.locator(".sheet-lines")).toContainText(product);
  }
  await expect(sheet.locator(".sheet-bill-name")).toHaveText(
    "Northwind Traders",
  );
  await expect(sheet.locator(".sheet-totals")).toContainText("$397.50");
  await expect(sheet.locator(".sheet-totals")).toContainText("$35.28");
  await expect(sheet.locator(".sheet-totals")).toContainText("$432.78");

  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".invoice-panel")).toContainText("Draft");

  // The draft opens, changes and saves what was typed.
  await page.getByRole("link", { name: "Draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Draft invoice" }),
  ).toBeVisible();
  await expect(page.locator(".invoice-sheet")).toContainText("Starter license");

  await page.getByRole("button", { name: "Edit" }).click();
  const editor = page.getByRole("dialog", { name: "Edit invoice" });
  await editor
    .getByLabel("Description")
    .first()
    .fill("Starter license, extended");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.locator(".invoice-sheet")).toContainText(
    "Starter license, extended",
  );

  // Issuing from the same dialog gives it its number and the due date.
  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByRole("dialog", { name: "Edit invoice" })
    .getByRole("button", { name: "Save and issue" })
    .click();
  await expect(page.locator(".page-title h2")).toHaveText(/^INV-\d{4}$/);
  await expect(page.getByRole("dialog", { name: "Edit invoice" })).toBeHidden();
  await expect(page.locator(".invoice-document .sheet-dates")).toContainText(
    dateOn(0),
  );
  await expect(page.locator(".invoice-document .sheet-dates")).toContainText(
    dateOn(30),
  );
  await expect(page.locator(".page-title .badge")).toHaveText("Issued");

  expect(consoleErrors()).toEqual([]);
});

test("an issued invoice offers nothing that changes it, and the API refuses", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  await signIn(page);
  const deal = await createWonDeal(request, "E2E frozen invoice", 500_000);
  const invoiceId = await issueInvoice(request, deal.id, isoDaysFromNow(-5));

  await page.goto(`/money/invoices/${invoiceId}`);
  const number = await pageHeading(page);
  expect(number).toMatch(/^INV-\d{4}$/);

  const actions = page.locator(".invoice-actions");
  await expect(actions.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "Void" })).toBeVisible();
  await expect(
    actions.getByRole("button", { name: "Download PDF" }),
  ).toBeVisible();

  const changed = await request.put(`/api/invoices/${invoiceId}`, {
    data: {
      lines: [
        {
          product_id: null,
          description: "Changed",
          quantity: 1,
          unit_price_cents: 1,
        },
      ],
    },
  });
  expect(changed.status()).toBe(409);
  const removed = await request.delete(`/api/invoices/${invoiceId}`);
  expect(removed.status()).toBe(409);

  expect(consoleErrors()).toEqual([]);
});

test("Download PDF saves a file named after the invoice's number", async ({
  page,
  request,
}) => {
  await signIn(page);
  const deal = await createWonDeal(request, "E2E pdf deal", 250_000);
  const invoiceId = await issueInvoice(request, deal.id, isoDaysFromNow(-2));

  await page.goto(`/money/invoices/${invoiceId}`);
  const number = await pageHeading(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);

  expect(download.suggestedFilename()).toBe(`${number}.pdf`);
});

test("voiding keeps the number and frees the deal for a replacement", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  await signIn(page);
  const deal = await createWonDeal(request, "E2E voided invoice", 120_000);
  const invoiceId = await issueInvoice(request, deal.id, isoDaysFromNow(-1));

  await page.goto(`/money/invoices/${invoiceId}`);
  const number = await pageHeading(page);

  await page.getByRole("button", { name: "Void" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Void" }).click();

  await expect(page.locator(".invoice-sheet .sheet-mark")).toHaveText("VOID");
  await expect(page.getByRole("heading", { name: number })).toBeVisible();
  await expect(page.locator(".page-title .badge")).toHaveText("Void");

  // The deal takes a replacement: only one non-void invoice can hold it.
  await page.goto(`/deals/${deal.id}`);
  await expect(
    page.getByRole("button", { name: "Create invoice" }),
  ).toBeVisible();

  expect(consoleErrors()).toEqual([]);
});

test("the invoice opens from the Invoices tab, its panels, and the tab searches and filters", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  await signIn(page);
  const deal = await createWonDeal(request, "E2E listed invoice", 640_000);
  await issueInvoice(request, deal.id, isoDaysFromNow(-40));

  await page.goto("/money/invoices");
  for (const heading of [
    "Number",
    "Organization",
    "Deal",
    "Issued",
    "Due",
    "Total",
    "Balance",
    "Status",
  ]) {
    await expect(
      page.getByRole("columnheader", { name: new RegExp(`^${heading}`) }),
    ).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /Add/ })).toHaveCount(0);

  await page.getByLabel("Search invoices").fill("E2E listed invoice");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(1);
  await page.getByLabel("Search invoices").fill("");
  await page.getByLabel("Status").selectOption("overdue");
  const overdueRows = await page.locator(".data-table tbody tr").count();
  expect(overdueRows).toBeGreaterThan(0);
  await expect(
    page.locator(".data-table tbody tr", { hasText: "E2E listed invoice" }),
  ).toBeVisible();
  await page.getByLabel("Status").selectOption("");

  await page
    .locator(".data-table tbody tr", { hasText: "E2E listed invoice" })
    .getByRole("button", { name: "View" })
    .click();
  await expect(page.locator(".page-title h2")).toHaveText(/^INV-\d{4}$/);
  const number = await pageHeading(page);

  await page.goto(`/deals/${deal.id}`);
  await expect(page.locator(".invoice-panel")).toContainText(number);

  await page.goto(`/organizations/${deal.organization_id}`);
  await expect(page.locator(".invoice-panel")).toContainText(number);

  expect(consoleErrors()).toEqual([]);
});
