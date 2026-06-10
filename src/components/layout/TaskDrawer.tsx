import { Queue, X } from "@phosphor-icons/react";

import { Button } from "@/components/ui";
import type { GenerationTask } from "@/domain/types";
import { formatRelativeTime } from "@/lib/time";
import { useTasksStore } from "@/stores/tasks";

type TaskDrawerProps = {
  open: boolean;
  onClose: () => void;
};

const statusLine = (task: GenerationTask): string => {
  switch (task.status.state) {
    case "queued":
      return "Queued";
    case "running":
      return `Rendering ${Math.round(task.status.progress * 100)}%`;
    case "succeeded":
      return "Done";
    case "failed":
      return task.status.message;
  }
};

const TaskRow = ({ task }: { task: GenerationTask }) => {
  const dismissTask = useTasksStore((state) => state.dismissTask);
  const running = task.status.state === "running";
  const failed = task.status.state === "failed";

  return (
    <li className="border-b border-line px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-fg">{task.label}</p>
          <p
            className={`mt-0.5 font-mono text-xs ${
              failed ? "text-danger" : running ? "text-accent" : "text-fg-muted"
            }`}
          >
            {statusLine(task)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {running ? (
            <span
              className="size-1.5 animate-pulse rounded-full bg-accent-media"
              aria-hidden
            />
          ) : (
            <span className="font-mono text-[11px] text-fg-muted">
              {formatRelativeTime(task.createdAt)}
            </span>
          )}
          {!running && task.status.state !== "queued" ? (
            <button
              type="button"
              aria-label="Dismiss task"
              onClick={() => dismissTask(task.id)}
              className="flex size-6 items-center justify-center text-fg-muted transition-colors hover:bg-ink-hover hover:text-fg"
            >
              <X size={12} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      {running ? (
        <div className="mt-2 h-0.5 w-full bg-ink-hover">
          <div
            className="h-full bg-accent-media transition-[width] duration-300"
            style={{
              width: `${Math.round(
                task.status.state === "running" ? task.status.progress * 100 : 0,
              )}%`,
            }}
          />
        </div>
      ) : null}
    </li>
  );
};

export const TaskDrawer = ({ open, onClose }: TaskDrawerProps) => {
  const tasks = useTasksStore((state) => state.tasks);
  const order = useTasksStore((state) => state.order);
  const clearFinished = useTasksStore((state) => state.clearFinished);

  if (!open) return null;

  const ordered = [...order]
    .reverse()
    .map((id) => tasks[id])
    .filter((task): task is GenerationTask => task !== undefined);

  return (
    <aside
      aria-label="Generation queue"
      className="fixed inset-y-0 right-0 z-20 flex w-80 flex-col border-l border-line-strong bg-ink-panel"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="font-display text-sm font-bold tracking-[-0.02em]">
          Render queue
        </h2>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={clearFinished}>
            Clear done
          </Button>
          <button
            type="button"
            aria-label="Close queue"
            onClick={onClose}
            className="flex size-8 items-center justify-center text-fg-muted transition-colors hover:bg-ink-hover hover:text-fg"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      </header>
      {ordered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <Queue size={24} className="text-fg-muted" aria-hidden />
          <p className="text-sm text-fg-secondary">
            Nothing rendering. Generate a frame or clip and it will appear here.
          </p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {ordered.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </aside>
  );
};
