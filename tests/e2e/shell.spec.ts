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
    // Wait for the live card: the prerendered one is swapped out, so its buttons would vanish mid-loop.
    await expect(page.getByTestId("scenario-card-a").locator("canvas[role='img']")).toBeVisible({ timeout: 60_000 });
    // The time bar shortcut trigger must be a real button, so the loop below covers it.
    // (Phones drop it: the shortcuts are for keyboards.)
    if (width >= 768)
      await expect(page.getByRole("button", { name: "Keyboard shortcuts" })).toBeVisible();
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

async function expectAllButtons44(root: import("@playwright/test").Locator) {
  const buttons = root.getByRole("button");
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const b = buttons.nth(i);
    if (!(await b.isVisible())) continue;
    const box = await b.boundingBox();
    const name = (await b.getAttribute("aria-label")) ?? (await b.innerText());
    if (/Next\.js Dev Tools/.test(name)) continue;
    expect(box?.width ?? 0, `${name} width`).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(44);
  }
}

for (const width of [375, 1440]) {
  test(`buttons inside the settings drawer are at least 44 by 44 at ${width} wide`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    // The live card (its canvas) exists only after hydration; the prerendered one is visible before any handler is attached.
    await expect(page.getByTestId("scenario-card-a").locator("canvas[role='img']")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await expect(dialog).toBeVisible();
    await expectAllButtons44(dialog);
  });
}

test("buttons inside the scenario sheet are at least 44 by 44 at 375 wide", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 }); // hydrated
  await page.getByRole("button", { name: "Open scenarios" }).click();
  const dialog = page.getByRole("dialog", { name: "Scenarios" });
  await expect(dialog).toBeVisible();
  await expectAllButtons44(dialog);
});

for (const width of [1440, 1024, 768]) {
  test(`header buttons keep 0.5rem clear of the header edges at ${width} wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const bar = page.getByTestId("top-bar");
    await expect(bar).toBeVisible();
    const barBox = await bar.boundingBox();
    expect(barBox?.height ?? 0).toBeGreaterThanOrEqual(72);
    const buttons = bar.getByRole("button");
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const b = buttons.nth(i);
      if (!(await b.isVisible())) continue;
      await b.hover();
      const box = await b.boundingBox();
      const name = (await b.getAttribute("aria-label")) ?? (await b.innerText());
      expect((box?.y ?? 0) - (barBox?.y ?? 0), `${name} clear above`).toBeGreaterThanOrEqual(8);
      expect(
        (barBox?.y ?? 0) + (barBox?.height ?? 0) - ((box?.y ?? 0) + (box?.height ?? 0)),
        `${name} clear below`,
      ).toBeGreaterThanOrEqual(8);
    }
  });
}
