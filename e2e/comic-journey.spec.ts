import { readFileSync, statSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  createProjectViaUi,
  generateScriptViaUi,
  saveDownload,
  storeSnapshot,
} from "./helpers";

/**
 * The core comic path, driven through the UI: create a comic project, draft
 * the script, plan pages from scenes, generate one panel's art, letter it
 * with a persisted speech balloon, and export CBZ + project JSON.
 */

const BALLOON_TEXT = "We ride at dawn.";

test.describe("comic journey", () => {
  test("script to export through every comic stage", async ({ page }) => {
    test.setTimeout(240_000);

    await createProjectViaUi(page, { title: "Salt Road", mode: "comic" });
    await generateScriptViaUi(page);

    /* -------------------------------------------------------------- */
    /* Pages: plan one page per scene                                  */
    /* -------------------------------------------------------------- */
    await page.getByTestId("nav-pages").click();
    const plan = page.getByTestId("pages-plan");
    await expect(plan).toBeEnabled();
    await plan.click();

    const firstCard = page.getByTestId("page-card-0");
    await expect(firstCard).toBeVisible();
    // The mini layout diagram renders one rect per frame.
    expect(await firstCard.locator("svg rect").count()).toBeGreaterThan(0);

    const planned = await storeSnapshot(page);
    expect(Object.keys(planned.pages).length).toBeGreaterThan(0);
    expect(Object.keys(planned.panels).length).toBeGreaterThan(0);

    /* -------------------------------------------------------------- */
    /* Panels: generate art for the first panel                        */
    /* -------------------------------------------------------------- */
    await page.getByTestId("nav-panels").click();
    await page.waitForURL(/\/panels\?panel=/);
    await page.getByTestId("panel-item-0-0").click();
    const panelId = new URL(page.url()).searchParams.get("panel");
    expect(panelId).toBeTruthy();

    await page.getByTestId("panel-generate").click();
    await expect
      .poll(
        async () =>
          (await storeSnapshot(page)).panels[panelId ?? ""]?.imageAssetId ??
          null,
        { timeout: 60_000, message: "panel art should attach an asset" },
      )
      .not.toBeNull();
    await expect(page.locator('img[alt^="Art for page"]').first()).toBeVisible();

    /* -------------------------------------------------------------- */
    /* Lettering: speech balloon text persists across a reload         */
    /* -------------------------------------------------------------- */
    await page.getByTestId("lettering-toggle").click();
    await page.getByTestId("lettering-add-speech").click();
    await expect(page.getByTestId("balloon-item")).toHaveCount(1);

    const balloonText = page.getByLabel("Text", { exact: true });
    await balloonText.fill(BALLOON_TEXT);
    await expect
      .poll(async () => {
        const snapshot = await storeSnapshot(page);
        return snapshot.panels[panelId ?? ""]?.balloons[0]?.text ?? null;
      })
      .toBe(BALLOON_TEXT);

    await page.reload();
    await expect(page.getByTestId("page-panellab")).toBeVisible();
    await page.getByTestId("lettering-toggle").click();
    await expect(page.getByTestId("balloon-item")).toHaveCount(1);
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      BALLOON_TEXT,
    );

    /* -------------------------------------------------------------- */
    /* Export: CBZ archive and project JSON                            */
    /* -------------------------------------------------------------- */
    await page.getByTestId("nav-export").click();
    await expect(page.getByTestId("page-comicexport")).toBeVisible();

    const cbzButton = page.getByTestId("export-cbz");
    await expect(cbzButton).toBeEnabled();
    const [cbzDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 90_000 }),
      cbzButton.click(),
    ]);
    const cbzPath = await saveDownload(cbzDownload, "book.cbz");
    expect(statSync(cbzPath).size).toBeGreaterThan(1_000);
    await expect(page.getByTestId("export-status")).toHaveText(
      /CBZ archive saved\./,
      { timeout: 90_000 },
    );

    const jsonButton = page.getByTestId("export-json");
    await expect(jsonButton).toBeEnabled();
    const [jsonDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      jsonButton.click(),
    ]);
    const jsonPath = await saveDownload(jsonDownload, "book.json");
    const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

    expect(payload.version).toBe("1");
    expect(Array.isArray(payload.pages)).toBe(true);
    expect(payload.pages.length).toBeGreaterThan(0);
    for (const exportedPage of payload.pages) {
      expect(Array.isArray(exportedPage.panels)).toBe(true);
    }
    const allBalloons = payload.pages.flatMap((exportedPage) =>
      exportedPage.panels.flatMap(
        (panel) => panel.balloons?.map((balloon) => balloon.text) ?? [],
      ),
    );
    expect(allBalloons).toContain(BALLOON_TEXT);
  });
});
