import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 900 } });

test("search 'apollo 11' sets the card title", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  const box = page.getByRole("combobox", { name: "Search sites" });
  await box.fill("apollo 11");
  await page.getByRole("option", { name: /Apollo 11 Eagle/ }).click();
  await expect(page.getByTestId("scenario-card-a")).toContainText("Apollo 11 Eagle", { timeout: 30_000 });
});

test("use actual landing date sets the date and time fields", async ({ page }) => {
  await page.goto("/?sc=apollo-11@2027-01-14T06:00Z");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Use actual landing date" }).click();
  await expect(page.getByRole("textbox", { name: "Landing date A (UTC)" })).toHaveValue("1969-07-20");
  await expect(page.getByRole("textbox", { name: "Landing time A (UTC)" })).toHaveValue("20:17");
});

test("click on south map sets custom coords card with grid badge", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Map" }).click();
  const map = page.getByTestId("map-south");
  await expect(map).toBeVisible();
  await expect(page.getByTestId("scale-bar")).toContainText("km");
  const box = (await map.boundingBox())!;
  // Left of the pole, near the 270 E meridian at about 86 S.
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await expect(page.getByTestId("scenario-card-a")).toContainText("LOLA grid, nearest point", { timeout: 30_000 });
  await expect(page.getByTestId("scenario-card-a")).toContainText("°,");
  await expect(page.getByRole("textbox", { name: "Latitude (°)" })).toHaveValue(/^-8\d/);
});

test("typed coordinates set a custom point; bad latitude is flagged", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  const lat = page.getByRole("textbox", { name: "Latitude (°)" });
  const lon = page.getByRole("textbox", { name: "Longitude (°)" });
  await lat.fill("-91");
  await lon.fill("10");
  await page.getByRole("button", { name: "Use these coordinates" }).click();
  await expect(page.getByText("Latitude must be -90 to 90°").first()).toBeVisible();
  await lat.fill("-85.3");
  await lon.fill("350");
  await page.getByRole("button", { name: "Use these coordinates" }).click();
  await expect(page.getByTestId("scenario-card-a")).toContainText("-85.30°, -10.00°", { timeout: 30_000 });
});

test("landing date and time: invalid input is flagged, valid input applies", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  const date = page.getByRole("textbox", { name: "Landing date A (UTC)" });
  const time = page.getByRole("textbox", { name: "Landing time A (UTC)" });
  await date.fill("2040-01-01");
  await expect(date).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Ephemeris covers 1969–2035").first()).toBeVisible();
  await date.fill("2027-1-1");
  await expect(page.getByText("Use YYYY-MM-DD").first()).toBeVisible();
  await date.fill("2027-02-10");
  await time.fill("25:00");
  await expect(time).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Use HH:MM, 24 hour").first()).toBeVisible();
  await time.fill("12:00");
  await expect(date).not.toHaveAttribute("aria-invalid", "true");
  await page.waitForTimeout(500);
  await expect.poll(() => page.url()).toContain("2027-02-10T12:00Z");
});

test("a failed data fetch shows Retry and Remove; Retry recovers the card", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Add scenario +14 d" }).click();
  await expect(page.getByTestId("scenario-card-b")).toBeVisible({ timeout: 30_000 });

  // Scenario C lands in 1969, a year file nothing has loaded yet.
  let blocking = true;
  await page.route("**/data/v1/ephemeris/**", (route) => (blocking ? route.abort() : route.continue()));
  await page.route("**/data/v1/dsn/**", (route) => (blocking ? route.abort() : route.continue()));
  await page.getByRole("button", { name: "Add scenario +14 d" }).click();
  const date = page.getByRole("textbox", { name: "Landing date C (UTC)" });
  await date.fill("1971-05-05");
  const error = page.getByTestId("scenario-error");
  await expect(error).toBeVisible({ timeout: 30_000 });
  await expect(error).toContainText("Couldn't load data");
  await expect(error.getByRole("button", { name: "Retry" })).toBeVisible();
  const remove = error.getByRole("button", { name: /Remove scenario/ });
  const rb = (await remove.boundingBox())!;
  expect(rb.width).toBeGreaterThanOrEqual(44);
  expect(rb.height).toBeGreaterThanOrEqual(44);

  blocking = false;
  await error.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("scenario-card-c")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("scenario-error")).toHaveCount(0);
});

test("Remove on the error card removes that scenario", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Add scenario +14 d" }).click();
  await expect(page.getByTestId("scenario-card-b")).toBeVisible({ timeout: 30_000 });
  await page.route("**/data/v1/ephemeris/**", (route) => route.abort());
  await page.getByRole("textbox", { name: "Landing date B (UTC)" }).fill("1972-03-03");
  const error = page.getByTestId("scenario-error");
  await expect(error).toBeVisible({ timeout: 30_000 });
  await error.getByRole("button", { name: /Remove scenario/ }).click();
  await expect(page.getByTestId("scenario-error")).toHaveCount(0);
  await expect(page.locator('[data-testid^="scenario-card-"]')).toHaveCount(1);
});
