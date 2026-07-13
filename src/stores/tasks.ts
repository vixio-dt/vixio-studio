import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  aspectRatioToDimensions,
  comicStyleToVisualStyle,
  DEFAULT_COMIC_STYLE_ID,
  findComicStyle,
  findVisualStyle,
} from "@/domain/constants";
import { composePanelPrompt } from "@/domain/prompt";
import type {
  AspectRatio,
  AudioTrack,
  Character,
  GenerationTarget,
  GenerationTask,
  Panel,
  Project,
  Shot,
} from "@/domain/types";
import {
  createAssetId,
  createTaskId,
  type AssetId,
  type ProjectId,
  type TaskId,
} from "@/lib/id";
import { messageFromUnknown } from "@/lib/result";
import { nowIso } from "@/lib/time";
import {
  resolveAudioProvider,
  resolveImageProvider,
  resolveVideoProvider,
} from "@/providers/registry";
import type {
  ImageRequest,
  SpeechRequest,
  TrackRequest,
  VideoRequest,
} from "@/providers/types";

import { useAssetsStore } from "./assets";
import { useProjectsStore } from "./projects";

/**
 * The generation queue runs one task at a time, artcraft-style: tasks are
 * visible, ordered, and survive navigation. Results land in the asset store
 * and attach themselves to their target (shot frame, shot video, portrait,
 * panel image, shot dialogue, audio track).
 */

const MAX_FINISHED_TASKS = 30;

/** Shown on a task that was still queued or running when the app reloaded. */
export const INTERRUPTED_MESSAGE = "Interrupted by reload.";

type EnqueueImageInput = {
  project: Project;
  target: GenerationTarget & { kind: "shot-frame" | "character-portrait" };
  label: string;
  request: Omit<ImageRequest, "style"> & { styleId: string };
};

type EnqueueVideoInput = {
  project: Project;
  target: GenerationTarget & { kind: "shot-video" };
  label: string;
  request: VideoRequest;
};

type EnqueuePanelImageInput = {
  project: Project;
  panel: Panel;
  /** Full project cast; the composer filters by the panel's character ids. */
  characters: readonly Character[];
  label: string;
  seed: number;
  /** Edited prompt from the console; when omitted the default composition is used. */
  prompt?: string;
  /** Defaults to the project aspect; pass the closest ratio to the panel frame. */
  aspectRatio?: AspectRatio;
  referenceImageUrls?: readonly string[];
};

type EnqueueDialogueInput = {
  project: Project;
  shot: Shot;
  /** The speaking character, when one is attached; supplies the voice. */
  character?: Character | null;
  label: string;
  /** Edited dialogue text; when omitted the shot's dialogue is used. */
  text?: string;
};

type EnqueueAudioTrackInput = {
  project: Project;
  track: AudioTrack;
  durationSeconds: number;
  label: string;
  /** Edited prompt; when omitted the track's prompt is used. */
  prompt?: string;
};

type QueueEntry =
  | { kind: "image"; task: GenerationTask; request: ImageRequest }
  | { kind: "video"; task: GenerationTask; request: VideoRequest }
  | { kind: "speech"; task: GenerationTask; request: SpeechRequest }
  | { kind: "track"; task: GenerationTask; request: TrackRequest };

type TasksState = {
  tasks: Record<TaskId, GenerationTask>;
  order: TaskId[];
  enqueueImage: (input: EnqueueImageInput) => TaskId;
  enqueueVideo: (input: EnqueueVideoInput) => TaskId;
  enqueuePanelImage: (input: EnqueuePanelImageInput) => TaskId;
  enqueueDialogue: (input: EnqueueDialogueInput) => TaskId;
  enqueueAudioTrack: (input: EnqueueAudioTrackInput) => TaskId;
  dismissTask: (id: TaskId) => void;
  /** Removes a not-yet-started task from the queue; a no-op once it is running. */
  cancelQueuedTask: (id: TaskId) => void;
  clearFinished: () => void;
};

/**
 * Minimal record persisted for a task that is still queued or running, so a
 * reload can surface it as failed instead of letting it vanish silently.
 * Kept small on purpose: no prompt or model, just enough to render in the
 * queue drawer and to resolve the same regenerate affordance it belonged to.
 */
type InFlightRecord = {
  id: TaskId;
  projectId: ProjectId;
  target: GenerationTarget;
  label: string;
};

type PersistedTasksState = {
  inFlight: InFlightRecord[];
};

const pendingQueue: QueueEntry[] = [];
let isRunning = false;

const updateTask = (
  id: TaskId,
  patch: Partial<Pick<GenerationTask, "status">>,
) => {
  useTasksStore.setState((state) => {
    const existing = state.tasks[id];
    if (!existing) return state;
    return { tasks: { ...state.tasks, [id]: { ...existing, ...patch } } };
  });
};

const attachResult = (target: GenerationTarget, assetId: AssetId) => {
  const projects = useProjectsStore.getState();
  switch (target.kind) {
    case "shot-frame":
      projects.attachFrameToShot(target.shotId, assetId);
      return;
    case "shot-video":
      projects.attachVideoToShot(target.shotId, assetId);
      return;
    case "character-portrait":
      projects.attachPortraitToCharacter(target.characterId, assetId);
      return;
    case "panel-image":
      projects.attachImageToPanel(target.panelId, assetId);
      return;
    case "shot-dialogue":
      projects.attachDialogueToShot(target.shotId, assetId);
      return;
    case "audio-track":
      projects.attachAssetToAudioTrack(target.trackId, assetId);
      return;
  }
};

const failTask = (id: TaskId, message: string) =>
  updateTask(id, { status: { state: "failed", message } });

/** Save the finished blob, attach it to the target, and close out the task. */
const succeedTask = async (
  task: GenerationTask,
  meta: { width: number; height: number; duration: number | null; seed: number },
  blob: Blob,
  kind: "image" | "video" | "audio",
): Promise<void> => {
  const asset = await useAssetsStore.getState().saveAsset(
    {
      id: createAssetId(),
      projectId: task.projectId,
      kind,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      prompt: task.prompt,
      model: task.model,
      seed: meta.seed,
      createdAt: nowIso(),
    },
    blob,
  );
  attachResult(task.target, asset.id);
  updateTask(task.id, { status: { state: "succeeded", assetId: asset.id } });
};

const runEntry = async (entry: QueueEntry): Promise<void> => {
  const { task } = entry;
  updateTask(task.id, { status: { state: "running", progress: 0.02 } });
  const onProgress = (progress: number) =>
    updateTask(task.id, {
      status: { state: "running", progress: Math.min(0.98, progress) },
    });

  try {
    switch (entry.kind) {
      case "image": {
        const provider = resolveImageProvider();
        const result = await provider.generateImage(entry.request, onProgress);
        if (!result.ok) {
          failTask(task.id, result.error.message);
          return;
        }
        const blob = await (await fetch(result.value.url)).blob();
        await succeedTask(
          task,
          {
            width: result.value.width,
            height: result.value.height,
            duration: null,
            seed: entry.request.seed,
          },
          blob,
          "image",
        );
        return;
      }

      case "video": {
        const provider = resolveVideoProvider();
        const result = await provider.generateVideo(entry.request, onProgress);
        if (!result.ok) {
          failTask(task.id, result.error.message);
          return;
        }
        const blob = await (await fetch(result.value.url)).blob();
        await succeedTask(
          task,
          {
            width: result.value.width,
            height: result.value.height,
            duration: result.value.durationSeconds,
            seed: entry.request.seed,
          },
          blob,
          "video",
        );
        return;
      }

      case "speech": {
        const provider = resolveAudioProvider();
        const result = await provider.generateSpeech(entry.request, onProgress);
        if (!result.ok) {
          failTask(task.id, result.error.message);
          return;
        }
        await succeedTask(
          task,
          {
            width: 0,
            height: 0,
            duration: result.value.durationSeconds,
            seed: 0,
          },
          result.value.blob,
          "audio",
        );
        return;
      }

      case "track": {
        const provider = resolveAudioProvider();
        const result = await provider.generateTrack(entry.request, onProgress);
        if (!result.ok) {
          failTask(task.id, result.error.message);
          return;
        }
        await succeedTask(
          task,
          {
            width: 0,
            height: 0,
            duration: result.value.durationSeconds,
            seed: 0,
          },
          result.value.blob,
          "audio",
        );
        return;
      }
    }
  } catch (cause) {
    failTask(task.id, messageFromUnknown(cause));
  }
};

const pumpQueue = async (): Promise<void> => {
  if (isRunning) return;
  isRunning = true;
  while (pendingQueue.length > 0) {
    const entry = pendingQueue.shift();
    if (entry) await runEntry(entry);
  }
  isRunning = false;
};

const trimFinished = (state: TasksState): Pick<TasksState, "tasks" | "order"> => {
  const finished = state.order.filter((id) => {
    const task = state.tasks[id];
    return task && task.status.state !== "queued" && task.status.state !== "running";
  });
  if (finished.length <= MAX_FINISHED_TASKS) {
    return { tasks: state.tasks, order: state.order };
  }
  const toDrop = new Set(finished.slice(0, finished.length - MAX_FINISHED_TASKS));
  const tasks = { ...state.tasks };
  for (const id of toDrop) delete tasks[id];
  return { tasks, order: state.order.filter((id) => !toDrop.has(id)) };
};

const buildTask = (input: {
  project: Project;
  target: GenerationTarget;
  label: string;
  prompt: string;
  model: string;
}): GenerationTask => ({
  id: createTaskId(),
  projectId: input.project.id,
  target: input.target,
  label: input.label,
  prompt: input.prompt,
  model: input.model,
  status: { state: "queued" },
  createdAt: nowIso(),
});

/** Register the task, queue its work, and kick the serial pump. */
const commitEntry = (entry: QueueEntry): TaskId => {
  pendingQueue.push(entry);
  useTasksStore.setState((state) =>
    trimFinished({
      ...state,
      tasks: { ...state.tasks, [entry.task.id]: entry.task },
      order: [...state.order, entry.task.id],
    }),
  );
  void pumpQueue();
  return entry.task.id;
};

export const useTasksStore = create<TasksState>()(
  persist<TasksState, [], [], PersistedTasksState>(
    (set) => ({
      tasks: {},
      order: [],

      enqueueImage: (input) => {
        const task = buildTask({
          project: input.project,
          target: input.target,
          label: input.label,
          prompt: input.request.prompt,
          model: resolveImageProvider().name,
        });
        const { styleId, ...rest } = input.request;
        return commitEntry({
          kind: "image",
          task,
          request: { ...rest, style: findVisualStyle(styleId) },
        });
      },

      enqueueVideo: (input) => {
        const task = buildTask({
          project: input.project,
          target: input.target,
          label: input.label,
          prompt: input.request.prompt,
          model: resolveVideoProvider().name,
        });
        return commitEntry({ kind: "video", task, request: input.request });
      },

      enqueuePanelImage: (input) => {
        const prompt =
          input.prompt ??
          composePanelPrompt({
            project: input.project,
            panel: input.panel,
            characters: [...input.characters],
          });
        const task = buildTask({
          project: input.project,
          target: { kind: "panel-image", panelId: input.panel.id },
          label: input.label,
          prompt,
          model: resolveImageProvider().name,
        });
        const style = findComicStyle(
          input.project.comicStyleId ?? DEFAULT_COMIC_STYLE_ID,
        );
        return commitEntry({
          kind: "image",
          task,
          request: {
            prompt,
            aspectRatio: input.aspectRatio ?? input.project.aspectRatio,
            seed: input.seed,
            style: comicStyleToVisualStyle(style),
            referenceImageUrls: [...(input.referenceImageUrls ?? [])],
          },
        });
      },

      enqueueDialogue: (input) => {
        const text = (input.text ?? input.shot.dialogue ?? "").trim();
        const task = buildTask({
          project: input.project,
          target: { kind: "shot-dialogue", shotId: input.shot.id },
          label: input.label,
          prompt: text,
          model: resolveAudioProvider().name,
        });
        const request: SpeechRequest = { text };
        if (input.character?.voiceId) request.voiceId = input.character.voiceId;
        if (input.character?.name) request.characterName = input.character.name;
        return commitEntry({ kind: "speech", task, request });
      },

      enqueueAudioTrack: (input) => {
        const prompt = (input.prompt ?? input.track.prompt).trim();
        const task = buildTask({
          project: input.project,
          target: { kind: "audio-track", trackId: input.track.id },
          label: input.label,
          prompt,
          model: resolveAudioProvider().name,
        });
        return commitEntry({
          kind: "track",
          task,
          request: {
            prompt,
            lane: input.track.lane,
            durationSeconds: input.durationSeconds,
          },
        });
      },

      dismissTask: (id) => {
        set((state) => {
          const tasks = { ...state.tasks };
          delete tasks[id];
          return { tasks, order: state.order.filter((entry) => entry !== id) };
        });
      },

      cancelQueuedTask: (id) => {
        const pendingIndex = pendingQueue.findIndex((entry) => entry.task.id === id);
        // Already running (or finished): the running task keeps its own affordances.
        if (pendingIndex === -1) return;
        pendingQueue.splice(pendingIndex, 1);
        set((state) => {
          const tasks = { ...state.tasks };
          delete tasks[id];
          return { tasks, order: state.order.filter((entry) => entry !== id) };
        });
      },

      clearFinished: () => {
        set((state) => {
          const keep = state.order.filter((id) => {
            const task = state.tasks[id];
            return (
              task &&
              (task.status.state === "queued" || task.status.state === "running")
            );
          });
          const tasks: TasksState["tasks"] = {};
          for (const id of keep) {
            const task = state.tasks[id];
            if (task) tasks[id] = task;
          }
          return { tasks, order: keep };
        });
      },
    }),
    {
      name: "vixio-tasks-inflight",
      version: 1,
      // Persist only enough to notice an interrupted task on reload; finished
      // history is intentionally ephemeral.
      partialize: (state) => ({
        inFlight: state.order.flatMap((id): InFlightRecord[] => {
          const task = state.tasks[id];
          if (
            !task ||
            (task.status.state !== "queued" && task.status.state !== "running")
          ) {
            return [];
          }
          return [
            {
              id: task.id,
              projectId: task.projectId,
              target: task.target,
              label: task.label,
            },
          ];
        }),
      }),
      merge: (persisted, current) => {
        const inFlight = (persisted as Partial<PersistedTasksState> | null)
          ?.inFlight;
        if (!inFlight || inFlight.length === 0) return current;
        const tasks = { ...current.tasks };
        const order = [...current.order];
        for (const record of inFlight) {
          tasks[record.id] = {
            id: record.id,
            projectId: record.projectId,
            target: record.target,
            label: record.label,
            prompt: "",
            model: "",
            status: { state: "failed", message: INTERRUPTED_MESSAGE },
            createdAt: nowIso(),
          };
          if (!order.includes(record.id)) order.push(record.id);
        }
        return { ...current, tasks, order };
      },
    },
  ),
);

export const selectActiveTaskCount = (state: {
  tasks: Record<TaskId, GenerationTask>;
}): number =>
  Object.values(state.tasks).filter(
    (task) =>
      task.status.state === "queued" || task.status.state === "running",
  ).length;

// Warn before an accidental reload or tab close drops the in-flight queue.
// A queued or running task still shows up after reload (see the persist
// `merge` above), but as a failed, regenerate-from-scratch entry, so this
// confirmation is the first line of defense.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    if (selectActiveTaskCount(useTasksStore.getState()) === 0) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

/** Convenience: dimensions for a project's aspect ratio. */
export const dimensionsForProject = (project: Project) =>
  aspectRatioToDimensions(project.aspectRatio);
