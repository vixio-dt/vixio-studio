import type {
  Asset,
  Character,
  GenerationTask,
  Scene,
  Shot,
} from "@/domain/types";
import type { AssetId, ShotId, TaskId } from "@/lib/id";

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Screenplay slug for rail group headers: "INT. LIGHTHOUSE KITCHEN, NIGHT". */
export const slugLine = (scene: Scene): string => {
  const prefix = scene.setting === "interior" ? "INT." : "EXT.";
  return `${prefix} ${scene.location.toUpperCase()}, ${scene.timeOfDay.toUpperCase()}`;
};

/* ------------------------------------------------------------------ */
/* Task scans                                                          */
/* ------------------------------------------------------------------ */

const isFrameTaskFor = (task: GenerationTask, shotId: ShotId): boolean =>
  task.target.kind === "shot-frame" && task.target.shotId === shotId;

/** Queued or running shot-frame tasks for one shot, oldest first. */
export const activeFrameTasks = (
  tasks: Record<TaskId, GenerationTask>,
  shotId: ShotId,
): GenerationTask[] =>
  Object.values(tasks)
    .filter(
      (task) =>
        isFrameTaskFor(task, shotId) &&
        (task.status.state === "queued" || task.status.state === "running"),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export type FrameFailure = {
  taskId: TaskId;
  message: string;
};

/**
 * The newest failed shot-frame task for this shot, suppressed once a newer
 * attempt is in flight or has already succeeded, so stale errors never sit
 * over a healthy frame.
 */
export const latestFrameFailure = (
  tasks: Record<TaskId, GenerationTask>,
  shotId: ShotId,
): FrameFailure | null => {
  let failed: GenerationTask | null = null;
  let newestOther: string | null = null;
  for (const task of Object.values(tasks)) {
    if (!isFrameTaskFor(task, shotId)) continue;
    if (task.status.state === "failed") {
      if (!failed || task.createdAt > failed.createdAt) failed = task;
    } else if (!newestOther || task.createdAt > newestOther) {
      newestOther = task.createdAt;
    }
  }
  if (!failed || failed.status.state !== "failed") return null;
  if (newestOther && newestOther > failed.createdAt) return null;
  return { taskId: failed.id, message: failed.status.message };
};

/* ------------------------------------------------------------------ */
/* Character resolution                                                */
/* ------------------------------------------------------------------ */

/** The scene's character list resolved to full records, in scene order. */
export const charactersForScene = (
  scene: Scene,
  characters: readonly Character[],
): Character[] => {
  const resolved: Character[] = [];
  for (const id of scene.characterIds) {
    const character = characters.find((candidate) => candidate.id === id);
    if (character) resolved.push(character);
  }
  return resolved;
};

/** Portrait urls of the characters included in the shot, identity references. */
export const portraitUrlsForShot = (
  shot: Shot,
  characters: readonly Character[],
  assets: Record<AssetId, Asset>,
): string[] => {
  const urls: string[] = [];
  for (const character of characters) {
    if (!shot.characterIds.includes(character.id)) continue;
    if (!character.portraitAssetId) continue;
    const asset = assets[character.portraitAssetId];
    if (asset) urls.push(asset.url);
  }
  return urls;
};
