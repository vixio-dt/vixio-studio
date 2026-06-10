import { useParams } from "react-router-dom";

import type { Project } from "@/domain/types";
import type { ProjectId } from "@/lib/id";
import { useProjectsStore } from "@/stores/projects";

/**
 * Resolves the project for the current workspace route. The shell already
 * guards against missing projects, so pages may rely on it existing; the
 * null branch only covers direct deep links during deletion races.
 */
export const useActiveProject = (): Project | null => {
  const { projectId } = useParams<{ projectId: string }>();
  return useProjectsStore((state) =>
    projectId ? (state.projects[projectId as ProjectId] ?? null) : null,
  );
};
