import type { ComicPage, Panel, Project, Scene, Shot } from "@/domain/types";
import type { PageId, ProjectId, SceneId } from "@/lib/id";
import { appError, err, ok, type Result } from "@/lib/result";
import {
  selectPagesForProject,
  selectPanelsForPage,
  selectScenesForProject,
  selectShotsForScene,
  useProjectsStore,
} from "@/stores/projects";

/**
 * Snapshot of everything the converters read. Planners are pure functions
 * over this graph; only the apply step writes back to the store.
 */
export type ProjectGraph = {
  project: Project;
  /** Scenes in script order. */
  scenes: Scene[];
  /** Shots per scene, in shot order. */
  shotsByScene: ReadonlyMap<SceneId, Shot[]>;
  /** Pages in book order. */
  pages: ComicPage[];
  /** Panels per page, in stored index order. */
  panelsByPage: ReadonlyMap<PageId, Panel[]>;
};

/** Reads the current store into an immutable-by-convention conversion graph. */
export const readProjectGraph = (projectId: ProjectId): Result<ProjectGraph> => {
  const state = useProjectsStore.getState();
  const project = state.projects[projectId];
  if (!project) {
    return err(appError("not-found", "This project no longer exists."));
  }
  const scenes = selectScenesForProject(state.scenes, projectId);
  const shotsByScene = new Map(
    scenes.map((scene) => [scene.id, selectShotsForScene(state.shots, scene.id)]),
  );
  const pages = selectPagesForProject(state.pages, projectId);
  const panelsByPage = new Map(
    pages.map((page) => [page.id, selectPanelsForPage(state.panels, page.id)]),
  );
  return ok({ project, scenes, shotsByScene, pages, panelsByPage });
};
