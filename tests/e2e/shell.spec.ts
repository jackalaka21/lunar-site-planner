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

for (const width of [375, 1440]) {
  test(`every shell button is at least 44 by 44 at ${width} wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.getByTestId("stat-strip")).toBeVisible();
    const buttons = page.getByRole("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(2);
    for (let i = 0; i < count; i++) {
      const b = buttons.nth(i);
      if (!(await b.isVisible())) continue;
      const box = await b.boundingBox();
      const name = (await b.getAttribute("aria-label")) ?? (await b.innerText());
      // The Next.js dev overlay is not part of the app.
      if (/Next\.js Dev Tools/.test(name)) continue;
      expect(box?.width ?? 0, `${name} width`).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(44);
    }
  });
}
