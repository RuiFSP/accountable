import { expect, test } from "@playwright/test";

import { isoDaysFromNow, resetSampleData } from "./helpers";

test.beforeAll(() => {
  resetSampleData();
});

const usd = (cents: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const asNumber = (text: string): number => Number(text.replace(/[^0-9]/g, ""));

function kpi(page: import("@playwright/test").Page, label: string) {
  return page.locator(".kpi").filter({ hasText: label });
}

test("the dashboard shows charts, funnel, activity and follow-ups", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".kpi-grid .kpi")).toHaveCount(4);
  await expect(page.locator(".chart-box svg")).toHaveCount(2); // line + bar
  await expect(page.locator(".funnel-row")).toHaveCount(4);
  await expect(page.locator(".funnel-chips")).toContainText("Won, 12 months");
  await expect(page.locator(".funnel-chips")).toContainText("Lost");
  await expect(
    page.locator(".activity-list .activity-row").first(),
  ).toBeVisible();
  await expect(page.getByText("Overdue", { exact: true })).toBeVisible();
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
