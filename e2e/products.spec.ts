import { expect, type Page } from "@playwright/test";

import { resetSampleData, signIn, test, watchConsole } from "./helpers";

// Each test resets the sample data first, because every one of them changes it.
test.describe.configure({ timeout: 90_000 });

test.beforeEach(async ({ page }) => {
  resetSampleData();
  await signIn(page);
});

function row(page: Page, name: string) {
  return page.locator("tbody tr", { hasText: name });
}

async function addProduct(page: Page, name: string, price: string) {
  await page.getByRole("button", { name: "Add product" }).click();
  const modal = page.getByRole("dialog", { name: "Add product" });
  await modal.getByLabel("Name", { exact: true }).fill(name);
  await modal.getByLabel("Unit price (USD)").fill(price);
  await modal.getByRole("button", { name: "Add", exact: true }).click();
}

test("the sample price list has ten active products and two archived", async ({
  page,
}) => {
  const consoleErrors = watchConsole(page);
  await page.goto("/products");

  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(page.locator(".badge-active")).toHaveCount(10);
  await expect(row(page, "Priority support")).toContainText("$149.50");
  await expect(row(page, "Onsite training day")).toContainText("$1,200");
  // Sample rows carry both attribution lines; this one's differ.
  await expect(row(page, "Onsite training day")).toContainText(
    "joel@brightloop.example",
  );
  await expect(row(page, "Onsite training day")).toContainText(
    "sam@brightloop.example",
  );
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View" })).toHaveCount(0);

  const headers = await page
    .locator("thead th")
    .evaluateAll((cells) => cells.map((cell) => cell.textContent));
  for (const column of [
    "Name",
    "Description",
    "Unit price",
    "Status",
    "Added by",
    "Last changed by",
  ]) {
    expect(headers.join(" ")).toContain(column);
  }

  await page.getByRole("checkbox", { name: "Show archived" }).check();
  await expect(page.locator("tbody tr")).toHaveCount(12);
  await expect(page.locator(".badge-archived")).toHaveCount(2);
  await expect(row(page, "Legacy add-on")).toBeVisible();
  await expect(row(page, "Pilot license")).toBeVisible();

  // Six sections must still leave the search and the action room on a small
  // laptop, rather than squeezing the search to a sliver.
  await page.setViewportSize({ width: 1024, height: 900 });
  const search = await page
    .getByRole("textbox", { name: "Search" })
    .boundingBox();
  expect(search?.width ?? 0).toBeGreaterThan(100);
  const newDeal = await page
    .getByRole("button", { name: "New deal" })
    .boundingBox();
  expect(newDeal?.height ?? 0).toBeLessThan(50);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1024);

  expect(consoleErrors()).toEqual([]);
});

test("a product can be added, edited, searched, archived, restored and survives a reload", async ({
  page,
}) => {
  const consoleErrors = watchConsole(page);
  await page.goto("/products");

  await addProduct(page, "Workshop day", "1,250.50");
  await expect(row(page, "Workshop day")).toContainText("$1,250.50");
  await expect(row(page, "Workshop day")).toContainText("Active");
  await expect(row(page, "Workshop day")).toContainText(
    "alex@brightloop.example",
  );

  await row(page, "Workshop day").getByRole("button", { name: "Edit" }).click();
  const editModal = page.getByRole("dialog", { name: "Edit product" });
  await expect(editModal.getByLabel("Unit price (USD)")).toHaveValue(
    "$1,250.50",
  );
  await editModal.getByLabel("Name", { exact: true }).fill("Workshop day plus");
  await editModal.getByLabel("Description").fill("A hands-on workshop.");
  await editModal.getByLabel("Unit price (USD)").fill("1,350");
  await editModal.getByRole("button", { name: "Save" }).click();
  await expect(row(page, "Workshop day plus")).toContainText("$1,350");
  await expect(row(page, "Workshop day plus")).toContainText(
    "A hands-on workshop.",
  );

  await page.getByRole("searchbox").fill("workshop");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("searchbox").fill("");

  await row(page, "Workshop day plus")
    .getByRole("button", { name: "Archive" })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(row(page, "Workshop day plus")).toHaveCount(0);

  await page.getByRole("checkbox", { name: "Show archived" }).check();
  await expect(page.locator("tbody tr")).toHaveCount(13);
  await expect(row(page, "Workshop day plus")).toContainText("Archived");
  await expect(
    row(page, "Workshop day plus").getByRole("button", { name: "Restore" }),
  ).toBeVisible();

  // Editing an archived product leaves it archived.
  await row(page, "Workshop day plus")
    .getByRole("button", { name: "Edit" })
    .click();
  const archivedModal = page.getByRole("dialog", { name: "Edit product" });
  await archivedModal.getByLabel("Description").fill("Edited while archived.");
  await archivedModal.getByRole("button", { name: "Save" }).click();
  await expect(row(page, "Workshop day plus")).toContainText("Archived");
  await expect(row(page, "Workshop day plus")).toContainText(
    "Edited while archived.",
  );

  await row(page, "Workshop day plus")
    .getByRole("button", { name: "Restore" })
    .click();
  await expect(row(page, "Workshop day plus")).toContainText("Active");

  await page.reload();
  await page.getByRole("searchbox").fill("workshop");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(row(page, "Workshop day plus")).toContainText("$1,350");
  await expect(row(page, "Workshop day plus")).toContainText(
    "Edited while archived.",
  );

  expect(consoleErrors()).toEqual([]);
});

test("another teammate's edit credits both emails in the table", async ({
  page,
  request,
}) => {
  const consoleErrors = watchConsole(page);
  await page.goto("/products");
  await addProduct(page, "Attribution product", "99");
  await expect(row(page, "Attribution product")).toContainText(
    "alex@brightloop.example",
  );

  const products = (await (
    await request.get("/api/products?include_archived=true")
  ).json()) as { id: number; name: string }[];
  const product = products.find((item) => item.name === "Attribution product");
  expect(product, "the new product is missing from the API").toBeTruthy();

  // Another teammate saves through the API, the way her browser would.
  const signInAsPriya = await request.post("/api/local/sign-in", {
    data: { user_id: "priya" },
  });
  const { token } = (await signInAsPriya.json()) as { token: string };
  const saved = await request.put(`/api/products/${product?.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: "Attribution product",
      description: "Edited by Priya",
      price_cents: 9_900,
    },
  });
  expect(saved.ok(), `${saved.status()}: ${await saved.text()}`).toBe(true);

  await page.reload();
  const savedRow = row(page, "Attribution product");
  await expect(savedRow).toContainText("alex@brightloop.example");
  await expect(savedRow).toContainText("priya@brightloop.example");
  await expect(savedRow).toContainText("Edited by Priya");

  expect(consoleErrors()).toEqual([]);
});

test("a name is refused whatever the case, through the page and the API, archived or not", async ({
  page,
  request,
}) => {
  // Deliberate 400s make Chrome log failed-resource messages, so this test
  // leaves the console alone; the other product tests hold it to empty.
  await page.goto("/products");

  await page.getByRole("button", { name: "Add product" }).click();
  let modal = page.getByRole("dialog", { name: "Add product" });
  await modal.getByLabel("Name", { exact: true }).fill("PRIORITY SUPPORT");
  await modal.getByLabel("Unit price (USD)").fill("149.50");
  await modal.getByRole("button", { name: "Add", exact: true }).click();
  await expect(modal.getByRole("alert")).toHaveText(
    'A product named "Priority support" already exists.',
  );
  await modal.getByRole("button", { name: "Cancel" }).click();

  // An archived product's name stays reserved, through the page too.
  await page.getByRole("button", { name: "Add product" }).click();
  modal = page.getByRole("dialog", { name: "Add product" });
  await modal.getByLabel("Name", { exact: true }).fill("Legacy add-on");
  await modal.getByLabel("Unit price (USD)").fill("39");
  await modal.getByRole("button", { name: "Add", exact: true }).click();
  await expect(modal.getByRole("alert")).toHaveText(
    'A product named "Legacy add-on" already exists.',
  );
  await modal.getByRole("button", { name: "Cancel" }).click();

  for (const name of ["team LICENSE", "legacy ADD-ON"]) {
    const refused = await request.post("/api/products", {
      data: { name, description: null, price_cents: 100 },
    });
    expect(refused.status(), name).toBe(400);
    expect(
      ((await refused.json()) as { detail: string }).detail,
      name,
    ).toContain("already exists");
  }
});

test("npm run seed brings back the ten active and two archived products", async ({
  page,
}) => {
  const consoleErrors = watchConsole(page);
  await page.goto("/products");
  await row(page, "Starter license")
    .getByRole("button", { name: "Archive" })
    .click();
  await page.getByRole("checkbox", { name: "Show archived" }).check();
  await row(page, "Legacy add-on")
    .getByRole("button", { name: "Restore" })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(12);

  resetSampleData(); // the real command, confirmation included

  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(row(page, "Starter license")).toContainText("Active");
  await page.getByRole("checkbox", { name: "Show archived" }).check();
  await expect(page.locator("tbody tr")).toHaveCount(12);
  await expect(page.locator(".badge-archived")).toHaveCount(2);
  await expect(row(page, "Legacy add-on")).toContainText("Archived");

  expect(consoleErrors()).toEqual([]);
});
