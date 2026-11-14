import { expect, test } from "@playwright/test";

test("shell regions are present at desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  for (const id of ["top-bar", "left-panel", "cards", "time-bar-slot"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
});

test("left panel collapses to a drawer below 1024", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await page.goto("/");
  await expect(page.getByTestId("left-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Open scenarios" }).click();
  await expect(page.getByRole("dialog", { name: "Scenarios" })).toBeVisible();
});

test("stat strip dismisses and stays dismissed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("stat-strip")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).first().click();
  await page.reload();
  await expect(page.getByTestId("stat-strip")).toHaveCount(0);
});
