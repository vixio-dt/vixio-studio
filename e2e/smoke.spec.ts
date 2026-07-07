import { expect, test } from "@playwright/test";

test("app boots and renders the workspace shell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Vixio Studio/);
  await expect(page.locator("#root")).not.toBeEmpty();
});
