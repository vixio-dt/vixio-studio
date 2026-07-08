import type { GenerationTask } from "@/domain/types";
import type { PanelId, TaskId } from "@/lib/id";

/** Task scans for the panel lab, mirroring the frame lab's discipline. */

const isPanelTaskFor = (task: GenerationTask, panelId: PanelId): boolean =>
  task.target.kind === "panel-image" && task.target.panelId === panelId;

/** Queued or running panel-image tasks for one panel, oldest first. */
export const activePanelTasks = (
  tasks: Record<TaskId, GenerationTask>,
  panelId: PanelId,
): GenerationTask[] =>
  Object.values(tasks)
    .filter(
      (task) =>
        isPanelTaskFor(task, panelId) &&
        (task.status.state === "queued" || task.status.state === "running"),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export type PanelFailure = {
  taskId: TaskId;
  message: string;
};

/**
 * The newest failed panel-image task for this panel, suppressed once a newer
 * attempt is in flight or has already succeeded.
 */
export const latestPanelFailure = (
  tasks: Record<TaskId, GenerationTask>,
  panelId: PanelId,
): PanelFailure | null => {
  let failed: GenerationTask | null = null;
  let newestOther: string | null = null;
  for (const task of Object.values(tasks)) {
    if (!isPanelTaskFor(task, panelId)) continue;
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
