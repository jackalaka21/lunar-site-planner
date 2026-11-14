import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 900 } });

test("next good adds scenario with Good verdict", async ({ page }) => {
  // 1 Jan 2027 is not Good at this site, so the first result is a later window.
  await page.goto("/?sc=artemis3-mons-mouton@2027-01-01T00:00Z");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Find next good date" }).click();
  const list = page.getByRole("list", { name: "Next good dates" });
  await expect(list).toBeVisible({ timeout: 30_000 });
  const rows = list.getByRole("listitem");
  expect(await rows.count()).toBeLessThanOrEqual(3);
  expect(await rows.count()).toBeGreaterThan(0);
  await rows.first().getByRole("button", { name: "Add as scenario" }).click();
  const b = page.getByTestId("scenario-card-b");
  await expect(b).toBeVisible({ timeout: 30_000 });
  await expect(b).toContainText("Good", { timeout: 30_000 });
});

test("landing calendar computes in 1.5 s, has 365 cells and sets the landing day", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Landing calendar" }).click();
  const cal = page.getByTestId("landing-calendar");
  await expect(cal).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid^="cal-cell-"]')).toHaveCount(365);
  const ms = await page.evaluate(() => window.__lspTiming?.calendar.at(-1));
  expect(ms).toBeGreaterThan(0);
  expect(ms).toBeLessThanOrEqual(1500);
  await expect(page.getByText("Good windows drift ~2.3 days earlier each month")).toBeVisible();
  // Keyboard: focus the drawing, move to a day, pick it. The default landing is 14 Jan 06:00 UTC.
  await cal.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Landing date A (UTC)" })).toHaveValue("2027-01-15");
  await expect(page.getByRole("textbox", { name: "Landing time A (UTC)" })).toHaveValue("06:00");
});
