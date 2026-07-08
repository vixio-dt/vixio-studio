import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  // Two workers: the heavy specs (WebCodecs final render, previz capture,
  // real-time animatic recording) are CPU bound and flake when they contend
  // for the container's four cores.
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:5180",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
    // The container pre-installs Chromium at a pinned path; @playwright/test
    // is newer than that build, so point at the binary directly instead of
    // downloading a matching one.
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5180 --strictPort",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
