import { FilmSlate, GearSix, Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button, EmptyState } from "@/components/ui";
import { useProjectsStore } from "@/stores/projects";

import { projectsCopy } from "./copy";
import { NewProjectDialog } from "./NewProjectDialog";
import { ProjectCard } from "./ProjectCard";

/**
 * The projects home: a full page outside the workspace shell. The grid is
 * the only loud thing here; chrome stays a single hairlined top bar.
 */
export const ProjectsPage = () => {
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const projects = useProjectsStore((state) => state.projects);

  const sorted = useMemo(
    () =>
      Object.values(projects).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [projects],
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-ink-panel">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}favicon.svg`}
              alt=""
              className="size-7"
              aria-hidden
            />
            <span className="font-display text-base font-bold tracking-[-0.02em]">
              {projectsCopy.topBar.appName}
            </span>
          </div>
          <Link
            to="/settings"
            className="flex h-9 items-center gap-2 px-3 text-sm text-fg-secondary transition-colors duration-150 hover:bg-ink-hover hover:text-fg"
          >
            <GearSix size={18} aria-hidden />
            {projectsCopy.topBar.settings}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 pb-16">
        <div className="flex items-center justify-between gap-4 py-8">
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">
            {projectsCopy.page.heading}
          </h1>
          {/* One primary per view: when the grid is empty the EmptyState owns it. */}
          {sorted.length > 0 ? (
            <Button variant="primary" onClick={() => setNewProjectOpen(true)}>
              <Plus size={16} aria-hidden />
              {projectsCopy.page.newProject}
            </Button>
          ) : null}
        </div>

        {sorted.length === 0 ? (
          <div className="border border-line bg-ink-panel">
            <EmptyState
              icon={FilmSlate}
              title={projectsCopy.empty.title}
              hint={projectsCopy.empty.hint}
              action={
                <Button
                  variant="primary"
                  onClick={() => setNewProjectOpen(true)}
                >
                  <Plus size={16} aria-hidden />
                  {projectsCopy.page.newProject}
                </Button>
              }
            />
          </div>
        ) : (
          // Collapse: one column below 640px, two to 1024px, three above.
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>

      <NewProjectDialog
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
      />
    </div>
  );
};
