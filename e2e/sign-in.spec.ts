import { expect } from "@playwright/test";

import { resetSampleData, SIGNED_IN_AS, signIn, test } from "./helpers";

test.beforeAll(() => {
  resetSampleData();
});

test("the dashboard, a deep link and an unknown address each show the sign-in screen", async ({
  page,
}) => {
  for (const path of ["/", "/contacts/1", "/nowhere"]) {
    await page.goto(path);

    await expect(
      page.getByRole("heading", { name: "Accountable" }),
      path,
    ).toBeVisible();
    await expect(page.getByRole("navigation"), path).toHaveCount(0);
    await expect(
      page.getByRole("switch", { name: "Dark mode" }),
      path,
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "New deal" }),
      path,
    ).toHaveCount(0);
  }
});

test("the screen lists the four teammates", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /Alex Rivera/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /alex@brightloop\.example/ }),
  ).toBeVisible();
  // The teammate with no name is on the list by email alone.
  await expect(
    page.getByRole("button", { name: /sam@brightloop\.example/ }),
  ).toBeVisible();
});

test("choosing one opens the address the app was opened at", async ({
  page,
}) => {
  await page.goto("/contacts/1");

  await page.getByRole("button", { name: /Alex Rivera/ }).click();

  await expect(page.getByRole("heading", { name: "Ana Silva" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/contacts/1");
});

test("a reload stays signed in", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("a token the backend refuses brings the screen back with the session-ended message", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // What a stale token looks like: kept in storage, turned away by the API.
  await page.evaluate(() => {
    localStorage.setItem(
      "accountable-session",
      JSON.stringify({
        token: "a-token-the-backend-refuses",
        email: "alex@brightloop.example",
      }),
    );
  });
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Accountable" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your session ended. Sign in again."),
  ).toBeVisible();
});

test("signing out returns to the dashboard signed out", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: SIGNED_IN_AS }).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(
    page.getByRole("heading", { name: "Accountable" }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
