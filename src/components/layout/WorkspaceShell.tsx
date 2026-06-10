import {
  Aperture,
  FilmReel,
  FilmSlate,
  FilmStrip,
  GearSix,
  Queue,
  SquaresFour,
  UsersThree,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";

import { Badge } from "@/components/ui";
import { findVisualStyle } from "@/domain/constants";
import type { ProjectId } from "@/lib/id";
import { useProjectsStore } from "@/stores/projects";
import { selectActiveTaskCount, useTasksStore } from "@/stores/tasks";

import { TaskDrawer } from "./TaskDrawer";

const NAV_ITEMS = [
  { to: "script", label: "Script", icon: FilmSlate },
  { to: "cast", label: "Cast", icon: UsersThree },
  { to: "storyboard", label: "Board", icon: SquaresFour },
  { to: "framelab", label: "Frames", icon: Aperture },
  { to: "motion", label: "Motion", icon: FilmReel },
  { to: "timeline", label: "Cut", icon: FilmStrip },
] as const;

/**
 * Workspace chrome: a 64px icon rail, a slim top bar, and the working canvas.
 * The chrome stays near-monochrome; the user's frames are the loudest thing
 * on screen.
 */
export const WorkspaceShell = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProjectsStore((state) =>
    projectId ? (state.projects[projectId as ProjectId] ?? null) : null,
  );
  const activeTasks = useTasksStore(selectActiveTaskCount);
  const [queueOpen, setQueueOpen] = useState(false);

  if (!project) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3">
        <p className="text-sm text-fg-secondary">
          This project does not exist or was deleted.
        </p>
        <Link to="/" className="text-sm text-accent hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="grid min-h-[100dvh] grid-cols-[64px_1fr] grid-rows-[56px_1fr]">
      <Link
        to="/"
        aria-label="All projects"
        className="col-start-1 row-start-1 flex items-center justify-center border-b border-r border-line bg-ink-panel"
      >
        <img
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt=""
          className="size-8"
          aria-hidden
        />
      </Link>

      <header className="col-start-2 flex items-center justify-between border-b border-line bg-ink-panel px-4">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate font-display text-base font-bold tracking-[-0.02em]">
            {project.title}
          </h1>
          <Badge>{findVisualStyle(project.styleId).name}</Badge>
          <span className="font-mono text-xs text-fg-muted">
            {project.aspectRatio}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setQueueOpen((current) => !current)}
            aria-label="Toggle render queue"
            className="relative flex h-9 items-center gap-2 px-3 text-sm text-fg-secondary transition-colors hover:bg-ink-hover hover:text-fg"
          >
            <Queue size={18} aria-hidden />
            {activeTasks > 0 ? (
              <span className="font-mono text-xs text-accent">{activeTasks}</span>
            ) : null}
          </button>
          <Link
            to="/settings"
            aria-label="Settings"
            className="flex size-9 items-center justify-center text-fg-secondary transition-colors hover:bg-ink-hover hover:text-fg"
          >
            <GearSix size={18} aria-hidden />
          </Link>
        </div>
      </header>

      <nav
        aria-label="Workspace"
        className="col-start-1 row-start-2 flex flex-col items-stretch border-r border-line bg-ink-panel pt-2"
      >
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-3 text-[10px] transition-colors ${
                isActive
                  ? "border-r border-accent-media bg-ink-raised text-fg"
                  : "text-fg-muted hover:bg-ink-hover hover:text-fg-secondary"
              }`
            }
          >
            <Icon size={20} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="col-start-2 row-start-2 min-w-0 overflow-hidden">
        <Outlet />
      </main>

      <TaskDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />
    </div>
  );
};
