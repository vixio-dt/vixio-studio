import { statSync } from "node:fs";

import { expect, test, type Locator } from "@playwright/test";

import {
  enqueueFrameForShot,
  gotoApp,
  saveDownload,
  seedFilmProject,
  storeSnapshot,
} from "./helpers";

/**
 * Audio lanes and the final render on a seeded film project: dialogue for a
 * speaking shot, a generated ambience bed, and the WebCodecs final cut with
 * a real downloaded file.
 */

const MONO_DURATION = /^\d+(\.\d+)?s$/;

const expectMonoDuration = async (scope: Locator): Promise<void> => {
  const duration = scope.getByText(MONO_DURATION).first();
  await expect(duration).toBeVisible();
  await expect(duration).toHaveClass(/font-mono/);
};

test.describe("audio and final render", () => {
  test("generates dialogue and ambience, then renders the final cut", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    await gotoApp(page);
    const seed = await seedFilmProject(page, {
      title: "Night Mix",
      character: { name: "Nadia", voiceId: "e2e-voice-1" },
      shots: [
        {
          description: "Nadia leans over the desk lamp",
          dialogue: "We hold the line until dawn breaks over the yard.",
          durationSeconds: 5,
        },
        {
          description: "The door eases shut behind her",
          dialogue: "Then we walk out together, all of us.",
          durationSeconds: 4,
        },
      ],
    });
    const [shotA] = seed.shotIds;
    expect(shotA).toBeTruthy();

    // Arrange a start frame for shot 0 through the real task queue.
    await enqueueFrameForShot(page, {
      projectId: seed.projectId,
      shotId: shotA ?? "",
    });
    await expect
      .poll(
        async () =>
          (await storeSnapshot(page)).shots[shotA ?? ""]?.frameAssetId ?? null,
        { timeout: 60_000, message: "seeded frame should attach to shot 0" },
      )
      .not.toBeNull();

    /* -------------------------------------------------------------- */
    /* Dialogue lane                                                   */
    /* -------------------------------------------------------------- */
    await gotoApp(page, `/p/${seed.projectId}/timeline`);
    const dialogueChip = page
      .locator("div")
      .filter({ hasText: /^#1/ })
      .filter({ hasText: "We hold the line" })
      .last();
    await expect(page.getByTestId("cut-dialogue-generate-0")).toBeVisible();
    await expect(page.getByTestId("cut-dialogue-generate-1")).toBeVisible();

    await page.getByTestId("cut-dialogue-generate-0").click();
    await expect
      .poll(
        async () =>
          (await storeSnapshot(page)).shots[shotA ?? ""]?.dialogueAssetId ??
          null,
        { timeout: 60_000, message: "dialogue clip should attach to shot 0" },
      )
      .not.toBeNull();
    await expectMonoDuration(dialogueChip);

    /* -------------------------------------------------------------- */
    /* Ambience lane                                                   */
    /* -------------------------------------------------------------- */
    await page.getByTestId("cut-track-add-ambience").click();
    const ambiencePrompt = page.getByLabel("Ambience prompt");
    await expect(ambiencePrompt).toBeVisible();
    await ambiencePrompt.fill("rain on a tin roof, distant thunder");

    const trackGenerate = page.getByTestId("cut-track-generate-0");
    await expect(trackGenerate).toBeEnabled();
    await trackGenerate.click();
    await expect
      .poll(
        async () => {
          const snapshot = await storeSnapshot(page);
          const track = Object.values(snapshot.audioTracks).find(
            (candidate) => candidate.lane === "ambience",
          );
          return track?.assetId ?? null;
        },
        { timeout: 60_000, message: "ambience track should attach an asset" },
      )
      .not.toBeNull();

    const trackRow = page
      .locator("div")
      .filter({ has: page.getByTestId("cut-track-gain") })
      .last();
    await expectMonoDuration(trackRow);
    await expect(page.getByTestId("cut-track-gain")).toBeVisible();

    /* -------------------------------------------------------------- */
    /* Final render                                                    */
    /* -------------------------------------------------------------- */
    await page.getByTestId("cut-render").click();
    await expect(page.getByTestId("cut-render-status")).toHaveText(
      /Final cut \((webm|mp4), \d+p\)/,
      { timeout: 120_000 },
    );

    const downloadButton = page.getByTestId("cut-render-download");
    await expect(downloadButton).toBeEnabled();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      downloadButton.click(),
    ]);
    const savedPath = await saveDownload(download, "final-cut");
    expect(statSync(savedPath).size).toBeGreaterThan(100_000);
  });
});
