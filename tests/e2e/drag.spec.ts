import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 900 } });

test("dragging pin updates card metrics within one frame-throttled cycle", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("scenario-card-a");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText("Mons Mouton");

  const panel = page.getByTestId("scenario-map");
  await panel.scrollIntoViewIfNeeded();
  const map = panel.getByTestId("map-south");
  await expect(map).toBeVisible();
  const pin = panel.getByTestId("pin-a");
  await expect(pin).toBeVisible();

  const mapBox = (await map.boundingBox())!;
  const pinBox = (await pin.boundingBox())!;
  const startX = pinBox.x + pinBox.width / 2;
  const startY = pinBox.y + pinBox.height / 2;
  const endX = mapBox.x + mapBox.width * 0.35;
  const endY = mapBox.y + mapBox.height * 0.55;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 3 });
  await page.mouse.move(endX, endY, { steps: 3 });
  await page.mouse.up();

  await expect(card).toContainText("LOLA grid, nearest point", { timeout: 30_000 });
  await expect(card).toContainText("°,");
  await expect(page.getByRole("textbox", { name: "Latitude (°)" })).toHaveValue(/^-8\d/);
});

test("standalone landing page transitions into the planner, opens the 3D terrain view and back", async ({ page }) => {
  await page.goto("/?landing=1");
  const landing = page.getByTestId("landing-page");
  await expect(landing).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("left-panel")).toHaveCount(0);
  await expect(landing.getByTestId("moon-hero-canvas")).toBeVisible();
  await expect(landing.getByTestId("moon-showcase-canvas")).toBeVisible();
  await expect(landing.getByTestId("moon-horizon")).toBeVisible();

  await landing.getByRole("button", { name: "Mons Mouton vs Shackleton", exact: true }).click();
  await expect(page.getByTestId("landing-page")).toHaveCount(0);

  const cardA = page.getByTestId("scenario-card-a");
  const cardB = page.getByTestId("scenario-card-b");
  await expect(cardA).toBeVisible({ timeout: 30_000 });
  await expect(cardB).toBeVisible({ timeout: 30_000 });
  await expect(cardB).toContainText("Shackleton");
  // 3D is the default view; 2D skyline and back.
  await expect(cardA.getByRole("radio", { name: "3D terrain" })).toHaveAttribute("aria-checked", "true");
  await expect(cardA.getByTestId("lunar-terrain-3d")).toBeVisible({ timeout: 30_000 });
  await cardA.getByRole("radio", { name: "2D skyline" }).click();
  await expect(cardA.getByTestId("lunar-terrain-3d")).toHaveCount(0);
  await cardA.getByRole("radio", { name: "3D terrain" }).click();
  await expect(cardA.getByTestId("lunar-terrain-3d")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Landing page" }).click();
  await expect(page.getByTestId("landing-page")).toBeVisible({ timeout: 30_000 });
});

for (const width of [1440, 390]) {
  test(`static placeholder reserves the live 3D block height within 8px at ${width}px`, async ({ browser }) => {
    const size = { width, height: 900 };
    // Server HTML only: the prerendered card with its blank panorama box.
    const bare = await browser.newContext({ viewport: size, javaScriptEnabled: false });
    const barePage = await bare.newPage();
    await barePage.goto("/");
    const placeholder = (await barePage.getByTestId("static-panorama").boundingBox())!;
    await bare.close();

    const ctx = await browser.newContext({ viewport: size });
    const page = await ctx.newPage();
    await page.goto("/");
    const card = page.getByTestId("scenario-card-a");
    await expect(card.getByTestId("lunar-terrain-3d")).toBeVisible({ timeout: 30_000 });
    // The surface-mode row mounts once WebGL is ready, so wait for it before measuring the block.
    await expect(card.getByText("Shaded relief")).toBeVisible({ timeout: 30_000 });
    // The legend notes fill in once the terrain patch has loaded; the last line is the data citation.
    await expect(card.getByTestId("terrain-notes")).toContainText("LOLA", { timeout: 30_000 });
    // The robustness range arrives from the worker and grows the metrics bar above the block; measure once it has settled.
    await expect(card.getByTestId("metrics-bar")).toContainText("Range across", { timeout: 30_000 });
    // Live block: from the status row (holds the view toggle) to the end of the legend notes.
    const toggle = (await card.getByRole("radio", { name: "2D skyline" }).boundingBox())!;
    const notes = (await card.getByTestId("terrain-notes").boundingBox())!;
    const liveBlock = notes.y + notes.height - toggle.y;
    await ctx.close();
    expect(placeholder).toBeTruthy();
    expect(Math.abs(liveBlock - placeholder.height), `live ${liveBlock} (toggle ${toggle.y}, notes ${notes.y}+${notes.height}) vs placeholder ${placeholder.height}`).toBeLessThan(8);
  });
}
