import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 900 } });

test("dragging pin updates card metrics within one frame-throttled cycle", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("scenario-card-a");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText("Mons Mouton");

  await page.getByRole("tab", { name: "Map" }).click();
  const map = page.getByTestId("map-south");
  await expect(map).toBeVisible();
  const pin = page.getByTestId("pin-a");
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

test("landing hero presets and 3D terrain view switcher work interactively", async ({ page }) => {
  await page.goto("/");
  const hero = page.getByTestId("landing-hero");
  await expect(hero).toBeVisible({ timeout: 30_000 });
  await expect(hero.getByTestId("moon-hero-canvas")).toBeVisible();

  const card = page.getByTestId("scenario-card-a");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("radio", { name: "3D terrain" }).click();
  await expect(card.getByTestId("lunar-terrain-3d")).toBeVisible({ timeout: 30_000 });
  await expect(card.getByRole("button", { name: "Lander POV" })).toBeVisible();

  await hero.getByRole("button", { name: "Mons Mouton vs Shackleton", exact: true }).click();
  await expect(page.getByTestId("scenario-card-b")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("scenario-card-b")).toContainText("Shackleton");
});
