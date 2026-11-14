import { expect, test } from "@playwright/test";

test("home page has the Ridgeline heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Ridgeline/ })).toBeVisible();
});

test("body uses IBM Plex Sans", async ({ page }) => {
  await page.goto("/");
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family.replace(/["']/g, "")).toMatch(/^IBM Plex Sans/);
});
