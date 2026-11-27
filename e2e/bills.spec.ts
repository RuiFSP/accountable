import { expect, type APIRequestContext, type Page } from "@playwright/test";

import {
  isoDaysFromNow,
  resetSampleData,
  signIn,
  test,
  watchConsole,
} from "./helpers";

// Every test changes the sample data, so each one resets it first.
test.describe.configure({ timeout: 120_000 });

type BillStatus = "unpaid" | "overdue" | "paid";

interface Bill {
  id: number;
  organization_id: number;
  organization_name: string;
  bill_number: string;
  bill_date: string;
  due_date: string;
  category: string;
  amount_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
  paid_date: string | null;
  status: BillStatus;
  created_by: string | null;
  updated_by: string | null;
}

interface Organization {
  id: number;
  name: string;
}

/** The shared money style: cents only when there are any. */
function usd(cents: number): string {
  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  };
  return new Intl.NumberFormat("en-US", options).format(cents / 100);
}

/** The shared date style: Jun 4, 2026. */
function displayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function listBills(request: APIRequestContext): Promise<Bill[]> {
  const response = await request.get("/api/bills");
  expect(response.ok()).toBe(true);
  return (await response.json()) as Bill[];
}

async function listOrganizations(
  request: APIRequestContext,
): Promise<Organization[]> {
  const response = await request.get("/api/organizations");
  expect(response.ok()).toBe(true);
  return (await response.json()) as Organization[];
}

function row(page: Page, text: string) {
  return page.locator("tbody tr", { hasText: text });
}

/**
 * The reply to a paid or unpaid action. The page flips the row at once and
 * fires the request without waiting, so only the reply proves the server has
 * it — a reload moments later would otherwise cut the request on the wire.
 */
function markResponse(page: Page, action: "paid" | "unpaid") {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(`/${action}`),
  );
}

function billPayload(organizationId: number, billNumber: string) {
  return {
    organization_id: organizationId,
    bill_number: billNumber,
    bill_date: isoDaysFromNow(0),
    due_date: null,
    category: "Other",
    amount_cents: 10_000,
    tax_cents: 0,
    notes: "E2E bill.",
  };
}

test.beforeEach(async ({ page }) => {
  resetSampleData();
  await signIn(page);
});

test("the Bills tab opens on the sample bills with statuses, dots and totals", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  const sample = await listBills(request);
  expect(sample.length).toBeGreaterThan(20);

  await page.goto("/money/bills");
  await expect(page.getByRole("heading", { name: "Money" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(sample.length);

  const headers = await page
    .locator("thead th")
    .evaluateAll((cells) => cells.map((cell) => cell.textContent));
  for (const column of [
    "Supplier",
    "Bill number",
    "Bill date",
    "Due date",
    "Category",
    "Total",
    "Status",
    "Paid",
  ]) {
    expect(headers.join(" ")).toContain(column);
  }

  await expect(page.locator(".category-dot")).toHaveCount(sample.length);
  const paid = sample.filter((bill) => bill.status === "paid");
  const overdue = sample.filter((bill) => bill.status === "overdue");
  const unpaid = sample.filter((bill) => bill.status === "unpaid");
  expect(overdue.length).toBeGreaterThan(0);
  await expect(page.locator(".badge-positive")).toHaveCount(paid.length);
  await expect(page.locator(".badge-negative")).toHaveCount(overdue.length);
  await expect(page.locator(".badge-info")).toHaveCount(unpaid.length);

  const known = sample.find((bill) => bill.status === "overdue")!;
  await expect(row(page, known.bill_number)).toContainText("Overdue");
  await expect(row(page, known.bill_number)).toContainText(
    usd(known.total_cents),
  );

  const filter = page.getByLabel("Status");
  await filter.selectOption("unpaid");
  await expect(page.locator("tbody tr")).toHaveCount(unpaid.length);
  await expect(page.locator(".badge-negative")).toHaveCount(0);
  await filter.selectOption("overdue");
  await expect(page.locator("tbody tr")).toHaveCount(overdue.length);
  await expect(page.locator(".badge-info")).toHaveCount(0);
  await filter.selectOption("paid");
  await expect(page.locator("tbody tr")).toHaveCount(paid.length);
  await expect(page.locator(".badge-negative")).toHaveCount(0);
  await filter.selectOption("");
  await expect(page.locator("tbody tr")).toHaveCount(sample.length);

  await page.getByRole("searchbox").fill("vantage");
  const vantage = sample.filter((bill) =>
    bill.organization_name.toLowerCase().includes("vantage"),
  );
  await expect(page.locator("tbody tr")).toHaveCount(vantage.length);
  await page.getByRole("searchbox").fill(known.bill_number);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText(
    known.bill_number,
  );
  await page.getByRole("searchbox").fill("");

  expect(consoleErrors()).toEqual([]);
});

test("a bill can be added, edited, paid, unpaid and deleted, and survives a reload", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  const organizations = await listOrganizations(request);
  const supplier = organizations.find(
    (organization) => organization.name === "Vantage Software",
  );
  expect(supplier).toBeTruthy();
  const before = (await listBills(request)).length;

  await page.goto("/money/bills");
  await page.getByRole("button", { name: "Add bill" }).click();
  const modal = page.getByRole("dialog", { name: "Add bill" });
  await expect(modal.getByLabel("Bill date")).toHaveValue(isoDaysFromNow(0));
  await expect(modal.getByLabel("Due date")).toHaveValue(isoDaysFromNow(30));
  await modal
    .getByLabel("Supplier")
    .selectOption({ label: "Vantage Software" });
  await modal.getByLabel("Bill number").fill("E2E-2026-001");
  await modal.getByLabel("Amount before tax (USD)").fill("1,250.50");
  await modal.getByLabel("Tax (USD)", { exact: true }).fill("100.05");
  await expect(modal.getByText("Total: $1,350.55")).toBeVisible();
  await modal.getByLabel("Category").selectOption("Travel");
  await modal.getByLabel("Notes").fill("E2E added bill.");
  await modal.getByRole("button", { name: "Add", exact: true }).click();

  const added = row(page, "E2E-2026-001");
  await expect(added).toContainText("Vantage Software");
  await expect(added).toContainText("$1,350.55");
  await expect(added).toContainText("Travel");
  await expect(added).toContainText("Unpaid");
  await expect(page.locator("tbody tr")).toHaveCount(before + 1);

  // The supplier's page lists the same bill, read-only.
  await page.goto(`/organizations/${supplier!.id}`);
  await expect(page.getByRole("heading", { name: /Bills/ })).toBeVisible();
  await expect(page.getByText("E2E-2026-001")).toBeVisible();

  await page.goto("/money/bills");
  await row(page, "E2E-2026-001").getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit bill" });
  await expect(edit.getByLabel("Amount before tax (USD)")).toHaveValue(
    "$1,250.50",
  );
  await expect(edit.getByLabel("Notes")).toHaveValue("E2E added bill.");
  await edit.getByLabel("Amount before tax (USD)").fill("1,500");
  await edit.getByLabel("Notes").fill("E2E edited bill.");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(row(page, "E2E-2026-001")).toContainText("$1,600.05");
  await expect(row(page, "E2E-2026-001")).toContainText("Unpaid");

  // Each action waits for its own reply before the next: the row's flip is
  // optimistic, so a reload must not race the request still on the wire.
  const paidUp = markResponse(page, "paid");
  await row(page, "E2E-2026-001")
    .getByRole("button", { name: "Mark paid" })
    .click();
  expect((await paidUp).ok()).toBe(true);
  await expect(row(page, "E2E-2026-001").locator(".badge-positive")).toHaveText(
    "Paid",
  );
  await expect(row(page, "E2E-2026-001")).toContainText(
    displayDate(isoDaysFromNow(0)),
  );

  const unpaidUp = markResponse(page, "unpaid");
  await row(page, "E2E-2026-001")
    .getByRole("button", { name: "Mark unpaid" })
    .click();
  expect((await unpaidUp).ok()).toBe(true);
  await expect(row(page, "E2E-2026-001").locator(".badge-info")).toHaveText(
    "Unpaid",
  );
  await expect(
    row(page, "E2E-2026-001").getByRole("button", { name: "Mark paid" }),
  ).toBeVisible();

  await page.reload();
  await expect(row(page, "E2E-2026-001")).toContainText("$1,600.05");
  await expect(row(page, "E2E-2026-001")).toContainText("Unpaid");

  await row(page, "E2E-2026-001")
    .getByRole("button", { name: "Delete" })
    .click();
  const confirm = page.getByRole("alertdialog", {
    name: "Delete bill E2E-2026-001?",
  });
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(before);
  await expect(row(page, "E2E-2026-001")).toHaveCount(0);

  expect(consoleErrors()).toEqual([]);
});

test("a bill number is refused whatever the case, through the page and the API", async ({
  page,
  request,
}) => {
  // Deliberate 400s make Chrome log failed-resource messages, so this test
  // leaves the console alone; the other bill tests hold it to empty.
  const sample = await listBills(request);
  const existing = sample[0];
  const other = (await listOrganizations(request)).find(
    (organization) => organization.id !== existing.organization_id,
  );
  expect(other).toBeTruthy();

  await page.goto("/money/bills");
  await page.getByRole("button", { name: "Add bill" }).click();
  const modal = page.getByRole("dialog", { name: "Add bill" });
  await modal
    .getByLabel("Supplier")
    .selectOption({ label: existing.organization_name });
  await modal
    .getByLabel("Bill number")
    .fill(`  ${existing.bill_number.toLowerCase()}  `);
  await modal.getByLabel("Amount before tax (USD)").fill("10");
  await modal.getByLabel("Tax (USD)", { exact: true }).fill("0");
  await modal.getByRole("button", { name: "Add", exact: true }).click();
  await expect(modal.getByRole("alert")).toHaveText(
    `A bill numbered "${existing.bill_number}" already exists for this supplier.`,
  );
  await modal.getByRole("button", { name: "Cancel" }).click();

  const refused = await request.post("/api/bills", {
    data: {
      ...billPayload(
        existing.organization_id,
        existing.bill_number.toUpperCase(),
      ),
    },
  });
  expect(refused.status()).toBe(400);
  expect(((await refused.json()) as { detail: string }).detail).toContain(
    "already exists",
  );

  // Another supplier may use the same number.
  const allowed = await request.post("/api/bills", {
    data: billPayload(other!.id, existing.bill_number),
  });
  expect(allowed.status(), await allowed.text()).toBe(201);
});

test("another teammate's edit credits both emails in the dialog", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  const organizations = await listOrganizations(request);
  const supplier = organizations.find(
    (organization) => organization.name === "Cedar Contractors",
  );
  expect(supplier).toBeTruthy();

  const created = await request.post("/api/bills", {
    data: billPayload(supplier!.id, "E2E-TEAM-1"),
  });
  expect(created.status(), await created.text()).toBe(201);
  const bill = (await created.json()) as Bill;

  // Another teammate saves through the API, the way her browser would.
  const signInAsPriya = await request.post("/api/local/sign-in", {
    data: { user_id: "priya" },
  });
  const { token } = (await signInAsPriya.json()) as { token: string };
  const saved = await request.put(`/api/bills/${bill.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      ...billPayload(supplier!.id, "E2E-TEAM-1"),
      amount_cents: 12_000,
      notes: "Edited by Priya",
    },
  });
  expect(saved.ok(), `${saved.status()}: ${await saved.text()}`).toBe(true);

  await page.goto("/money/bills");
  await row(page, "E2E-TEAM-1").getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit bill" });
  await expect(edit).toContainText("alex@brightloop.example");
  await expect(edit).toContainText("priya@brightloop.example");
  await expect(edit.getByLabel("Notes")).toHaveValue("Edited by Priya");
  await edit.getByRole("button", { name: "Cancel" }).click();

  expect(consoleErrors()).toEqual([]);
});

test("npm run seed brings the sample bills back", async ({ page, request }) => {
  const consoleErrors = watchConsole(page);
  const sample = await listBills(request);

  await page.goto("/money/bills");
  await expect(page.locator("tbody tr")).toHaveCount(sample.length);
  await page.getByRole("button", { name: "Add bill" }).click();
  const modal = page.getByRole("dialog", { name: "Add bill" });
  await modal.getByLabel("Bill number").fill("E2E-SEED-1");
  await modal.getByLabel("Amount before tax (USD)").fill("25");
  await modal.getByLabel("Tax (USD)", { exact: true }).fill("0");
  await modal.getByRole("button", { name: "Add", exact: true }).click();
  await expect(row(page, "E2E-SEED-1")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(sample.length + 1);

  resetSampleData(); // the real command, confirmation included

  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(sample.length);
  await expect(row(page, "E2E-SEED-1")).toHaveCount(0);

  expect(consoleErrors()).toEqual([]);
});
