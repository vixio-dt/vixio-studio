import { defineConfig } from "@playwright/test";

// CI installs a matching Chromium via `playwright install`; the dev container
// pre-installs a pinned binary instead. VIXIO_CHROMIUM_PATH overrides for
// other machines.
const chromiumPath = process.env.CI
  ? undefined
  : (process.env.VIXIO_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium");

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
    ...(chromiumPath
      ? { launchOptions: { executablePath: chromiumPath } }
      : {}),
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5180 --strictPort",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
