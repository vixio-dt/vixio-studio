import { expect, test } from "@playwright/test";

import {
  gotoApp,
  seedComicProject,
  seedFilmProject,
  storeSnapshot,
} from "./helpers";

/**
 * Both conversion gates. Comic to film: panels become shots carrying their
 * source panel id and balloon dialogue, and re-running reports zero new
 * shots. Film to comic: scenes become pages, shots become panels with a
 * sourced speech balloon.
 */

test.describe("engine conversion", () => {
  test("comic to film converts panels to shots and stays idempotent", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await gotoApp(page);
    const seed = await seedComicProject(page, {
      title: "Border Run",
      sceneLocations: ["The bridge", "The harbor"],
      pages: [
        {
          layoutId: "grid-2x2",
          panels: [
            {
              description: "Riders crest the hill at first light",
              speechText: "Hold the line.",
            },
            { description: "The gate splinters under the ram" },
          ],
        },
        {
          layoutId: "grid-2x2",
          panels: [{ description: "Smoke drifts over the harbor" }],
        },
      ],
    });
    const balloonPanelId = seed.panelIds[0];

    await gotoApp(page, `/p/${seed.projectId}/export`);
    await page.getByTestId("convert-to-film").click();
    const preview = page.getByTestId("convert-preview");
    await expect(preview).toBeVisible();
    await expect(
      preview.getByText(/3 new shots, 0 updated, 0 unchanged/),
    ).toBeVisible();

    await page.getByTestId("convert-to-film-confirm").click();
    await page.waitForURL(/\/storyboard$/);
    // The storyboard renders the converted shots.
    await expect(page.getByTestId("shot-camera-preset-0")).toBeVisible();

    const converted = await storeSnapshot(page);
    const shots = Object.values(converted.shots).filter(
      (shot) => shot.projectId === seed.projectId,
    );
    expect(shots).toHaveLength(3);
    for (const shot of shots) {
      expect(shot.sourcePanelId).toBeTruthy();
      expect(seed.panelIds).toContain(shot.sourcePanelId);
    }
    const dialogueShot = shots.find(
      (shot) => shot.sourcePanelId === balloonPanelId,
    );
    expect(dialogueShot?.dialogue).toBe("Hold the line.");
    expect(converted.projects[seed.projectId]?.mode).toBe("film");

    // Flip back to the comic engine (both shots and panels now exist) and
    // confirm a second conversion pass has nothing new to create.
    await page.getByTestId("mode-switch-comic").click();
    await page.waitForURL(/\/pages$/);
    await page.getByTestId("nav-export").click();
    await page.waitForURL(/\/export$/);

    await page.getByTestId("convert-to-film").click();
    await expect(
      page
        .getByTestId("convert-preview")
        .getByText(/0 new shots, 0 updated, 3 unchanged/),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(page.getByTestId("convert-preview")).toBeHidden();
  });

  test("film to comic converts shots to panels with sourced balloons", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await gotoApp(page);
    const seed = await seedFilmProject(page, {
      title: "Night Crossing",
      character: { name: "Mara" },
      shots: [
        {
          description: "Mara watches the checkpoint from the stairwell",
          dialogue: "We go tonight.",
          durationSeconds: 4,
        },
        {
          description: "The stairwell door eases open",
          dialogue: null,
          durationSeconds: 4,
        },
      ],
    });
    const [speakingShotId] = seed.shotIds;

    await gotoApp(page, `/p/${seed.projectId}/timeline`);
    await page.getByTestId("convert-to-comic").click();
    const preview = page.getByTestId("convert-preview");
    await expect(preview).toBeVisible();
    await expect(
      preview.getByText(/1 new pages, 2 new panels, 0 updated, 0 unchanged/),
    ).toBeVisible();
    await expect(preview.getByText(/1 dialogue balloons/)).toBeVisible();

    await page.getByTestId("convert-to-comic-confirm").click();
    await page.waitForURL(/\/pages$/);
    await expect(page.getByTestId("page-card-0")).toBeVisible();

    const converted = await storeSnapshot(page);
    const pages = Object.values(converted.pages).filter(
      (comicPage) => comicPage.projectId === seed.projectId,
    );
    const panels = Object.values(converted.panels).filter(
      (panel) => panel.projectId === seed.projectId,
    );
    expect(pages).toHaveLength(1);
    expect(panels).toHaveLength(2);
    for (const panel of panels) {
      expect(panel.sourceShotId).toBeTruthy();
      expect(seed.shotIds).toContain(panel.sourceShotId);
    }

    const sourcedPanel = panels.find(
      (panel) => panel.sourceShotId === speakingShotId,
    );
    expect(sourcedPanel).toBeTruthy();
    const balloon = sourcedPanel?.balloons.find(
      (candidate) => candidate.id === `src-${speakingShotId}`,
    );
    expect(balloon?.kind).toBe("speech");
    expect(balloon?.text).toBe("We go tonight.");
    expect(converted.projects[seed.projectId]?.mode).toBe("comic");
  });
});
