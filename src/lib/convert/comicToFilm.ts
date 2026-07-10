import { findComicLayout } from "@/domain/constants";
import type {
  BalloonKind,
  CameraAngle,
  CameraMovement,
  CameraPresetId,
  ComicLayout,
  LensChoice,
  LightingChoice,
  Panel,
  Scene,
  SceneTimeOfDay,
  Shot,
  ShotSize,
} from "@/domain/types";
import type { CharacterId, PanelId, ProjectId, SceneId, ShotId } from "@/lib/id";
import { frameForPanelIndex, orderPanelsForReading } from "@/lib/comic/reading";
import { appError, err, ok, type Result } from "@/lib/result";
import { useProjectsStore } from "@/stores/projects";

import type { ProjectGraph } from "./graph";

/**
 * Comic to film: panels in reading order become shots, scene by scene.
 * Deterministic and idempotent; a shot created here carries its source
 * panel's id, so re-running patches that shot instead of duplicating it.
 */

const SPLASH_DURATION_SECONDS = 6;
const DEFAULT_DURATION_SECONDS = 4;
/** Frames smaller than this page fraction read as inserts and close-ups. */
const CLOSE_UP_MAX_FRAME_AREA = 0.25;
const DEFAULT_ANGLE: CameraAngle = "eye-level";
const DEFAULT_LENS: LensChoice = "35mm";

const LIGHTING_BY_TIME: Record<SceneTimeOfDay, LightingChoice> = {
  day: "natural",
  night: "low-key",
  dawn: "golden-hour",
  dusk: "blue-hour",
};

export type ShotDraft = {
  sceneId: SceneId;
  sourcePanelId: PanelId;
  index: number;
  description: string;
  dialogue: string | null;
  characterIds: CharacterId[];
  size: ShotSize;
  angle: CameraAngle;
  movement: CameraMovement;
  cameraPresetId: CameraPresetId;
  lens: LensChoice;
  lighting: LightingChoice;
  durationSeconds: number;
  /** Panel captions, carried as the created shot's prompt notes prefix. */
  promptNotes: string;
};

export type ShotPatch = Partial<
  Pick<
    Shot,
    | "description"
    | "dialogue"
    | "characterIds"
    | "size"
    | "movement"
    | "cameraPresetId"
    | "durationSeconds"
    | "promptNotes"
  >
>;

export type ShotUpdate = {
  shotId: ShotId;
  sourcePanelId: PanelId;
  patch: ShotPatch;
};

export type CameraCount = {
  size: ShotSize;
  cameraPresetId: CameraPresetId;
  count: number;
};

export type ComicToFilmSceneRow = {
  sceneId: SceneId;
  sceneNumber: number;
  location: string;
  creates: number;
  updates: number;
  unchanged: number;
};

export type ComicToFilmPlan = {
  kind: "comic-to-film";
  projectId: ProjectId;
  creates: ShotDraft[];
  updates: ShotUpdate[];
  unchangedCount: number;
  sceneBreakdown: ComicToFilmSceneRow[];
  /** Aggregate of the camera heuristic across every converted panel. */
  cameraCounts: CameraCount[];
  /** Caption balloon lines that landed in a created or updated shot's notes. */
  captionLineCount: number;
};

type CameraChoice = {
  size: ShotSize;
  movement: CameraMovement;
  cameraPresetId: CameraPresetId;
  durationSeconds: number;
};

/**
 * The camera heuristic, in precedence order: a splash page earns a rising
 * wide, a lone character in a small frame earns a locked close-up, crowded
 * panels sit at medium, and everything else stays a static medium.
 */
const cameraForPanel = (panel: Panel, layout: ComicLayout): CameraChoice => {
  if (layout.id === "splash") {
    return {
      size: "wide",
      movement: "crane-up",
      cameraPresetId: "crane-up",
      durationSeconds: SPLASH_DURATION_SECONDS,
    };
  }
  const frame = frameForPanelIndex(layout, panel.index);
  const frameArea = frame.w * frame.h;
  if (panel.characterIds.length === 1 && frameArea < CLOSE_UP_MAX_FRAME_AREA) {
    return {
      size: "close-up",
      movement: "static",
      cameraPresetId: "static",
      durationSeconds: DEFAULT_DURATION_SECONDS,
    };
  }
  return {
    size: "medium",
    movement: "static",
    cameraPresetId: "static",
    durationSeconds: DEFAULT_DURATION_SECONDS,
  };
};

/** Balloon kinds that carry spoken or thought text into shot dialogue. */
const DIALOGUE_KINDS: readonly BalloonKind[] = [
  "speech",
  "thought",
  "whisper",
  "burst",
];

/** Speech, thought, whisper, and burst text, in the panel's balloon order. */
const dialogueFromPanel = (panel: Panel): string | null => {
  const lines = panel.balloons
    .filter((balloon) => DIALOGUE_KINDS.includes(balloon.kind))
    .map((balloon) => balloon.text.trim())
    .filter((text) => text.length > 0);
  return lines.length > 0 ? lines.join("\n") : null;
};

/** Caption texts for a panel, each a separate line for the notes count; the
 * joined string becomes the shot's prompt notes prefix. */
const captionLinesFromPanel = (panel: Panel): string[] =>
  panel.balloons
    .filter((balloon) => balloon.kind === "caption")
    .map((balloon) => balloon.text.trim())
    .filter((text) => text.length > 0);

const sameIds = (a: readonly CharacterId[], b: readonly CharacterId[]): boolean =>
  a.length === b.length && a.every((id, position) => id === b[position]);

/**
 * Which scene a page belongs to. Sourced links win in either direction
 * (panel imported from a shot, or shot imported from a panel); pages with no
 * links fall back to their book position, clamped to the last scene.
 */
const sceneForPage = (
  panels: readonly Panel[],
  pagePosition: number,
  scenes: readonly Scene[],
  shotById: ReadonlyMap<ShotId, Shot>,
  shotBySourcePanel: ReadonlyMap<PanelId, Shot>,
): Scene | null => {
  for (const panel of panels) {
    const viaSourceShot = panel.sourceShotId
      ? shotById.get(panel.sourceShotId)
      : undefined;
    const viaSourcedShot = shotBySourcePanel.get(panel.id);
    const sceneId = viaSourceShot?.sceneId ?? viaSourcedShot?.sceneId;
    if (sceneId) {
      const scene = scenes.find((candidate) => candidate.id === sceneId);
      if (scene) return scene;
    }
  }
  return scenes[Math.min(pagePosition, scenes.length - 1)] ?? null;
};

export const planComicToFilm = (graph: ProjectGraph): ComicToFilmPlan => {
  const { project, scenes, shotsByScene, pages, panelsByPage } = graph;
  const direction = project.readingDirection ?? "ltr";

  const allShots = [...shotsByScene.values()].flat();
  const shotById = new Map(allShots.map((shot) => [shot.id, shot]));
  const shotBySourcePanel = new Map(
    allShots.flatMap((shot) =>
      shot.sourcePanelId ? [[shot.sourcePanelId, shot] as const] : [],
    ),
  );

  // Panels of each scene, page by page in book order, reading order inside.
  const panelsByScene = new Map<SceneId, Panel[]>();
  pages.forEach((page, position) => {
    const panels = panelsByPage.get(page.id) ?? [];
    if (panels.length === 0) return;
    const scene = sceneForPage(
      panels,
      position,
      scenes,
      shotById,
      shotBySourcePanel,
    );
    if (!scene) return;
    const layout = findComicLayout(page.layoutId);
    const ordered = orderPanelsForReading(panels, layout, direction);
    const bucket = panelsByScene.get(scene.id) ?? [];
    bucket.push(...ordered);
    panelsByScene.set(scene.id, bucket);
  });

  const creates: ShotDraft[] = [];
  const updates: ShotUpdate[] = [];
  const cameraTally = new Map<string, CameraCount>();
  const sceneBreakdown: ComicToFilmSceneRow[] = [];
  let unchangedCount = 0;
  let captionLineCount = 0;

  scenes.forEach((scene, position) => {
    const panels = panelsByScene.get(scene.id) ?? [];
    if (panels.length === 0) return;
    const existingShots = shotsByScene.get(scene.id) ?? [];
    let nextIndex =
      existingShots.reduce((max, shot) => Math.max(max, shot.index), -1) + 1;
    const row: ComicToFilmSceneRow = {
      sceneId: scene.id,
      sceneNumber: position + 1,
      location: scene.location,
      creates: 0,
      updates: 0,
      unchanged: 0,
    };

    for (const panel of panels) {
      const page = pages.find((candidate) => candidate.id === panel.pageId);
      const layout = findComicLayout(page?.layoutId ?? "splash");
      const camera = cameraForPanel(panel, layout);
      const tallyKey = `${camera.size}/${camera.cameraPresetId}`;
      const tally = cameraTally.get(tallyKey) ?? {
        size: camera.size,
        cameraPresetId: camera.cameraPresetId,
        count: 0,
      };
      tally.count += 1;
      cameraTally.set(tallyKey, tally);

      const dialogue = dialogueFromPanel(panel);
      const captionLines = captionLinesFromPanel(panel);
      const captions = captionLines.join(" ");
      const existing = shotBySourcePanel.get(panel.id);

      if (existing) {
        const patch: ShotPatch = {};
        if (existing.description !== panel.description) {
          patch.description = panel.description;
        }
        if (existing.dialogue !== dialogue) patch.dialogue = dialogue;
        if (!sameIds(existing.characterIds, panel.characterIds)) {
          patch.characterIds = [...panel.characterIds];
        }
        if (existing.size !== camera.size) patch.size = camera.size;
        if (existing.movement !== camera.movement) {
          patch.movement = camera.movement;
        }
        if (existing.cameraPresetId !== camera.cameraPresetId) {
          patch.cameraPresetId = camera.cameraPresetId;
        }
        if (existing.durationSeconds !== camera.durationSeconds) {
          patch.durationSeconds = camera.durationSeconds;
        }
        // Captions only fill empty notes; user-written notes stay untouched.
        if (captions.length > 0 && existing.promptNotes.length === 0) {
          patch.promptNotes = captions;
          captionLineCount += captionLines.length;
        }
        if (Object.keys(patch).length === 0) {
          unchangedCount += 1;
          row.unchanged += 1;
        } else {
          updates.push({ shotId: existing.id, sourcePanelId: panel.id, patch });
          row.updates += 1;
        }
        continue;
      }

      creates.push({
        sceneId: scene.id,
        sourcePanelId: panel.id,
        index: nextIndex,
        description: panel.description,
        dialogue,
        characterIds: [...panel.characterIds],
        size: camera.size,
        angle: DEFAULT_ANGLE,
        movement: camera.movement,
        cameraPresetId: camera.cameraPresetId,
        lens: DEFAULT_LENS,
        lighting: LIGHTING_BY_TIME[scene.timeOfDay],
        durationSeconds: camera.durationSeconds,
        promptNotes: captions,
      });
      if (captionLines.length > 0) captionLineCount += captionLines.length;
      nextIndex += 1;
      row.creates += 1;
    }

    sceneBreakdown.push(row);
  });

  return {
    kind: "comic-to-film",
    projectId: project.id,
    creates,
    updates,
    unchangedCount,
    sceneBreakdown,
    cameraCounts: [...cameraTally.values()].sort((a, b) => b.count - a.count),
    captionLineCount,
  };
};

export type ComicToFilmApplied = {
  createdShots: number;
  updatedShots: number;
};

/** Writes the plan into the store; ids of updated shots are preserved. */
export const applyComicToFilmPlan = (
  plan: ComicToFilmPlan,
): Result<ComicToFilmApplied> => {
  const store = useProjectsStore.getState();
  if (!store.projects[plan.projectId]) {
    return err(appError("not-found", "This project no longer exists."));
  }
  for (const draft of plan.creates) {
    const shot = store.addShot({
      sceneId: draft.sceneId,
      projectId: plan.projectId,
      index: draft.index,
      description: draft.description,
      dialogue: draft.dialogue,
      size: draft.size,
      angle: draft.angle,
      movement: draft.movement,
      lens: draft.lens,
      lighting: draft.lighting,
      durationSeconds: draft.durationSeconds,
      characterIds: draft.characterIds,
      sourcePanelId: draft.sourcePanelId,
      cameraPresetId: draft.cameraPresetId,
    });
    if (draft.promptNotes.length > 0) {
      store.updateShot(shot.id, { promptNotes: draft.promptNotes });
    }
  }
  for (const update of plan.updates) {
    store.updateShot(update.shotId, update.patch);
  }
  return ok({
    createdShots: plan.creates.length,
    updatedShots: plan.updates.length,
  });
};
