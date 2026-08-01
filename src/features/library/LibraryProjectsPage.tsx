import { Books, CaretRight } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/ui";

import { fetchProjects, type ProjectSummary } from "./api";
import { ErrorRow, LibraryPage, LoadingRow, type Loadable } from "./chrome";

/**
 * /library — the writing-platform project registry. Each entry is a git
 * checkout on the server; picking one opens its document list.
 */
export const LibraryProjectsPage = () => {
  // Loading is the derived default until the fetch settles — no state write
  // happens synchronously inside the effect.
  const [settled, setSettled] = useState<Loadable<ProjectSummary[]> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetchProjects()
      .then((projects) => {
        if (!cancelled) setSettled({ state: "ready", data: projects });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSettled({
            state: "error",
            message:
              error instanceof Error ? error.message : "could not load projects",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load: Loadable<ProjectSummary[]> = settled ?? { state: "loading" };

  return (
    <LibraryPage backTo="/" backLabel="Studio" title="Library">
      {load.state === "loading" ? (
        <LoadingRow label="Loading projects…" />
      ) : load.state === "error" ? (
        <ErrorRow message={load.message} />
      ) : load.data.length === 0 ? (
        <div className="border border-line bg-ink-panel">
          <EmptyState
            icon={Books}
            title="No projects registered"
            hint="Register a git checkout in the server's projects config to see it here."
          />
        </div>
      ) : (
        <ul className="divide-y divide-line border border-line bg-ink-panel">
          {load.data.map((project) => (
            <li key={project.id}>
              <Link
                to={`/library/${encodeURIComponent(project.id)}`}
                data-testid="library-project-item"
                className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-ink-hover"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Books size={18} className="shrink-0 text-fg-muted" aria-hidden />
                  <span className="truncate text-sm font-medium">{project.name}</span>
                  <span className="shrink-0 font-mono text-xs text-fg-muted">
                    {project.id}
                  </span>
                </span>
                <CaretRight size={14} className="shrink-0 text-fg-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </LibraryPage>
  );
};
