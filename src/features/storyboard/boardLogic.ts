import { composeFramePrompt } from "@/domain/prompt";
import type {
  Asset,
  AspectRatio,
  Character,
  GenerationTask,
  LightingChoice,
  Project,
  Scene,
  SceneTimeOfDay,
  Shot,
} from "@/domain/types";
import type { AssetId, ShotId, TaskId } from "@/lib/id";

import { storyboardCopy } from "./copy";

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Screenplay slug: "INT. LIGHTHOUSE KITCHEN, NIGHT". */
export const slugLine = (scene: Scene): string => {
  const prefix = scene.setting === "interior" ? "INT." : "EXT.";
  return `${prefix} ${scene.location.toUpperCase()}, ${scene.timeOfDay.toUpperCase()}`;
};

/** Resolves the display label for a vocabulary value from `@/domain/constants`. */
export const labelFor = <TValue extends string>(
  options: readonly { value: TValue; label: string }[],
  value: TValue,
): string => options.find((option) => option.value === value)?.label ?? value;

/* ------------------------------------------------------------------ */
/* Shot defaults                                                       */
/* ------------------------------------------------------------------ */

const LIGHTING_BY_TIME: Record<SceneTimeOfDay, LightingChoice> = {
  day: "natural",
  night: "low-key",
  dawn: "golden-hour",
  dusk: "golden-hour",
};

/** Default lighting for a fresh shot follows the scene's time of day. */
export const lightingForTime = (timeOfDay: SceneTimeOfDay): LightingChoice =>
  LIGHTING_BY_TIME[timeOfDay];

/** 2 to 12 seconds; keeps an out-of-range existing value selectable. */
export const durationOptions = (current: number): number[] => {
  const base = Array.from({ length: 11 }, (_, position) => position + 2);
  if (base.includes(current)) return base;
  return [...base, current].sort((a, b) => a - b);
};

/* ------------------------------------------------------------------ */
/* Frame generation tasks                                              */
/* ------------------------------------------------------------------ */

const isFrameTaskFor = (task: GenerationTask, shotId: ShotId): boolean =>
  task.target.kind === "shot-frame" && task.target.shotId === shotId;

export const findActiveFrameTask = (
  tasks: Record<TaskId, GenerationTask>,
  shotId: ShotId,
): GenerationTask | null =>
  Object.values(tasks).find(
    (task) =>
      isFrameTaskFor(task, shotId) &&
      (task.status.state === "queued" || task.status.state === "running"),
  ) ?? null;

export const findLatestFailedFrameTask = (
  tasks: Record<TaskId, GenerationTask>,
  shotId: ShotId,
): GenerationTask | null => {
  let latest: GenerationTask | null = null;
  for (const task of Object.values(tasks)) {
    if (!isFrameTaskFor(task, shotId)) continue;
    if (task.status.state !== "failed") continue;
    if (!latest || task.createdAt > latest.createdAt) latest = task;
  }
  return latest;
};

/** Portrait urls of the characters present in the shot, used as identity references. */
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

/** Shape accepted by `useTasksStore.enqueueImage` for a shot frame. */
export type FrameTaskInput = {
  project: Project;
  target: { kind: "shot-frame"; shotId: ShotId };
  label: string;
  request: {
    prompt: string;
    aspectRatio: AspectRatio;
    seed: number;
    referenceImageUrls: string[];
    styleId: string;
  };
};

export const buildFrameTask = (input: {
  project: Project;
  scene: Scene;
  shot: Shot;
  characters: readonly Character[];
  assets: Record<AssetId, Asset>;
  sceneNumber: number;
  shotNumber: number;
}): FrameTaskInput => ({
  project: input.project,
  target: { kind: "shot-frame", shotId: input.shot.id },
  label: storyboardCopy.frameTaskLabel(input.sceneNumber, input.shotNumber),
  request: {
    prompt: composeFramePrompt({
      project: input.project,
      scene: input.scene,
      shot: input.shot,
      characters: [...input.characters],
    }),
    aspectRatio: input.project.aspectRatio,
    seed: input.shot.seed,
    referenceImageUrls: portraitUrlsForShot(
      input.shot,
      input.characters,
      input.assets,
    ),
    styleId: input.project.styleId,
  },
});
