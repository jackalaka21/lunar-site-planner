import { expect, test, type Page } from "@playwright/test";

const ADD = { name: "Add scenario +14 d" };

async function stableText(page: Page, testId: string): Promise<string> {
  const card = page.getByTestId(testId);
  let prev = "";
  for (let i = 0; i < 20; i++) {
    const now = await card.innerText();
    if (now === prev && now.length > 0) return now;
    prev = now;
    await page.waitForTimeout(700);
  }
  return prev;
}

test("default view shows one card with verdict", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const card = page.getByTestId("scenario-card-a");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("scenario-card-b")).toHaveCount(0);
  await expect(card).toContainText("Good");
  await expect(page.getByTestId("card-grid")).toHaveAttribute("data-columns", "1");
});

test("add scenario +14d shows two cards", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", ADD).click();
  await expect(page.getByTestId("scenario-card-b")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("card-grid")).toHaveAttribute("data-columns", "2");
  // The second card names its reference.
  await expect(page.getByTestId("scenario-card-b")).toContainText("vs A");
});

test("copy link, open in new page: identical card headers and metrics text", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", ADD).click();
  await expect(page.getByTestId("scenario-card-b")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600); // URL sync is debounced
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("region", { name: "Notifications" }).getByText("Link copied")).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("sc=");

  const a1 = await stableText(page, "scenario-card-a");
  const b1 = await stableText(page, "scenario-card-b");

  const other = await context.newPage();
  await other.setViewportSize({ width: 1280, height: 900 });
  await other.goto(link);
  await expect(other.getByTestId("scenario-card-b")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => stableText(other, "scenario-card-a"), { timeout: 30_000 }).toBe(a1);
  await expect.poll(() => stableText(other, "scenario-card-b"), { timeout: 30_000 }).toBe(b1);
});

test("bad link shows notice", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?sc=nope@x");
  await expect(page.getByTestId("notices")).toContainText("Unknown site");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid^="scenario-card-"]')).toHaveCount(1);
});

test("recompute under 150ms", { tag: "@perf" }, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("scenario-card-a")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500); // let the first request and robustness settle: the worker is warm
  await page.getByRole("button", ADD).click();
  await expect(page.getByTestId("scenario-card-b")).toBeVisible({ timeout: 30_000 });
  const timing = await page.evaluate(() => window.__lspTiming);
  expect(timing?.evaluate.length).toBeGreaterThanOrEqual(2);
  console.log("recompute ms", JSON.stringify(timing?.evaluate));
  expect(timing?.last ?? Infinity).toBeLessThan(150);
});

test("without Web Workers a notice explains and no card is shown", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "Worker");
  });
  await page.goto("/");
  await expect(page.getByTestId("notices")).toContainText(
    "This browser can't run the calculator (Web Workers unavailable).",
  );
  await expect(page.locator('[data-testid^="scenario-card-"]')).toHaveCount(0);
});
