import { expect, test } from "@playwright/test";

test("home page has the Ridgeline heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Ridgeline/ })).toBeVisible();
});

test("body uses IBM Plex Sans", async ({ page }) => {
  await page.goto("/");
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family.replace(/["']/g, "")).toMatch(/^IBM Plex Sans/);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`system ${scheme} preference`, () => {
    test.use({ colorScheme: scheme });

    test("hydrates without errors and renders dark with no stored preference", async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") problems.push(msg.text());
      });
      page.on("pageerror", (err) => problems.push(err.message));
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
        .toBe("dark");
      expect(problems.filter((p) => /hydrat|did not match|mismatch/i.test(p))).toEqual([]);
    });
  });
}
