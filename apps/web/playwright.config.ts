import { defineConfig, devices } from "@playwright/test";

// End-to-end tests need Postgres, Redis and S3 (docker compose up -d) plus seeded data
// (pnpm db:seed). They start their own worker and web server on port 3100.
const PORT = 3100;
const env = {
  ...(process.env as Record<string, string>),
  AUTH_DEV_LOGIN: "true",
  FIXTURE_SITES: "true",
  FIXTURE_SITE_NAME: "golden-site",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
      testIgnore: /responsive.spec.ts/,
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "pnpm --filter @seo/worker start",
      wait: { stdout: /Worker listening/ },
      env,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
    {
      command: `pnpm exec next dev --port ${PORT}`,
      url: `http://localhost:${PORT}/signin`,
      env,
      reuseExistingServer: !process.env["CI"],
      timeout: 240_000,
    },
  ],
});
