import { defineConfig, devices } from "@playwright/test";

const DEV_PORT = 3100;
const PROD_PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { trace: "on-first-retry" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${DEV_PORT}` },
    },
    {
      // The static export (run `npm run build` first) served as on Vercel: service worker and manifest.
      name: "production",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PROD_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npx next dev --port ${DEV_PORT}`,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `node scripts/serve-out.mjs ${PROD_PORT}`,
      url: `http://localhost:${PROD_PORT}/manifest.webmanifest`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
