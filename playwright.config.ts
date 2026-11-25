import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a production build connected to a real Supabase project
 * (set the usual env vars plus E2E_* ones; see e2e/README.md).
 */
const port = Number(process.env.E2E_PORT || 3100);
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx next start -p ${port}`,
        url: `${baseURL}/login`,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        env: { NEXT_DIST_DIR: ".next-e2e" },
      },
});
