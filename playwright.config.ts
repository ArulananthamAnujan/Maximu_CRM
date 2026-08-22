import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive a real browser against the built Worker, which
 * scripts/verify-ui.sh starts along with a PostgreSQL database, the PostgREST
 * stand-in and the Drive stub. The stack is already running when Playwright
 * starts, so there is no webServer here.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // A CRM screen is wide; the mobile layout is checked explicitly in its own test.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        // In CI, `playwright install chromium` puts the matching build where
        // Playwright looks for it. Set PLAYWRIGHT_CHROMIUM to use a browser
        // that is already on the machine instead.
        ...(process.env.PLAYWRIGHT_CHROMIUM
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM } }
          : {}),
      },
    },
  ],
});
