import { create } from "zustand";

import { aspectRatioToDimensions, findVisualStyle } from "@/domain/constants";
import type { GenerationTarget, GenerationTask, Project } from "@/domain/types";
import { createAssetId, createTaskId, type AssetId, type TaskId } from "@/lib/id";
import { messageFromUnknown } from "@/lib/result";
import { nowIso } from "@/lib/time";
import { resolveImageProvider, resolveVideoProvider } from "@/providers/registry";
import type { ImageRequest, VideoRequest } from "@/providers/types";

import { useAssetsStore } from "./assets";
import { useProjectsStore } from "./projects";

/**
 * The generation queue runs one task at a time, artcraft-style: tasks are
 * visible, ordered, and survive navigation. Results land in the asset store
 * and attach themselves to their target (shot frame, shot video, portrait).
 */

const MAX_FINISHED_TASKS = 30;

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

type QueueEntry =
  | { kind: "image"; task: GenerationTask; request: ImageRequest }
  | { kind: "video"; task: GenerationTask; request: VideoRequest };

type TasksState = {
  tasks: Record<TaskId, GenerationTask>;
  order: TaskId[];
  enqueueImage: (input: EnqueueImageInput) => TaskId;
  enqueueVideo: (input: EnqueueVideoInput) => TaskId;
  dismissTask: (id: TaskId) => void;
  clearFinished: () => void;
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
  }
};

const runEntry = async (entry: QueueEntry): Promise<void> => {
  const { task } = entry;
  updateTask(task.id, { status: { state: "running", progress: 0.02 } });
  const onProgress = (progress: number) =>
    updateTask(task.id, {
      status: { state: "running", progress: Math.min(0.98, progress) },
    });

  try {
    if (entry.kind === "image") {
      const provider = resolveImageProvider();
      const result = await provider.generateImage(entry.request, onProgress);
      if (!result.ok) {
        updateTask(task.id, {
          status: { state: "failed", message: result.error.message },
        });
        return;
      }
      const blob = await (await fetch(result.value.url)).blob();
      const asset = await useAssetsStore.getState().saveAsset(
        {
          id: createAssetId(),
          projectId: task.projectId,
          kind: "image",
          width: result.value.width,
          height: result.value.height,
          duration: null,
          prompt: task.prompt,
          model: task.model,
          seed: entry.request.seed,
          createdAt: nowIso(),
        },
        blob,
      );
      attachResult(task.target, asset.id);
      updateTask(task.id, { status: { state: "succeeded", assetId: asset.id } });
      return;
    }

    const provider = resolveVideoProvider();
    const result = await provider.generateVideo(entry.request, onProgress);
    if (!result.ok) {
      updateTask(task.id, {
        status: { state: "failed", message: result.error.message },
      });
      return;
    }
    const blob = await (await fetch(result.value.url)).blob();
    const asset = await useAssetsStore.getState().saveAsset(
      {
        id: createAssetId(),
        projectId: task.projectId,
        kind: "video",
        width: result.value.width,
        height: result.value.height,
        duration: result.value.durationSeconds,
        prompt: task.prompt,
        model: task.model,
        seed: entry.request.seed,
        createdAt: nowIso(),
      },
      blob,
    );
    attachResult(task.target, asset.id);
    updateTask(task.id, { status: { state: "succeeded", assetId: asset.id } });
  } catch (cause) {
    updateTask(task.id, {
      status: { state: "failed", message: messageFromUnknown(cause) },
    });
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

export const useTasksStore = create<TasksState>((set) => ({
  tasks: {},
  order: [],

  enqueueImage: (input) => {
    const task: GenerationTask = {
      id: createTaskId(),
      projectId: input.project.id,
      target: input.target,
      label: input.label,
      prompt: input.request.prompt,
      model: resolveImageProvider().name,
      status: { state: "queued" },
      createdAt: nowIso(),
    };
    const { styleId, ...rest } = input.request;
    pendingQueue.push({
      kind: "image",
      task,
      request: { ...rest, style: findVisualStyle(styleId) },
    });
    set((state) =>
      trimFinished({
        ...state,
        tasks: { ...state.tasks, [task.id]: task },
        order: [...state.order, task.id],
      }),
    );
    void pumpQueue();
    return task.id;
  },

  enqueueVideo: (input) => {
    const task: GenerationTask = {
      id: createTaskId(),
      projectId: input.project.id,
      target: input.target,
      label: input.label,
      prompt: input.request.prompt,
      model: resolveVideoProvider().name,
      status: { state: "queued" },
      createdAt: nowIso(),
    };
    pendingQueue.push({ kind: "video", task, request: input.request });
    set((state) =>
      trimFinished({
        ...state,
        tasks: { ...state.tasks, [task.id]: task },
        order: [...state.order, task.id],
      }),
    );
    void pumpQueue();
    return task.id;
  },

  dismissTask: (id) => {
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
}));

export const selectActiveTaskCount = (state: {
  tasks: Record<TaskId, GenerationTask>;
}): number =>
  Object.values(state.tasks).filter(
    (task) =>
      task.status.state === "queued" || task.status.state === "running",
  ).length;

/** Convenience: dimensions for a project's aspect ratio. */
export const dimensionsForProject = (project: Project) =>
  aspectRatioToDimensions(project.aspectRatio);
