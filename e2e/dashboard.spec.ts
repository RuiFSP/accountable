import { expect } from "@playwright/test";

import { AGING_BUCKETS, agingBucket } from "../frontend/src/lib/invoice";
import { isoDaysFromNow, resetSampleData, signIn, test } from "./helpers";

test.beforeAll(() => {
  resetSampleData();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

const usd = (cents: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/** The bills' money style: cents only when there are any. */
const billUsd = (cents: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

const asNumber = (text: string): number => Number(text.replace(/[^0-9]/g, ""));

function kpi(page: import("@playwright/test").Page, label: string) {
  return page.locator(".kpi").filter({ hasText: label });
}

/** The Money section's figures, clear of the sales figures above them. */
function moneyKpi(page: import("@playwright/test").Page, label: string) {
  return page.locator(".money-suppliers .kpi").filter({ hasText: label });
}

interface Bill {
  id: number;
  organization_name: string;
  bill_number: string;
  bill_date: string;
  due_date: string;
  category: string;
  total_cents: number;
  status: "unpaid" | "overdue" | "paid";
}

async function listBills(
  request: import("@playwright/test").APIRequestContext,
): Promise<Bill[]> {
  const response = await request.get("/api/bills");
  expect(response.ok()).toBe(true);
  return (await response.json()) as Bill[];
}

test("the dashboard shows charts, funnel, activity and follow-ups", async ({
  page,
}) => {
  await page.goto("/");
  for (const label of [
    "Revenue won",
    "Open pipeline",
    "Expected revenue",
    "Overdue follow-ups",
  ]) {
    await expect(page.locator(".kpi").filter({ hasText: label })).toBeVisible();
  }
  for (const heading of ["Revenue won per month", "Deals won per month"]) {
    await expect(
      page.locator(".panel").filter({ hasText: heading }).locator("svg"),
    ).toBeVisible();
  }
  await expect(page.locator(".funnel-row")).toHaveCount(4);
  await expect(page.locator(".funnel-chips")).toContainText("Won, 12 months");
  await expect(page.locator(".funnel-chips")).toContainText("Lost");
  await expect(
    page.locator(".activity-list .activity-row").first(),
  ).toBeVisible();
  // The Money section below carries its own "Overdue" labels, so this one is
  // the follow-up group's heading.
  await expect(
    page.getByRole("heading", { name: "Overdue", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Upcoming", { exact: true })).toBeVisible();
});

test("every figure matches the data behind it", async ({ page, request }) => {
  const deals = (await (await request.get("/api/deals")).json()) as {
    stage: string;
    value_cents: number;
    probability: number;
    close_date: string | null;
  }[];
  const activities = (await (await request.get("/api/activities")).json()) as {
    follow_up_date: string | null;
    done: boolean;
  }[];

  const open = deals.filter(
    (deal) => deal.stage !== "Won" && deal.stage !== "Lost",
  );
  const today = new Date();
  const windowStart = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const wonInWindow = deals.filter((deal) => {
    if (deal.stage !== "Won" || !deal.close_date) return false;
    const close = new Date(`${deal.close_date}T00:00:00`);
    return close >= windowStart && close <= today;
  });
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const openFollowUps = activities.filter(
    (activity) => activity.follow_up_date && !activity.done,
  );
  const overdue = openFollowUps.filter(
    (activity) =>
      new Date(`${activity.follow_up_date}T00:00:00`) < startOfToday,
  );

  await page.goto("/");

  await expect(kpi(page, "Open pipeline").locator(".kpi-value")).toHaveText(
    usd(open.reduce((sum, deal) => sum + deal.value_cents, 0)),
  );
  await expect(kpi(page, "Open pipeline").locator(".kpi-note")).toHaveText(
    `${open.length} open deals`,
  );
  await expect(kpi(page, "Expected revenue").locator(".kpi-value")).toHaveText(
    usd(
      open.reduce(
        (sum, deal) =>
          sum + Math.floor((deal.value_cents * deal.probability) / 100),
        0,
      ),
    ),
  );
  await expect(kpi(page, "Revenue won").locator(".kpi-value")).toHaveText(
    usd(wonInWindow.reduce((sum, deal) => sum + deal.value_cents, 0)),
  );
  await expect(kpi(page, "Revenue won").locator(".kpi-note")).toHaveText(
    `${wonInWindow.length} deals won`,
  );
  await expect(
    kpi(page, "Overdue follow-ups").locator(".kpi-value"),
  ).toHaveText(String(overdue.length));
  await expect(kpi(page, "Overdue follow-ups").locator(".kpi-note")).toHaveText(
    `of ${openFollowUps.length} open follow-ups`,
  );
});

test("marking a deal won moves the pipeline and revenue figures", async ({
  page,
  request,
}) => {
  const deals = (await (await request.get("/api/deals")).json()) as {
    id: number;
    stage: string;
    value_cents: number;
    close_date: string | null;
  }[];
  const candidate = deals.find(
    (deal) =>
      deal.stage === "Negotiation" &&
      deal.close_date &&
      new Date(`${deal.close_date}T00:00:00`) < new Date(),
  );
  expect(candidate).toBeTruthy();

  await page.goto("/");
  const pipelineBefore = asNumber(
    await kpi(page, "Open pipeline").locator(".kpi-value").innerText(),
  );
  const wonBefore = asNumber(
    await kpi(page, "Revenue won").locator(".kpi-value").innerText(),
  );

  const moved = await request.post(`/api/deals/${candidate!.id}/stage`, {
    data: { stage: "Won", position: 0 },
  });
  expect(moved.ok()).toBe(true);

  await page.reload();
  const pipelineAfter = asNumber(
    await kpi(page, "Open pipeline").locator(".kpi-value").innerText(),
  );
  const wonAfter = asNumber(
    await kpi(page, "Revenue won").locator(".kpi-value").innerText(),
  );

  expect(pipelineBefore - pipelineAfter).toBe(candidate!.value_cents / 100);
  expect(wonAfter - wonBefore).toBe(candidate!.value_cents / 100);
});

test("a new follow-up shows up on the dashboard right away", async ({
  page,
  request,
}) => {
  const contacts = (await (await request.get("/api/contacts")).json()) as {
    id: number;
  }[];

  await page.goto("/");
  const noteBefore = await kpi(page, "Overdue follow-ups")
    .locator(".kpi-note")
    .innerText();
  const openBefore = Number(noteBefore.replace(/[^0-9]/g, ""));

  const created = await request.post("/api/activities", {
    data: {
      type: "call",
      contact_id: contacts[0].id,
      deal_id: null,
      description: "E2E dashboard follow-up",
      happened_at: new Date().toISOString().slice(0, 16),
      follow_up_date: isoDaysFromNow(2),
      done: false,
    },
  });
  expect(created.ok()).toBe(true);

  await page.reload();
  await expect(
    page.locator(".followup-row", { hasText: "E2E dashboard follow-up" }),
  ).toBeVisible();
  const noteAfter = await kpi(page, "Overdue follow-ups")
    .locator(".kpi-note")
    .innerText();
  expect(Number(noteAfter.replace(/[^0-9]/g, ""))).toBe(openBefore + 1);
});

interface InvoiceRow {
  id: number;
  status: string;
  due_date: string | null;
  balance_cents: number | null;
}

interface MoneyPayload {
  owed_cents: number;
  overdue_cents: number;
  aging: { bucket: string; cents: number }[];
  payments: { month: string; cents: number }[];
}

function startOfToday(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

interface MoneyFigures {
  owed: number;
  overdue: number;
  buckets: Map<string, number>;
}

/** What is owed and how late, worked out here from the invoices themselves. */
function figuresFrom(invoices: InvoiceRow[], today: Date): MoneyFigures {
  let owed = 0;
  let overdue = 0;
  const buckets = new Map(AGING_BUCKETS.map((bucket) => [bucket, 0]));
  for (const invoice of invoices) {
    if (invoice.status === "draft" || invoice.status === "void") continue;
    const balance = invoice.balance_cents ?? 0;
    if (balance <= 0) continue;
    owed += balance;
    const bucket = invoice.due_date
      ? agingBucket(invoice.due_date, today)
      : "not yet due";
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + balance);
    if (invoice.due_date && new Date(`${invoice.due_date}T00:00:00`) < today) {
      overdue += balance;
    }
  }
  return { owed, overdue, buckets };
}

interface ReceivedPayment {
  paid_on: string;
  amount_cents: number;
}

/** What arrived in each of the last 12 months, by the day it landed. */
function paymentsByMonth(
  received: ReceivedPayment[],
  windowStart: Date,
  today: Date,
): Map<string, number> {
  const perMonth = new Map<string, number>();
  for (
    let month = windowStart;
    month <= today;
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  ) {
    perMonth.set(monthKey(month), 0);
  }
  for (const payment of received) {
    const day = new Date(`${payment.paid_on}T00:00:00`);
    if (day < windowStart || day > today) continue;
    perMonth.set(
      monthKey(day),
      (perMonth.get(monthKey(day)) ?? 0) + payment.amount_cents,
    );
  }
  return perMonth;
}

/** "Jul" for a "YYYY-MM" bucket, the way the charts label their months. */
function shortMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  });
}

function monthKey(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
}

test("the Money section's figures, aging and payments match what is behind them", async ({
  page,
  request,
}) => {
  const invoices = (await (
    await request.get("/api/invoices")
  ).json()) as InvoiceRow[];
  const dashboard = (await (await request.get("/api/dashboard")).json()) as {
    money: MoneyPayload;
  };

  const today = startOfToday();
  const { owed, overdue, buckets } = figuresFrom(invoices, today);

  // And the payments, out of each invoice's own payments.
  const received: ReceivedPayment[] = [];
  for (const invoice of invoices) {
    const detail = (await (
      await request.get(`/api/invoices/${invoice.id}`)
    ).json()) as { payments: { paid_on: string; amount_cents: number }[] };
    received.push(...detail.payments);
  }
  const windowStart = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const perMonth = paymentsByMonth(received, windowStart, today);

  expect(received.length).toBeGreaterThan(0);
  expect(dashboard.money.owed_cents).toBe(owed);
  expect(dashboard.money.overdue_cents).toBe(overdue);
  expect(dashboard.money.aging.map((row) => row.cents)).toEqual(
    AGING_BUCKETS.map((bucket) => buckets.get(bucket) ?? 0),
  );
  expect(
    Object.fromEntries(
      dashboard.money.payments.map((row) => [row.month, row.cents]),
    ),
  ).toEqual(Object.fromEntries(perMonth));

  await page.goto("/");

  await expect(kpi(page, "Owed by customers").locator(".kpi-value")).toHaveText(
    usd(owed),
  );
  await expect(
    page
      .locator(".money-customers .kpi")
      .filter({ hasText: "Overdue" })
      .locator(".kpi-value"),
  ).toHaveText(usd(overdue));

  const rows = page.locator(".aging-row");
  await expect(rows).toHaveCount(5);
  for (const [index, bucket] of AGING_BUCKETS.entries()) {
    await expect(rows.nth(index).locator(".aging-label")).toHaveText(bucket);
    await expect(rows.nth(index).locator(".aging-value")).toHaveText(
      usd(buckets.get(bucket) ?? 0),
    );
  }

  const payments = page
    .locator(".panel")
    .filter({ has: page.getByRole("heading", { name: "Payments received" }) });
  await expect(payments.locator("svg")).toBeVisible();
  // Every one of the 12 months is labelled on the line's axis, so the chart
  // plots the same buckets the figures above it came from.
  for (const month of perMonth.keys()) {
    await expect(payments.getByText(shortMonth(month))).toBeVisible();
  }
});

test("the Money figures and timeline match the unpaid bills behind them", async ({
  page,
  request,
}) => {
  const bills = await listBills(request);
  const today = isoDaysFromNow(0);
  const horizon = isoDaysFromNow(30);
  const unpaid = bills.filter((bill) => bill.status !== "paid");
  const overdue = bills.filter((bill) => bill.status === "overdue");
  const dueSoon = unpaid
    .filter((bill) => bill.due_date >= today && bill.due_date <= horizon)
    .sort(
      (left, right) =>
        left.due_date.localeCompare(right.due_date) || left.id - right.id,
    );
  expect(overdue.length).toBeGreaterThan(0);
  expect(dueSoon.length).toBeGreaterThan(0);

  await page.goto("/");

  await expect(moneyKpi(page, "Bills to pay").locator(".kpi-value")).toHaveText(
    billUsd(unpaid.reduce((sum, bill) => sum + bill.total_cents, 0)),
  );
  await expect(moneyKpi(page, "Bills to pay").locator(".kpi-note")).toHaveText(
    `${unpaid.length} bills`,
  );
  await expect(moneyKpi(page, "Overdue").locator(".kpi-value")).toHaveText(
    billUsd(overdue.reduce((sum, bill) => sum + bill.total_cents, 0)),
  );
  await expect(moneyKpi(page, "Overdue").locator(".kpi-note")).toHaveText(
    `${overdue.length} bills`,
  );
  await expect(
    moneyKpi(page, "Due in the next 30 days").locator(".kpi-value"),
  ).toHaveText(
    billUsd(dueSoon.reduce((sum, bill) => sum + bill.total_cents, 0)),
  );
  await expect(
    moneyKpi(page, "Due in the next 30 days").locator(".kpi-note"),
  ).toHaveText(`${dueSoon.length} bills`);

  const timeline = page.locator(".panel").filter({ hasText: "Bills due soon" });
  await expect(timeline.locator("li")).toHaveCount(dueSoon.length);
  await expect(timeline.locator("li").first()).toContainText(
    dueSoon[0].organization_name,
  );
  await expect(timeline.locator("li").first()).toContainText(
    billUsd(dueSoon[0].total_cents),
  );

  await expect(page.locator(".spending-bar")).toHaveCount(12);
  await expect(page.locator(".spending-segment")).toHaveCount(72);
  const legend = await page
    .locator(".spending-legend .legend-item")
    .allInnerTexts();
  expect(legend.map((item) => item.trim())).toEqual([
    "Software",
    "Contractors",
    "Travel",
    "Office",
    "Marketing",
    "Other",
  ]);
  const filled = await page
    .locator(".spending-bar")
    .evaluateAll((bars) =>
      bars.map((bar) =>
        Array.from(bar.querySelectorAll(".spending-segment")).some(
          (segment) => segment.getBoundingClientRect().height > 0,
        ),
      ),
    );
  expect(filled.every(Boolean)).toBe(true);
});

test("marking a bill paid moves the figures and its month's bar at once", async ({
  page,
  request,
}) => {
  const bills = await listBills(request);
  const month = isoDaysFromNow(0).slice(0, 7);
  const candidate = bills.find(
    (bill) =>
      bill.status === "unpaid" &&
      bill.category === "Contractors" &&
      bill.bill_date.startsWith(month),
  );
  expect(
    candidate,
    "the sample has this month's unpaid contractor bill",
  ).toBeTruthy();

  const unpaid = bills.filter((bill) => bill.status !== "paid");
  const expectedTotal =
    unpaid.reduce((sum, bill) => sum + bill.total_cents, 0) -
    candidate!.total_cents;
  const expectedCount = unpaid.length - 1;

  await page.goto("/");
  await expect(moneyKpi(page, "Bills to pay").locator(".kpi-value")).toHaveText(
    billUsd(unpaid.reduce((sum, bill) => sum + bill.total_cents, 0)),
  );
  const currentBar = page.locator(".spending-bar").last();
  const contractors = currentBar.locator(
    '.spending-segment[data-category="Contractors"]',
  );
  expect(
    await contractors.evaluate(
      (element) => element.getBoundingClientRect().height,
    ),
  ).toBe(0);

  await page.goto("/money/bills");
  await page.getByRole("searchbox").fill(candidate!.bill_number);
  const billRow = page.locator("tbody tr", { hasText: candidate!.bill_number });
  await billRow.getByRole("button", { name: "Mark paid" }).click();
  await expect(billRow.locator(".badge-positive")).toHaveText("Paid");

  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Dashboard" })
    .click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(moneyKpi(page, "Bills to pay").locator(".kpi-value")).toHaveText(
    billUsd(expectedTotal),
  );
  await expect(moneyKpi(page, "Bills to pay").locator(".kpi-note")).toHaveText(
    `${expectedCount} ${expectedCount === 1 ? "bill" : "bills"}`,
  );
  await expect(
    page
      .locator(".spending-bar")
      .last()
      .locator('.spending-segment[data-category="Contractors"]'),
  ).not.toHaveCSS("height", "0px");
});
