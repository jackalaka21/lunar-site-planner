import { expect, test } from "@playwright/test";

test("the Tutorial button opens the tour, steps forward and Escape closes it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Tutorial" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Step 1 of 10")).toBeVisible();
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog.getByText("Step 2 of 10")).toBeVisible();
  const ring = page.getByTestId("tour-ring");
  await expect(ring).toBeVisible();
  const topbar = await page.getByTestId("top-bar").boundingBox();
  await expect
    .poll(async () => (await ring.boundingBox())?.y ?? 9999)
    .toBeLessThan((topbar?.y ?? 0) + (topbar?.height ?? 0));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tour-root")).toHaveCount(0);
});

test("the tour does not start by itself under automation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("tour-root")).toHaveCount(0);
});
