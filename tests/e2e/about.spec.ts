import { expect, test } from "@playwright/test";

test.describe("about page layout", () => {
  test("On this page panel stays in the viewport while scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/about/");
    const panel = page.getByRole("complementary", { name: "On this page" });
    await expect(panel).toBeVisible();
    // The complementary column spans the whole page; the sticky element is the outline inside it.
    const outline = panel.getByTestId("about-outline");
    await expect(outline).toBeVisible();
    await page.evaluate(() => {
      const el = document.scrollingElement as HTMLElement;
      el.scrollTo(0, (el.scrollHeight - window.innerHeight) * 0.6);
    });
    await expect.poll(() => page.evaluate(() => (document.scrollingElement as HTMLElement).scrollTop)).toBeGreaterThan(0);
    const box = await outline.boundingBox();
    expect(box).not.toBeNull();
    const vh = page.viewportSize()?.height ?? 900;
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeLessThan(vh);
    expect(box!.y + box!.height).toBeGreaterThan(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vh);
  });

  test("no page-level horizontal overflow at 390 wide", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/about/");
    await expect(page.getByRole("heading", { name: "Validation" })).toBeVisible();
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement as HTMLElement;
      return { scrollWidth: el.scrollWidth, innerWidth: window.innerWidth };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
  });
});
