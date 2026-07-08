import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, type Download, type Page } from "@playwright/test";

/**
 * Shared plumbing for the e2e suite: the scratch download directory, app
 * navigation, store seeding through the dev-served zustand modules, and a
 * typed snapshot reader used by expect.poll assertions.
 *
 * Seeding uses `import("/src/stores/projects.ts")` inside page.evaluate. Vite
 * serves that exact module to the running app, so the dynamic import resolves
 * to the same store instance the UI renders from, and the persist middleware
 * writes every mutation to localStorage synchronously.
 */

export const DOWNLOADS_DIR =
  "/tmp/claude-0/-home-user-vixio-studio/7c51569a-54c2-5e12-9094-d9c81fb86a2b/scratchpad/e2e-downloads";

/** Save a Playwright download under the scratch dir; returns the saved path. */
export const saveDownload = async (
  download: Download,
  fileName: string,
): Promise<string> => {
  mkdirSync(DOWNLOADS_DIR, { recursive: true });
  const target = path.join(
    DOWNLOADS_DIR,
    `${Date.now()}-${Math.floor(Math.random() * 1e6)}-${fileName}`,
  );
  await download.saveAs(target);
  return target;
};

/** Navigate and wait for the React shell to mount. */
export const gotoApp = async (page: Page, url = "/"): Promise<void> => {
  await page.goto(url);
  await expect(page.locator("#root")).not.toBeEmpty();
};

/* ------------------------------------------------------------------ */
/* Store snapshot                                                      */
/* ------------------------------------------------------------------ */

export type StoreSnapshot = {
  projects: Record<
    string,
    { id: string; title: string; mode: "film" | "comic" }
  >;
  scenes: Record<string, { id: string; projectId: string; index: number }>;
  shots: Record<
    string,
    {
      id: string;
      projectId: string;
      sceneId: string;
      index: number;
      description: string;
      dialogue: string | null;
      durationSeconds: number;
      frameAssetId: string | null;
      videoAssetId: string | null;
      cameraPresetId?: string;
      previzAssetId?: string;
      dialogueAssetId?: string;
      sourcePanelId?: string;
    }
  >;
  characters: Record<
    string,
    {
      id: string;
      projectId: string;
      name: string;
      portraitAssetId: string | null;
      voiceId?: string;
    }
  >;
  pages: Record<
    string,
    { id: string; projectId: string; index: number; layoutId: string }
  >;
  panels: Record<
    string,
    {
      id: string;
      pageId: string;
      projectId: string;
      index: number;
      imageAssetId?: string;
      sourceShotId?: string;
      balloons: { id: string; kind: string; text: string }[];
    }
  >;
  audioTracks: Record<
    string,
    { id: string; projectId: string; lane: string; assetId?: string; gain: number }
  >;
};

/** Read a serializable snapshot of the live projects store. */
export const storeSnapshot = (page: Page): Promise<StoreSnapshot> =>
  page.evaluate(async () => {
    const { useProjectsStore } = await import("/src/stores/projects.ts");
    const state = useProjectsStore.getState();
    return {
      projects: state.projects,
      scenes: state.scenes,
      shots: state.shots,
      characters: state.characters,
      pages: state.pages,
      panels: state.panels,
      audioTracks: state.audioTracks,
    };
  }) as Promise<StoreSnapshot>;

/* ------------------------------------------------------------------ */
/* Seeding                                                             */
/* ------------------------------------------------------------------ */

export type FilmSeed = {
  title: string;
  character?: { name: string; voiceId?: string };
  shots: {
    description: string;
    dialogue: string | null;
    durationSeconds: number;
  }[];
};

export type FilmSeedResult = {
  projectId: string;
  sceneId: string;
  characterId: string | null;
  shotIds: string[];
};

/** Create a film project with one scene and the given shots via the store. */
export const seedFilmProject = (
  page: Page,
  seed: FilmSeed,
): Promise<FilmSeedResult> =>
  page.evaluate(async (input) => {
    const { useProjectsStore } = await import("/src/stores/projects.ts");
    const store = useProjectsStore.getState();
    const project = store.createProject({
      title: input.title,
      logline: "A courier guards a stolen letter through one long night.",
      mode: "film",
      format: "short-film",
      genre: "drama",
      styleId: "cinematic-realism",
      aspectRatio: "16:9",
    });
    let characterId = null;
    if (input.character) {
      const character = store.addCharacter({
        projectId: project.id,
        name: input.character.name,
        role: "lead",
        bio: "Keeps the letter close and everyone else at a distance.",
        appearance: "compact and steady, cropped silver hair",
        wardrobe: "a gray raincoat over work clothes",
        ...(input.character.voiceId ? { voiceId: input.character.voiceId } : {}),
      });
      characterId = character.id;
    }
    const scene = store.addScene({
      projectId: project.id,
      index: 0,
      setting: "interior",
      location: "Warehouse office",
      timeOfDay: "night",
      summary: "The letter changes hands.",
      body: "",
      characterIds: characterId ? [characterId] : [],
    });
    const shotIds = input.shots.map(
      (shot, position) =>
        store.addShot({
          sceneId: scene.id,
          projectId: project.id,
          index: position,
          description: shot.description,
          dialogue: shot.dialogue,
          size: "medium",
          angle: "eye-level",
          movement: "static",
          lens: "35mm",
          lighting: "low-key",
          durationSeconds: shot.durationSeconds,
          characterIds: characterId ? [characterId] : [],
        }).id,
    );
    return { projectId: project.id, sceneId: scene.id, characterId, shotIds };
  }, seed);

export type ComicSeed = {
  title: string;
  sceneLocations: string[];
  pages: {
    layoutId: string;
    panels: { description: string; speechText?: string }[];
  }[];
};

export type ComicSeedResult = {
  projectId: string;
  sceneIds: string[];
  pageIds: string[];
  panelIds: string[];
};

/** Create a comic project with scenes, pages, and panels via the store. */
export const seedComicProject = (
  page: Page,
  seed: ComicSeed,
): Promise<ComicSeedResult> =>
  page.evaluate(async (input) => {
    const { useProjectsStore } = await import("/src/stores/projects.ts");
    const store = useProjectsStore.getState();
    const project = store.createProject({
      title: input.title,
      logline: "A rider carries the last message across a burning border.",
      mode: "comic",
      format: "short-film",
      genre: "fantasy",
      styleId: "cinematic-realism",
      aspectRatio: "16:9",
    });
    const sceneIds = input.sceneLocations.map(
      (location, position) =>
        store.addScene({
          projectId: project.id,
          index: position,
          setting: "exterior",
          location,
          timeOfDay: "day",
          summary: `What happens at ${location}.`,
          body: "",
          characterIds: [],
        }).id,
    );
    const pageIds = [];
    const panelIds = [];
    input.pages.forEach((pageSeed, pageIndex) => {
      const comicPage = store.addPage({
        projectId: project.id,
        index: pageIndex,
        layoutId: pageSeed.layoutId,
      });
      pageIds.push(comicPage.id);
      pageSeed.panels.forEach((panelSeed, panelIndex) => {
        const panel = store.addPanel({
          pageId: comicPage.id,
          projectId: project.id,
          index: panelIndex,
          description: panelSeed.description,
          characterIds: [],
        });
        if (panelSeed.speechText) {
          store.updatePanel(panel.id, {
            balloons: [
              {
                id: `e2e-${panel.id}`,
                kind: "speech",
                text: panelSeed.speechText,
                x: 0.5,
                y: 0.3,
                width: 0.4,
                tailAngle: 115,
              },
            ],
          });
        }
        panelIds.push(panel.id);
      });
    });
    return { projectId: project.id, sceneIds, pageIds, panelIds };
  }, seed);

/** Queue a preview frame generation for a shot through the shared task queue. */
export const enqueueFrameForShot = (
  page: Page,
  args: { projectId: string; shotId: string },
): Promise<void> =>
  page.evaluate(async ({ projectId, shotId }) => {
    const { useProjectsStore } = await import("/src/stores/projects.ts");
    const { useTasksStore } = await import("/src/stores/tasks.ts");
    const state = useProjectsStore.getState();
    const project = state.projects[projectId];
    const shot = state.shots[shotId];
    if (!project || !shot) throw new Error("Seeded project or shot missing");
    useTasksStore.getState().enqueueImage({
      project,
      target: { kind: "shot-frame", shotId: shot.id },
      label: "E2E seeded frame",
      request: {
        prompt:
          "Warehouse office at night, a single figure silhouetted at the window",
        aspectRatio: project.aspectRatio,
        seed: shot.seed,
        styleId: project.styleId,
        referenceImageUrls: [],
      },
    });
  }, args);

/* ------------------------------------------------------------------ */
/* UI journeys shared across specs                                     */
/* ------------------------------------------------------------------ */

/** Drive the New project dialog and land in the script room. */
export const createProjectViaUi = async (
  page: Page,
  input: { title: string; mode: "film" | "comic" },
): Promise<string> => {
  await gotoApp(page);
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByTestId(`project-mode-${input.mode}`).click();
  await expect(
    dialog.getByTestId(`project-mode-${input.mode}`),
  ).toHaveAttribute("aria-checked", "true");
  await dialog.getByLabel("Title").fill(input.title);
  await dialog
    .getByLabel("Logline")
    .fill(
      "A courier guards a stolen letter through one long night in the rain.",
    );
  await dialog.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/p\/[^/]+\/script$/);
  const projectId = /\/p\/([^/]+)\/script$/.exec(
    new URL(page.url()).pathname,
  )?.[1];
  if (!projectId) throw new Error("Could not read the new project id");
  return projectId;
};

/** Run the preview script generator from the development panel. */
export const generateScriptViaUi = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "Generate script" }).click();
  await expect
    .poll(
      async () => {
        const snapshot = await storeSnapshot(page);
        return Object.keys(snapshot.scenes).length;
      },
      { timeout: 30_000, message: "script generation should produce scenes" },
    )
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "Break into shots" }).first(),
  ).toBeVisible();
};
