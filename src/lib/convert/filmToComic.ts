import { DEFAULT_COMIC_STYLE_ID, findComicLayout } from "@/domain/constants";
import type { Balloon, ComicLayoutId, Project, Shot } from "@/domain/types";
import type {
  AssetId,
  CharacterId,
  PageId,
  PanelId,
  ProjectId,
  SceneId,
  ShotId,
} from "@/lib/id";
import { layoutForBeatCount } from "@/lib/comic/planner";
import { appError, err, ok, type Result } from "@/lib/result";
import { useProjectsStore } from "@/stores/projects";

import type { ProjectGraph } from "./graph";

/**
 * Film to comic: scenes become pages sized by shot count, shots become
 * panels in order. A panel created here carries its source shot's id and a
 * deterministic balloon id, so re-running refreshes art and dialogue without
 * duplicating panels or touching user-added lettering.
 */

/** The sourced dialogue balloon a conversion owns on a panel. */
export const sourcedBalloonId = (shotId: ShotId): string => `src-${shotId}`;

const SOURCED_BALLOON_X = 0.5;
const SOURCED_BALLOON_Y = 0.12;
const SOURCED_BALLOON_WIDTH = 0.4;

/** The biggest page the planner deals; longer scenes split across pages. */
const MAX_PANELS_PER_PAGE = findComicLayout("grid-3x3").frames.length;

export type BalloonDraft = {
  text: string;
  characterId?: CharacterId;
};

export type PanelDraft = {
  sourceShotId: ShotId;
  description: string;
  characterIds: CharacterId[];
  /** The shot's current frame asset, shared directly when present. */
  imageAssetId?: AssetId;
  /** One speech balloon when the shot carries dialogue. */
  balloon?: BalloonDraft;
};

export type PageCreate = {
  sceneId: SceneId;
  /** Book index for the new page, appended after existing pages. */
  index: number;
  layoutId: ComicLayoutId;
  /** Panel index equals array position. */
  panels: PanelDraft[];
};

export type PanelCreate = {
  pageId: PageId;
  index: number;
  draft: PanelDraft;
};

export type PanelUpdate = {
  panelId: PanelId;
  sourceShotId: ShotId;
  /** Present when the panel art should refresh to the shot's frame. */
  imageAssetId?: AssetId;
  /** Present when the sourced balloon needs new text or does not exist yet. */
  balloon?: { id: string; text: string; characterId?: CharacterId; create: boolean };
};

export type FilmToComicSceneRow = {
  sceneId: SceneId;
  sceneNumber: number;
  location: string;
  newPages: number;
  newPanels: number;
  updatedPanels: number;
  unchanged: number;
  /** Balloons created or retexted for this scene. */
  balloons: number;
};

export type FilmToComicPlan = {
  kind: "film-to-comic";
  projectId: ProjectId;
  pageCreates: PageCreate[];
  panelCreates: PanelCreate[];
  panelUpdates: PanelUpdate[];
  unchangedCount: number;
  balloonCount: number;
  /** Comic defaults, set only when the project never had them. */
  projectPatch: Partial<Pick<Project, "comicStyleId" | "readingDirection">>;
  sceneBreakdown: FilmToComicSceneRow[];
};

const draftForShot = (shot: Shot): PanelDraft => {
  const dialogue = shot.dialogue?.trim() ?? "";
  return {
    sourceShotId: shot.id,
    description: shot.description,
    characterIds: [...shot.characterIds],
    ...(shot.frameAssetId ? { imageAssetId: shot.frameAssetId } : {}),
    ...(dialogue.length > 0
      ? {
          balloon: {
            text: dialogue,
            ...(shot.characterIds[0] ? { characterId: shot.characterIds[0] } : {}),
          },
        }
      : {}),
  };
};

/** Splits a scene's panel drafts into page-sized chunks, largest first. */
const chunkIntoPages = (drafts: readonly PanelDraft[]): PanelDraft[][] => {
  const chunks: PanelDraft[][] = [];
  for (let start = 0; start < drafts.length; start += MAX_PANELS_PER_PAGE) {
    chunks.push(drafts.slice(start, start + MAX_PANELS_PER_PAGE));
  }
  return chunks;
};

export const planFilmToComic = (graph: ProjectGraph): FilmToComicPlan => {
  const { project, scenes, shotsByScene, pages, panelsByPage } = graph;

  const allShots = [...shotsByScene.values()].flat();
  const shotById = new Map(allShots.map((shot) => [shot.id, shot]));
  const allPanels = [...panelsByPage.values()].flat();
  const panelBySourceShot = new Map(
    allPanels.flatMap((panel) =>
      panel.sourceShotId ? [[panel.sourceShotId, panel] as const] : [],
    ),
  );

  // Pages already holding sourced panels, grouped by the panels' scenes.
  const pagesByScene = new Map<SceneId, PageId[]>();
  const occupancy = new Map<PageId, number>();
  for (const page of pages) {
    const panels = panelsByPage.get(page.id) ?? [];
    occupancy.set(page.id, panels.length);
    const sceneIds = new Set(
      panels.flatMap((panel) => {
        const shot = panel.sourceShotId
          ? shotById.get(panel.sourceShotId)
          : undefined;
        return shot ? [shot.sceneId] : [];
      }),
    );
    for (const sceneId of sceneIds) {
      const bucket = pagesByScene.get(sceneId) ?? [];
      bucket.push(page.id);
      pagesByScene.set(sceneId, bucket);
    }
  }

  const pageCreates: PageCreate[] = [];
  const panelCreates: PanelCreate[] = [];
  const panelUpdates: PanelUpdate[] = [];
  const sceneBreakdown: FilmToComicSceneRow[] = [];
  let unchangedCount = 0;
  let balloonCount = 0;
  let nextPageIndex = pages.length;

  scenes.forEach((scene, position) => {
    const shots = shotsByScene.get(scene.id) ?? [];
    if (shots.length === 0) return;
    const row: FilmToComicSceneRow = {
      sceneId: scene.id,
      sceneNumber: position + 1,
      location: scene.location,
      newPages: 0,
      newPanels: 0,
      updatedPanels: 0,
      unchanged: 0,
      balloons: 0,
    };
    const pending: PanelDraft[] = [];

    for (const shot of shots) {
      const existing = panelBySourceShot.get(shot.id);
      if (!existing) {
        const draft = draftForShot(shot);
        pending.push(draft);
        row.newPanels += 1;
        if (draft.balloon) {
          balloonCount += 1;
          row.balloons += 1;
        }
        continue;
      }

      const update: PanelUpdate = { panelId: existing.id, sourceShotId: shot.id };
      if (shot.frameAssetId && shot.frameAssetId !== existing.imageAssetId) {
        update.imageAssetId = shot.frameAssetId;
      }
      const dialogue = shot.dialogue?.trim() ?? "";
      if (dialogue.length > 0) {
        const balloonId = sourcedBalloonId(shot.id);
        const sourced = existing.balloons.find(
          (balloon) => balloon.id === balloonId,
        );
        if (!sourced) {
          update.balloon = {
            id: balloonId,
            text: dialogue,
            ...(shot.characterIds[0] ? { characterId: shot.characterIds[0] } : {}),
            create: true,
          };
        } else if (sourced.text !== dialogue) {
          update.balloon = { id: balloonId, text: dialogue, create: false };
        }
      }
      if (update.imageAssetId === undefined && update.balloon === undefined) {
        unchangedCount += 1;
        row.unchanged += 1;
      } else {
        panelUpdates.push(update);
        row.updatedPanels += 1;
        if (update.balloon) {
          balloonCount += 1;
          row.balloons += 1;
        }
      }
    }

    // New panels fill spare frames on the scene's existing pages first.
    let remaining = [...pending];
    for (const pageId of pagesByScene.get(scene.id) ?? []) {
      if (remaining.length === 0) break;
      const page = pages.find((candidate) => candidate.id === pageId);
      if (!page) continue;
      const frames = findComicLayout(page.layoutId).frames.length;
      const used = occupancy.get(pageId) ?? 0;
      const free = Math.max(0, frames - used);
      if (free === 0) continue;
      const taken = remaining.slice(0, free);
      remaining = remaining.slice(free);
      taken.forEach((draft, offset) => {
        panelCreates.push({ pageId, index: used + offset, draft });
      });
      occupancy.set(pageId, used + taken.length);
    }

    // Whatever is left becomes fresh pages sized by the layout tiers.
    for (const chunk of chunkIntoPages(remaining)) {
      pageCreates.push({
        sceneId: scene.id,
        index: nextPageIndex,
        layoutId: layoutForBeatCount(chunk.length),
        panels: chunk,
      });
      nextPageIndex += 1;
      row.newPages += 1;
    }

    sceneBreakdown.push(row);
  });

  const projectPatch: FilmToComicPlan["projectPatch"] = {
    ...(project.comicStyleId ? {} : { comicStyleId: DEFAULT_COMIC_STYLE_ID }),
    ...(project.readingDirection ? {} : { readingDirection: "ltr" as const }),
  };

  return {
    kind: "film-to-comic",
    projectId: project.id,
    pageCreates,
    panelCreates,
    panelUpdates,
    unchangedCount,
    balloonCount,
    projectPatch,
    sceneBreakdown,
  };
};

const balloonFromDraft = (shotId: ShotId, draft: BalloonDraft): Balloon => ({
  id: sourcedBalloonId(shotId),
  kind: "speech",
  ...(draft.characterId ? { characterId: draft.characterId } : {}),
  text: draft.text,
  x: SOURCED_BALLOON_X,
  y: SOURCED_BALLOON_Y,
  width: SOURCED_BALLOON_WIDTH,
});

export type FilmToComicApplied = {
  createdPages: number;
  createdPanels: number;
  updatedPanels: number;
};

/** Writes the plan into the store; ids of updated panels are preserved. */
export const applyFilmToComicPlan = (
  plan: FilmToComicPlan,
): Result<FilmToComicApplied> => {
  const store = useProjectsStore.getState();
  if (!store.projects[plan.projectId]) {
    return err(appError("not-found", "This project no longer exists."));
  }
  let createdPanels = 0;

  const createPanel = (pageId: PageId, index: number, draft: PanelDraft) => {
    const panel = store.addPanel({
      pageId,
      projectId: plan.projectId,
      index,
      description: draft.description,
      characterIds: draft.characterIds,
      sourceShotId: draft.sourceShotId,
    });
    if (draft.balloon) {
      store.updatePanel(panel.id, {
        balloons: [balloonFromDraft(draft.sourceShotId, draft.balloon)],
      });
    }
    if (draft.imageAssetId) {
      store.attachImageToPanel(panel.id, draft.imageAssetId);
    }
    createdPanels += 1;
  };

  for (const pageCreate of plan.pageCreates) {
    const page = store.addPage({
      projectId: plan.projectId,
      index: pageCreate.index,
      layoutId: pageCreate.layoutId,
    });
    pageCreate.panels.forEach((draft, position) => {
      createPanel(page.id, position, draft);
    });
  }
  for (const create of plan.panelCreates) {
    createPanel(create.pageId, create.index, create.draft);
  }
  for (const update of plan.panelUpdates) {
    if (update.imageAssetId) {
      store.attachImageToPanel(update.panelId, update.imageAssetId);
    }
    const balloonPatch = update.balloon;
    if (balloonPatch) {
      const panel = useProjectsStore.getState().panels[update.panelId];
      if (panel) {
        const balloons = balloonPatch.create
          ? [
              ...panel.balloons,
              balloonFromDraft(update.sourceShotId, {
                text: balloonPatch.text,
                ...(balloonPatch.characterId
                  ? { characterId: balloonPatch.characterId }
                  : {}),
              }),
            ]
          : panel.balloons.map((balloon) =>
              balloon.id === balloonPatch.id
                ? { ...balloon, text: balloonPatch.text }
                : balloon,
            );
        store.updatePanel(update.panelId, { balloons });
      }
    }
  }
  if (Object.keys(plan.projectPatch).length > 0) {
    store.updateProject(plan.projectId, plan.projectPatch);
  }
  return ok({
    createdPages: plan.pageCreates.length,
    createdPanels,
    updatedPanels: plan.panelUpdates.length,
  });
};
