import {
  Aperture,
  BookOpen,
  Cube,
  Export,
  FilmReel,
  FilmSlate,
  FilmStrip,
  GearSix,
  PaintBrush,
  Queue,
  SquaresFour,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { Badge, Segmented } from "@/components/ui";
import {
  DEFAULT_COMIC_STYLE_ID,
  findComicStyle,
  findVisualStyle,
} from "@/domain/constants";
import type { Project, ProjectMode } from "@/domain/types";
import type { ProjectId } from "@/lib/id";
import { useProjectsStore } from "@/stores/projects";
import { selectActiveTaskCount, useTasksStore } from "@/stores/tasks";

import { AccountChip } from "./AccountChip";
import { TaskDrawer } from "./TaskDrawer";

type NavItem = { to: string; label: string; icon: Icon };

const FILM_NAV_ITEMS: readonly NavItem[] = [
  { to: "script", label: "Script", icon: FilmSlate },
  { to: "cast", label: "Cast", icon: UsersThree },
  { to: "storyboard", label: "Board", icon: SquaresFour },
  { to: "previz", label: "Previz", icon: Cube },
  { to: "framelab", label: "Frames", icon: Aperture },
  { to: "motion", label: "Motion", icon: FilmReel },
  { to: "timeline", label: "Cut", icon: FilmStrip },
];

const COMIC_NAV_ITEMS: readonly NavItem[] = [
  { to: "script", label: "Script", icon: FilmSlate },
  { to: "cast", label: "Cast", icon: UsersThree },
  { to: "pages", label: "Pages", icon: BookOpen },
  { to: "panels", label: "Panels", icon: PaintBrush },
  { to: "export", label: "Export", icon: Export },
];

const styleBadgeLabel = (project: Project): string =>
  project.mode === "comic"
    ? findComicStyle(project.comicStyleId ?? DEFAULT_COMIC_STYLE_ID).label
    : findVisualStyle(project.styleId).name;

const MODE_OPTIONS = [
  { value: "film", label: "Film", testId: "mode-switch-film" },
  { value: "comic", label: "Comic", testId: "mode-switch-comic" },
] as const satisfies readonly { value: ProjectMode; label: string; testId: string }[];

/**
 * Workspace chrome: a 64px icon rail, a slim top bar, and the working canvas.
 * The chrome stays near-monochrome; the user's frames are the loudest thing
 * on screen.
 */
export const WorkspaceShell = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const project = useProjectsStore((state) =>
    projectId ? (state.projects[projectId as ProjectId] ?? null) : null,
  );
  const updateProject = useProjectsStore((state) => state.updateProject);
  const hasShots = useProjectsStore((state) =>
    projectId
      ? Object.values(state.shots).some(
          (shot) => shot.projectId === (projectId as ProjectId),
        )
      : false,
  );
  const hasPanels = useProjectsStore((state) =>
    projectId
      ? Object.values(state.panels).some(
          (panel) => panel.projectId === (projectId as ProjectId),
        )
      : false,
  );
  const activeTasks = useTasksStore(selectActiveTaskCount);
  const [queueOpen, setQueueOpen] = useState(false);

  // Flip engines without re-converting; leave film-only or comic-only pages
  // for the target mode's landing view so the rail always matches the canvas.
  const handleModeChange = (mode: ProjectMode) => {
    if (!project || mode === project.mode) return;
    updateProject(project.id, { mode });
    const items = mode === "comic" ? COMIC_NAV_ITEMS : FILM_NAV_ITEMS;
    const currentTab = location.pathname.split("/").pop() ?? "";
    if (!items.some((item) => item.to === currentTab)) {
      navigate(mode === "comic" ? "pages" : "storyboard");
    }
  };

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
          <Badge>{styleBadgeLabel(project)}</Badge>
          <span className="font-mono text-xs text-fg-muted">
            {project.aspectRatio}
          </span>
          {hasShots && hasPanels ? (
            <Segmented
              size="sm"
              ariaLabel="Engine"
              options={MODE_OPTIONS}
              value={project.mode}
              onChange={handleModeChange}
            />
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <AccountChip />
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
        {(project.mode === "comic" ? COMIC_NAV_ITEMS : FILM_NAV_ITEMS).map(
          ({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={`nav-${to}`}
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
          ),
        )}
      </nav>

      <main className="col-start-2 row-start-2 min-w-0 overflow-hidden">
        <Outlet />
      </main>

      <TaskDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />
    </div>
  );
};
