import { expect, test } from "@playwright/test";

import { gotoApp } from "./helpers";

/**
 * Settings: key inputs stay masked, a bad ElevenLabs key lands in the inline
 * invalid state without crashing, and the audio provider choice persists.
 */

const KEY_INPUT_TEST_IDS = [
  "settings-gemini-key",
  "settings-fal-key",
  "settings-elevenlabs-key",
  "settings-meshy-key",
] as const;

test.describe("settings", () => {
  test("all four provider key inputs are password fields", async ({ page }) => {
    await gotoApp(page, "/settings");
    for (const testId of KEY_INPUT_TEST_IDS) {
      await expect(page.getByTestId(testId)).toHaveAttribute(
        "type",
        "password",
      );
    }
  });

  test("verifying a garbage ElevenLabs key shows the inline error without crashing", async ({
    page,
  }) => {
    await gotoApp(page, "/settings");
    await page
      .getByTestId("settings-elevenlabs-key")
      .fill("garbage-key-not-real-123");
    await page.getByTestId("verify-elevenlabs").click();

    // Rejected key or unreachable network both land in the invalid state;
    // either way the provider's message renders as an inline alert.
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).not.toBeEmpty();

    // No crash: the page is still interactive and the key field kept its value.
    await expect(page.getByTestId("settings-elevenlabs-key")).toHaveValue(
      "garbage-key-not-real-123",
    );
    await expect(page.locator("#root")).not.toBeEmpty();
  });

  test("audio provider choice persists across a reload", async ({ page }) => {
    await gotoApp(page, "/settings");
    const elevenLabs = page.getByTestId("audio-provider-elevenlabs");
    await expect(elevenLabs).toHaveAttribute("aria-checked", "false");

    await elevenLabs.click();
    await expect(elevenLabs).toHaveAttribute("aria-checked", "true");

    await page.reload();
    await expect(
      page.getByTestId("audio-provider-elevenlabs"),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      page.getByTestId("audio-provider-preview"),
    ).toHaveAttribute("aria-checked", "false");
  });
});
