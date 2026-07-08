import { expect, test } from "@playwright/test";

import { gotoApp, seedFilmProject, storeSnapshot } from "./helpers";

/**
 * The previz stage on a store-seeded film project: select the shot, verify
 * the 3d viewport, dress the set with a prop, scrub the camera move, and
 * capture the clay pass until the clip attaches to the shot.
 */

test.describe("previz", () => {
  test("blocks a shot and captures a previz clip", async ({ page }) => {
    test.setTimeout(150_000);

    await gotoApp(page);
    const seed = await seedFilmProject(page, {
      title: "Previz Bench",
      character: { name: "Mara" },
      shots: [
        {
          description: "Mara turns from the window as the light dies",
          dialogue: null,
          durationSeconds: 4,
        },
      ],
    });
    const shotId = seed.shotIds[0];
    expect(shotId).toBeTruthy();

    await gotoApp(page, `/p/${seed.projectId}/previz`);
    await expect(page.getByTestId("page-previz")).toBeVisible();

    // Select the shot explicitly and confirm the stage viewport mounts.
    await page.getByTestId("previz-shot-item-0").click();
    await expect(page.getByTestId("previz-canvas")).toBeVisible();

    // Add a prop; the new prop becomes the selection, so the rotation
    // control replaces the "nothing selected" hint.
    await page.getByTestId("previz-add-prop").click();
    await expect(
      page.getByText("Click a mannequin or prop in the viewport to select it."),
    ).toBeHidden();
    await expect(page.getByText("Rotation").first()).toBeVisible();

    // Scrub the move: arrow keys step the range input through React onChange.
    const scrub = page.getByTestId("previz-scrub");
    await expect(scrub).toHaveValue("0");
    await scrub.focus();
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await expect
      .poll(async () => Number(await scrub.inputValue()))
      .toBeGreaterThan(0);

    // Capture: two offscreen passes (clay + depth), then the clip saves and
    // attaches to the shot as previzAssetId.
    await page.getByTestId("previz-capture").click();
    await expect
      .poll(
        async () =>
          (await storeSnapshot(page)).shots[shotId ?? ""]?.previzAssetId ?? null,
        { timeout: 60_000, message: "capture should attach previzAssetId" },
      )
      .not.toBeNull();

    await expect(page.getByTestId("previz-status")).toHaveText(
      /Capture complete/,
      { timeout: 15_000 },
    );
    // The saved clip replays in the capture panel.
    await expect(page.locator("video").first()).toBeVisible();
  });
});
