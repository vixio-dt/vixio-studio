import { expect, test } from "@playwright/test";

import {
  createProjectViaUi,
  generateScriptViaUi,
  storeSnapshot,
} from "./helpers";

/**
 * The core film path, driven end to end through the UI: create a project,
 * draft the script with the offline preview writer, break a scene into
 * shots, generate a portrait and a frame through the task queue, animate the
 * frame into a preview clip, and land on the cut with playable entries.
 */

test.describe("film journey", () => {
  test("script to cut through every film stage", async ({ page }) => {
    test.setTimeout(240_000);

    /* -------------------------------------------------------------- */
    /* Create the project                                              */
    /* -------------------------------------------------------------- */
    await createProjectViaUi(page, {
      title: "The Long Night",
      mode: "film",
    });

    /* -------------------------------------------------------------- */
    /* Script: preview writer drafts scenes, first scene breaks down   */
    /* -------------------------------------------------------------- */
    await generateScriptViaUi(page);

    await page.getByRole("button", { name: "Break into shots" }).first().click();
    await expect
      .poll(
        async () => Object.keys((await storeSnapshot(page)).shots).length,
        { timeout: 30_000, message: "scene breakdown should create shots" },
      )
      .toBeGreaterThan(0);

    /* -------------------------------------------------------------- */
    /* Cast: characters arrived with the script; render one portrait   */
    /* -------------------------------------------------------------- */
    await page.getByTestId("nav-cast").click();
    const portraitButtons = page.getByRole("button", {
      name: "Generate portrait",
    });
    await expect(portraitButtons.first()).toBeVisible();
    expect(await portraitButtons.count()).toBeGreaterThanOrEqual(2);

    await portraitButtons.first().click();
    await expect
      .poll(
        async () =>
          Object.values((await storeSnapshot(page)).characters).filter(
            (character) => character.portraitAssetId !== null,
          ).length,
        { timeout: 60_000, message: "portrait queue should attach an asset" },
      )
      .toBeGreaterThan(0);
    await expect(page.locator('img[alt^="Portrait of"]').first()).toBeVisible();

    /* -------------------------------------------------------------- */
    /* Storyboard: camera preset on shot 0 persists across a reload    */
    /* -------------------------------------------------------------- */
    await page.getByTestId("nav-storyboard").click();
    const presetSelect = page.getByTestId("shot-camera-preset-0");
    await expect(presetSelect).toBeVisible();
    await presetSelect.selectOption("dolly-in");

    const snapshotAfterPreset = await storeSnapshot(page);
    const presetShot = Object.values(snapshotAfterPreset.shots).find(
      (shot) => shot.cameraPresetId === "dolly-in",
    );
    expect(presetShot).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId("shot-camera-preset-0")).toHaveValue(
      "dolly-in",
      { timeout: 15_000 },
    );

    /* -------------------------------------------------------------- */
    /* Frame lab: generate a frame for shot 0                          */
    /* -------------------------------------------------------------- */
    await page.getByTestId("nav-framelab").click();
    await page.waitForURL(/\/framelab\?shot=/);
    const framedShotId = new URL(page.url()).searchParams.get("shot");
    expect(framedShotId).toBeTruthy();

    await page.getByRole("button", { name: "Generate", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await storeSnapshot(page)).shots[framedShotId ?? ""]?.frameAssetId ??
          null,
        { timeout: 60_000, message: "frame queue should attach an asset" },
      )
      .not.toBeNull();
    await expect(
      page.locator('img[alt^="Frame for shot"]').first(),
    ).toBeVisible();

    /* -------------------------------------------------------------- */
    /* Motion: image-to-video preview animatic for the framed shot     */
    /* -------------------------------------------------------------- */
    await page.getByTestId("nav-motion").click();
    const generateClip = page.getByRole("button", { name: "Generate clip" });
    await expect(generateClip).toBeEnabled({ timeout: 15_000 });

    // The preview animatic records in real time; keep the clip short.
    await page
      .getByRole("radiogroup", { name: "Duration" })
      .getByRole("radio", { name: "3s", exact: true })
      .click();
    await generateClip.click();

    await expect
      .poll(
        async () =>
          (await storeSnapshot(page)).shots[framedShotId ?? ""]?.videoAssetId ??
          null,
        { timeout: 120_000, message: "video queue should attach a clip" },
      )
      .not.toBeNull();
    await expect(page.locator("video").first()).toBeVisible();

    /* -------------------------------------------------------------- */
    /* Cut: playable entries and the export actions                    */
    /* -------------------------------------------------------------- */
    await page.getByTestId("nav-timeline").click();
    await expect(page.getByText(/\d+\/\d+ clips rendered/)).toBeVisible();
    await expect(page.getByText(/shot 1 \/ \d+/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Go to shot 1" }),
    ).toBeVisible();
    // Shot 0 carries a rendered clip, so the stage plays real video.
    await expect(page.locator("video").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export contact sheet" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export cut data" }),
    ).toBeVisible();
  });
});
