import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { resetSampleData, signIn, test, watchConsole } from "./helpers";

// Each test resets the sample data first, because every one of them changes it.
test.describe.configure({ timeout: 90_000 });

test.beforeEach(async ({ page }) => {
  resetSampleData();
  await signIn(page);
});

interface Row {
  id: number;
  number: string;
  deal_id: number;
  deal_name: string;
  status: string;
  subtotal_cents: number;
  total_cents: number;
  valid_until: string;
}

interface Totals {
  draft: number;
  sent: number;
  expired: number;
  accepted: number;
  declined: number;
}

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function quotes(request: APIRequestContext): Promise<Row[]> {
  const reply = await request.get("/api/quotes");
  return ((await reply.json()) as { quotes: Row[] }).quotes;
}

async function totals(request: APIRequestContext): Promise<Totals> {
  const reply = await request.get("/api/quotes");
  return ((await reply.json()) as { totals: Totals }).totals;
}

function kpi(page: Page, label: string) {
  return page.locator(".kpi").filter({ hasText: label }).locator(".kpi-value");
}

function quoteRow(page: Page, number: string) {
  return page.locator("tbody tr", { hasText: number });
}

test("the Quotes tab shows the five totals and the seeded quotes", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  const rows = await quotes(request);
  const sums = await totals(request);

  await page.goto("/money/quotes");

  for (const [label, amount] of [
    ["Draft", sums.draft],
    ["Sent", sums.sent],
    ["Expired", sums.expired],
    ["Accepted", sums.accepted],
    ["Declined", sums.declined],
  ] as const) {
    await expect(kpi(page, label)).toHaveText(usd(amount));
  }
  await expect(page.locator("tbody tr")).toHaveCount(rows.length);
  await expect(quoteRow(page, "QT-0004")).toContainText("Expired");
  await expect(quoteRow(page, "QT-0001")).toContainText("Accepted");
  await expect(page.getByRole("button", { name: "New quote" })).toHaveCount(0);

  expect(consoleErrors()).toEqual([]);
});

test("a draft opens with the company's details and its lines, and has no PDF", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  const draft = (await quotes(request)).find((row) => row.status === "draft");
  expect(draft).toBeTruthy();
  const detail = (await (
    await request.get(`/api/quotes/${draft?.id}`)
  ).json()) as {
    company: { name: string; address: string | null };
    contact_name: string | null;
  };

  await page.goto(`/money/quotes/${draft?.id}`);
  await expect(
    page.getByRole("heading", { name: draft!.number }),
  ).toBeVisible();
  await expect(
    page.getByText(detail.company.name, { exact: true }),
  ).toBeVisible();
  if (detail.company.address) {
    await expect(
      page.getByText(detail.company.address, { exact: true }),
    ).toBeVisible();
  }
  if (detail.contact_name) {
    await expect(page.locator(".quote-document")).toContainText(
      detail.contact_name,
    );
  }
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

  const refused = await request.get(`/api/quotes/${draft?.id}/pdf`);
  expect(refused.status()).toBe(400);

  expect(consoleErrors()).toEqual([]);
});

test("a quote from a deal comes together beside the preview and edits again", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  const dealId = (await quotes(request)).find(
    (row) => row.deal_name === "Cobalt records migration",
  )!.deal_id;

  await page.goto(`/deals/${dealId}`);
  await expect(quoteRow(page, "QT-0010")).toBeVisible();

  await page.getByRole("button", { name: "New quote" }).click();
  const dialog = page.getByRole("dialog", { name: "New quote" });
  await dialog.getByLabel("Product").selectOption({ label: "Data migration" });
  await dialog.getByLabel("Product").selectOption({ label: "Custom report" });
  const lines = dialog.locator(".quote-form-line");
  await expect(lines).toHaveCount(2);
  await lines.nth(0).getByLabel("Quantity").fill("2");
  await lines.nth(0).getByLabel("Description").fill("In two passes.");
  await lines.nth(1).getByLabel("Unit price (USD)").fill("700");

  // The preview and the form's totals add up the same: $3,600.00 + $700.00.
  const preview = dialog.locator(".quote-document");
  await expect(preview).toContainText("$3,600.00");
  await expect(preview).toContainText("$700.00");
  await expect(preview).toContainText("Subtotal$4,300.00");
  await expect(preview).toContainText("Sales tax (8.875%)$381.63");
  await expect(preview).toContainText("Total$4,681.63");
  await expect(dialog.locator(".quote-form-totals")).toContainText(
    "Total$4,681.63",
  );

  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog).toHaveCount(0);
  const created = (await quotes(request)).find(
    (row) => row.number === "QT-0013",
  );
  expect(created?.total_cents).toBe(468_163);
  await expect(quoteRow(page, "QT-0013")).toContainText("$4,681.63");

  // The Quotes list shows it too.
  await page.goto("/money/quotes");
  await expect(quoteRow(page, "QT-0013")).toContainText("$4,681.63");

  // Editing the draft moves its totals.
  await page.goto(`/money/quotes/${created?.id}`);
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit quote" });
  await edit
    .locator(".quote-form-line")
    .first()
    .getByLabel("Quantity")
    .fill("3");
  await edit.getByRole("button", { name: "Save" }).click();
  await edit.getByRole("button", { name: "Cancel" }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.locator(".quote-document")).toContainText("Total$6,641.38");

  // A later product change leaves the quote's line alone.
  const products = (await (await request.get("/api/products")).json()) as {
    id: number;
    name: string;
  }[];
  const product = products.find((row) => row.name === "Data migration")!;
  await request.put(`/api/products/${product.id}`, {
    data: {
      name: "Data migration",
      description: null,
      price_cents: 999_999,
    },
  });
  await page.reload();
  await expect(page.locator(".quote-document")).toContainText("$1,800.00");
  await expect(page.locator(".quote-document")).toContainText("Total$6,641.38");

  expect(consoleErrors()).toEqual([]);
});

test("sending freezes a quote and accepting it wins the deal", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  const rows = await quotes(request);
  const sent = rows.find((row) => row.status === "sent")!;
  const second = (await (
    await request.post("/api/quotes", {
      data: {
        deal_id: sent.deal_id,
        valid_until: null,
        lines: [
          {
            product_id: 1,
            description: null,
            quantity: 1,
            unit_price_cents: 10_000,
          },
        ],
      },
    })
  ).json()) as { id: number };
  await request.post(`/api/quotes/${second.id}/send`);

  await page.goto(`/money/quotes/${sent.id}`);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  const refused = await request.put(`/api/quotes/${sent.id}`, {
    data: { valid_until: null, lines: [] },
  });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).detail).toBe("Only a draft can be changed.");

  const dealsBefore = (await (await request.get("/api/deals")).json()) as {
    id: number;
    stage: string;
  }[];
  const stageBefore = dealsBefore.find((row) => row.id === sent.deal_id)!.stage;

  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.locator(".badge-positive")).toHaveText("Accepted");

  const deals = (await (await request.get("/api/deals")).json()) as {
    id: number;
    stage: string;
    value_cents: number;
  }[];
  const deal = deals.find((row) => row.id === sent.deal_id)!;
  const dollars = Math.round(sent.subtotal_cents / 100) * 100;
  expect(deal.stage).toBe("Won");
  expect(deal.value_cents).toBe(dollars);

  await page.goto(`/deals/${sent.deal_id}`);
  await expect(page.locator(".badge-Won")).toBeVisible();
  await expect(
    page.getByText(`Moved from ${stageBefore} to Won`),
  ).toBeVisible();
  await expect(page.getByText("alex@brightloop.example").first()).toBeVisible();

  const again = await request.post(`/api/quotes/${second.id}/accept`);
  expect(again.status()).toBe(400);
  expect((await again.json()).detail).toBe(
    "This deal already has an accepted quote.",
  );

  expect(consoleErrors()).toEqual([]);
});

test("an expired quote counts as expired and can still be answered or copied", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  const sums = await totals(request);

  await page.goto("/money/quotes");
  await expect(kpi(page, "Expired")).toHaveText(usd(sums.expired));
  await expect(quoteRow(page, "QT-0004")).toContainText("Expired");

  await quoteRow(page, "QT-0004").getByRole("link").click();
  await expect(page.getByRole("heading", { name: "QT-0004" })).toBeVisible();
  await expect(page.locator(".badge-negative")).toHaveText("Expired");
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.locator(".badge-negative")).toHaveText("Declined");

  // The other expired quote copies to a fresh draft while the original stands.
  await page.goto("/money/quotes");
  await quoteRow(page, "QT-0003").getByRole("link").click();
  await expect(page.getByRole("heading", { name: "QT-0003" })).toBeVisible();
  await expect(page.locator(".badge-negative")).toHaveText("Expired");
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("heading", { name: "QT-0013" })).toBeVisible();
  await expect(page.locator(".badge-neutral")).toHaveText("Draft");
  const rows = await quotes(request);
  const original = rows.find((row) => row.number === "QT-0003")!;
  expect(original.status).toBe("expired");

  expect(consoleErrors()).toEqual([]);
});

test("the PDF downloads for a sent quote, and nothing is ever deleted", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  const sent = (await quotes(request)).find((row) => row.status === "sent")!;

  await page.goto(`/money/quotes/${sent.id}`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${sent.number}.pdf`);
  const pdf = await request.get(`/api/quotes/${sent.id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  const removed = await request.delete(`/api/quotes/${sent.id}`);
  expect(removed.status()).toBe(405);
  expect((await request.get(`/api/quotes/${sent.id}`)).status()).toBe(200);

  // The numbers carry on after the sample's.
  const created = (await (
    await request.post("/api/quotes", {
      data: {
        deal_id: sent.deal_id,
        valid_until: null,
        lines: [
          {
            product_id: 1,
            description: null,
            quantity: 1,
            unit_price_cents: 10_000,
          },
        ],
      },
    })
  ).json()) as { number: string };
  expect(created.number).toBe("QT-0013");

  expect(consoleErrors()).toEqual([]);
});
