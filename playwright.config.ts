import { defineConfig, devices } from "playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  reporter: process.env.CI ? "dot" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run expo:static:build && npm run server:dev",
        url: `${baseURL}/app`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});