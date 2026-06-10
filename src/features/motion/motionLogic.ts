import type {
  AspectRatio,
  GenerationTask,
  Project,
  Scene,
  Shot,
} from "@/domain/types";
import type { ShotId, TaskId } from "@/lib/id";

import { motionCopy } from "./copy";

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Screenplay slug for rail headers: "INT. LIGHTHOUSE KITCHEN, NIGHT". */
export const slugLine = (scene: Scene): string => {
  const prefix = scene.setting === "interior" ? "INT." : "EXT.";
  return `${prefix} ${scene.location.toUpperCase()}, ${scene.timeOfDay.toUpperCase()}`;
};

/* ------------------------------------------------------------------ */
/* Clip task helpers                                                   */
/* ------------------------------------------------------------------ */

const isClipTaskFor = (task: GenerationTask, shotId: ShotId): boolean =>
  task.target.kind === "shot-video" && task.target.shotId === shotId;

/** The queued or running shot-video task for this shot, if one exists. */
export const findActiveClipTask = (
  tasks: Record<TaskId, GenerationTask>,
  shotId: ShotId,
): GenerationTask | null =>
  Object.values(tasks).find(
    (task) =>
      isClipTaskFor(task, shotId) &&
      (task.status.state === "queued" || task.status.state === "running"),
  ) ?? null;

export type FailedClipTask = {
  id: TaskId;
  message: string;
  createdAt: string;
};

/** Newest failed shot-video task for this shot, with the failure message. */
export const findLatestFailedClipTask = (
  tasks: Record<TaskId, GenerationTask>,
  shotId: ShotId,
): FailedClipTask | null => {
  let latest: FailedClipTask | null = null;
  for (const task of Object.values(tasks)) {
    if (!isClipTaskFor(task, shotId)) continue;
    if (task.status.state !== "failed") continue;
    if (latest && task.createdAt <= latest.createdAt) continue;
    latest = {
      id: task.id,
      message: task.status.message,
      createdAt: task.createdAt,
    };
  }
  return latest;
};

/** Shape accepted by `useTasksStore.enqueueVideo` for a shot clip. */
export type ClipTaskInput = {
  project: Project;
  target: { kind: "shot-video"; shotId: ShotId };
  label: string;
  request: {
    prompt: string;
    aspectRatio: AspectRatio;
    seed: number;
    durationSeconds: number;
    startFrameUrl: string | null;
    movement: string;
  };
};

export const buildClipTask = (input: {
  project: Project;
  shot: Shot;
  prompt: string;
  startFrameUrl: string | null;
  globalNumber: number;
}): ClipTaskInput => ({
  project: input.project,
  target: { kind: "shot-video", shotId: input.shot.id },
  label: motionCopy.console.clipTaskLabel(input.globalNumber),
  request: {
    prompt: input.prompt,
    aspectRatio: input.project.aspectRatio,
    seed: input.shot.seed,
    durationSeconds: input.shot.durationSeconds,
    startFrameUrl: input.startFrameUrl,
    movement: input.shot.movement,
  },
});
