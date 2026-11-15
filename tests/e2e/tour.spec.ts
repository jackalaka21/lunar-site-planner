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

async function openTour(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Tutorial" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Step 1 of 10")).toBeVisible();
  return dialog;
}

test("ArrowRight and ArrowLeft move between steps", async ({ page }) => {
  const dialog = await openTour(page);
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByText("Step 2 of 10")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByText("Step 3 of 10")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByText("Step 2 of 10")).toBeVisible();
});

test("Previous goes back a step and is disabled on step 1", async ({ page }) => {
  const dialog = await openTour(page);
  await expect(dialog.getByRole("button", { name: "Previous" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog.getByText("Step 2 of 10")).toBeVisible();
  await dialog.getByRole("button", { name: "Previous" }).click();
  await expect(dialog.getByText("Step 1 of 10")).toBeVisible();
});

test("Finish on step 10 closes the tour", async ({ page }) => {
  const dialog = await openTour(page);
  for (let i = 1; i < 10; i++) {
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(dialog.getByText(`Step ${i + 1} of 10`)).toBeVisible();
  }
  await dialog.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByTestId("tour-root")).toHaveCount(0);
});

test("focus returns to the Tutorial button when the tour closes", async ({ page }) => {
  const dialog = await openTour(page);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tour-root")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tutorial" })).toBeFocused();
});
