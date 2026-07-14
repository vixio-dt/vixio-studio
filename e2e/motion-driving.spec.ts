import { expect, test } from "@playwright/test";

import {
  enqueueFrameForShot,
  gotoApp,
  seedFilmProject,
  storeSnapshot,
} from "./helpers";

/**
 * The previz driving loop, offline: a shot with a captured previz clip gains
 * the "Use previz clip" toggle on the motion console, and generating with it
 * on delivers the clip url to the video provider as drivingVideoUrl. The
 * preview provider records the request it received, so the plumbing is
 * assertable without a fal key.
 */

test("previz clip drives the motion request when toggled on", async ({
  page,
}) => {
  await gotoApp(page);
  const seed = await seedFilmProject(page, {
    title: "Driving loop",
    character: { name: "Mara" },
    shots: [
      { description: "Mara turns from the ledge", dialogue: "", durationSeconds: 4 },
      { description: "Mara walks away", dialogue: "", durationSeconds: 4 },
    ],
  });
  const shotId = seed.shotIds[0]!;

  await enqueueFrameForShot(page, { projectId: seed.projectId, shotId });
  await expect
    .poll(
      async () => {
        const snapshot = await storeSnapshot(page);
        return snapshot.shots[shotId]?.frameAssetId ?? null;
      },
      { timeout: 60_000 },
    )
    .not.toBeNull();

  // Attach a fake previz clip directly; running the real 3d capture here
  // would cost ~30s and is covered by previz.spec.ts.
  const previzAssetId = await page.evaluate(
    async (input) => {
      const { useAssetsStore } = await import("/src/stores/assets.ts");
      const { useProjectsStore } = await import("/src/stores/projects.ts");
      const { createAssetId } = await import("/src/lib/id.ts");
      const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86]);
      const asset = await useAssetsStore.getState().saveAsset(
        {
          id: createAssetId(),
          projectId: input.projectId,
          kind: "video",
          width: 640,
          height: 360,
          duration: 4,
          prompt: "previz clay pass",
          model: "previz",
          seed: 1,
          createdAt: new Date().toISOString(),
        },
        new Blob([bytes], { type: "video/webm" }),
      );
      useProjectsStore
        .getState()
        .updateShot(input.shotId, { previzAssetId: asset.id });
      return asset.id as string;
    },
    { shotId, projectId: seed.projectId },
  );
  expect(previzAssetId).not.toBeNull();

  await gotoApp(page, `/p/${seed.projectId}/motion`);

  const toggle = page.getByTestId("motion-use-previz");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Generate clip" }).click();
  await expect
    .poll(
      async () => {
        const snapshot = await storeSnapshot(page);
        return snapshot.shots[shotId]?.videoAssetId ?? null;
      },
      { timeout: 60_000 },
    )
    .not.toBeNull();

  // Object URLs are re-minted on every hydration, so compare against the
  // asset's current url rather than the pre-navigation one.
  const { recorded, currentUrl } = await page.evaluate(async (assetId) => {
    const { previewVideoLog } = await import("/src/providers/mock/video.ts");
    const { useAssetsStore } = await import("/src/stores/assets.ts");
    return {
      recorded: previewVideoLog.lastRequest?.drivingVideoUrl ?? null,
      currentUrl: useAssetsStore.getState().assets[assetId]?.url ?? null,
    };
  }, previzAssetId);
  expect(recorded).not.toBeNull();
  expect(recorded).toBe(currentUrl);
});

test("the previz toggle is absent on a shot without a captured clip", async ({
  page,
}) => {
  await gotoApp(page);
  const seed = await seedFilmProject(page, {
    title: "No previz",
    character: { name: "Mara" },
    shots: [
      { description: "Mara waits", dialogue: "", durationSeconds: 4 },
    ],
  });

  await gotoApp(page, `/p/${seed.projectId}/motion`);
  await expect(
    page.getByRole("button", { name: "Generate clip" }),
  ).toBeVisible();
  await expect(page.getByTestId("motion-use-previz")).toHaveCount(0);
});
