import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

const isProd = () => test.info().project.name === "production";

test.describe("layout at 375 wide", () => {
  test.skip(() => isProd(), "layout checks run against the dev server");

  test("swipe moves to second card", async ({ page }) => {
    await page.goto("/?v=1&sc=apollo-11@2026-12-01T00:00Z;shackleton-rim@2026-12-01T00:00Z");
    const deck = page.getByRole("region", { name: "Scenario cards" });
    await expect(page.getByTestId("scenario-card-b")).toBeAttached();
    const second = page.getByRole("button", { name: "Show card 2 of 2" });
    await expect(page.getByRole("button", { name: "Show card 1 of 2" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(deck).toBeVisible();
    await second.click();
    await expect(second).toHaveAttribute("aria-current", "true");
    await expect
      .poll(async () => (await page.getByTestId("scenario-card-b").boundingBox())?.x ?? 999)
      .toBeLessThan(40);
    const x = (await page.getByTestId("scenario-card-b").boundingBox())?.x ?? -999;
    expect(x).toBeGreaterThanOrEqual(0);
  });

  test("pager dots are 44 px targets and arrow keys move between cards", async ({ page }) => {
    await page.goto("/?v=1&sc=apollo-11@2026-12-01T00:00Z;shackleton-rim@2026-12-01T00:00Z");
    const dot = page.getByRole("button", { name: "Show card 1 of 2" });
    await expect(dot).toBeVisible();
    const box = await dot.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await dot.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "Show card 2 of 2" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await page.keyboard.press("ArrowLeft");
    await expect(dot).toHaveAttribute("aria-current", "true");
  });

  test("no horizontal page scroll", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("scenario-card-a")).toBeVisible();
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(overflow.doc).toBeLessThanOrEqual(0);
    expect(overflow.body).toBeLessThanOrEqual(0);
  });

  test("touch targets are at least 44 px", async ({ page }) => {
    await page.goto("/");
    // Wait for the live card: the prerendered one is swapped out, so its buttons would vanish mid-loop.
    await expect(page.getByTestId("scenario-card-a").locator("canvas[role='img']")).toBeVisible({ timeout: 60_000 });
    const buttons = page.getByRole("button");
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const b = buttons.nth(i);
      if (!(await b.isVisible())) continue;
      const name = (await b.getAttribute("aria-label")) ?? (await b.innerText());
      if (/Next\.js Dev Tools/.test(name)) continue;
      const box = await b.boundingBox();
      expect(box?.width ?? 0, `${name} width`).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test("scenario editing opens in a bottom sheet and the time bar stays in view", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("scenario-card-a")).toBeVisible();
    await page.getByRole("button", { name: "Edit scenario A" }).click();
    await expect(page.getByRole("dialog", { name: "Scenarios" })).toBeVisible();
    await page.keyboard.press("Escape");
    const bar = page.getByTestId("time-bar-slot");
    await page.mouse.wheel(0, 600);
    await expect(bar).toBeInViewport();
  });

  test("card order is metrics, panorama, timeline", async ({ page }) => {
    await page.goto("/");
    const card = page.getByTestId("scenario-card-a");
    await expect(card.locator("canvas[role='img']")).toBeVisible({ timeout: 30_000 }); // the live card, not the prerendered one
    const ys = await card.evaluate((el) => {
      const top = (sel: string) => el.querySelector(sel)?.getBoundingClientRect().top ?? -1;
      return [top("[data-testid='metrics-bar']"), top("canvas[role='img']"), top("[data-testid='timeline']")];
    });
    expect(ys.every((y) => y >= 0)).toBe(true);
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });
});

test.describe("production build", () => {
  test.skip(() => !isProd(), "needs the static export served by scripts/serve-out.mjs");

  test("manifest linked and sw registered in production build", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      /manifest\.webmanifest/,
    );
    const manifest = await page.request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    const json = await manifest.json();
    expect(json.display).toBe("standalone");
    expect(json.icons.length).toBeGreaterThanOrEqual(3);
    const scope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.scope;
    });
    expect(scope).toMatch(/\/$/);
  });

  test("offline reload shows cached app shell", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByTestId("scenario-card-a")).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Let the worker finish precaching and claim this page.
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Ridgeline" })).toBeVisible();
    await expect(page.getByText("Offline — showing cached data")).toBeVisible();
    await context.setOffline(false);
  });

  for (const [label, path] of [
    ["the default scenario", "/"],
    ["a non-default scenario (apollo-11)", "/?v=1&sc=apollo-11@2026-12-01T00:00Z"],
  ] as const) {
    test(`offline reload renders a live card for ${label} from the data cache`, async ({
      page,
      context,
    }) => {
      await page.goto(path);
      const card = page.getByTestId("scenario-card-a");
      // Live card: the canvas exists only once the worker has evaluated, so the data files were fetched and cached.
      await expect(card.locator("canvas[role='img']")).toBeVisible({ timeout: 60_000 });
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await expect
        .poll(() => page.evaluate(async () => (await caches.keys()).includes("ridgeline-data-v1")))
        .toBe(true);
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByText("Offline — showing cached data")).toBeVisible();
      await expect(card.getByText("Both hours")).toBeVisible({ timeout: 60_000 });
      await expect(card.locator("canvas[role='img']")).toBeVisible({ timeout: 60_000 });
      await expect(card).toContainText(/\d+ h/);
      await context.setOffline(false);
    });
  }

  test("a chunk load failure shows the update notice", async ({ page }) => {
    await page.goto("/");
    // Hydrated and live: the prerendered card is visible before any script runs.
    await expect(page.getByTestId("scenario-card-a").locator("canvas[role='img']")).toBeVisible({
      timeout: 60_000,
    });
    await page.evaluate(() => {
      void Promise.reject(
        Object.assign(new Error("Loading chunk 42 failed"), { name: "ChunkLoadError" }),
      );
    });
    await expect(page.getByText("New version available — reload")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  });
});
