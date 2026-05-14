import { defineConfig, devices } from "@playwright/test";

const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : [
        {
          command: "npm run dev -- --host 127.0.0.1 --port 5173",
          url: "http://127.0.0.1:5173",
          timeout: 120_000,
          reuseExistingServer: true,
        },
        {
          command: "cd ../website && npm run dev -- --hostname 127.0.0.1 --port 3000",
          url: "http://127.0.0.1:3000",
          timeout: 120_000,
          reuseExistingServer: true,
        },
      ],
});
