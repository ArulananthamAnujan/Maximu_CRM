import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/ui",
  use: { baseURL: "http://127.0.0.1:4173", viewport: { width: 390, height: 844 }, screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
    } : undefined },
  webServer: { command: "npx vite preview --host 127.0.0.1 --port 4173", url: "http://127.0.0.1:4173", reuseExistingServer: false },
});
