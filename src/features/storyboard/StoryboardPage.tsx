import { SquaresFour } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { Button, EmptyState } from "@/components/ui";
import { useActiveProject } from "@/features/shared/useActiveProject";
import type { ShotId } from "@/lib/id";
import {
  selectScenesForProject,
  selectShotsForProject,
  useProjectsStore,
} from "@/stores/projects";

import { storyboardCopy } from "./copy";
import { SceneSection } from "./SceneSection";

/**
 * The storyboard: every scene of the script as a row of shot cards, with
 * per-scene frame generation through the shared task queue. Scenes come
 * from the script room; shots are added and rearranged here.
 */
export const StoryboardPage = () => {
  const navigate = useNavigate();
  const project = useActiveProject();
  const scenesById = useProjectsStore((state) => state.scenes);
  const shotsById = useProjectsStore((state) => state.shots);

  const scenes = useMemo(
    () => (project ? selectScenesForProject(scenesById, project.id) : []),
    [scenesById, project],
  );

  // 1-based shot numbers across the whole project, in scene-then-shot order.
  const globalNumbers = useMemo(() => {
    if (!project) return new Map<ShotId, number>();
    const ordered = selectShotsForProject(shotsById, scenesById, project.id);
    return new Map(
      ordered.map((shot, position) => [shot.id, position + 1] as const),
    );
  }, [shotsById, scenesById, project]);

  // The shell guards missing projects; this covers deletion races only.
  if (!project) return null;

  return (
    <div className="h-full overflow-y-auto p-4">
      {scenes.length === 0 ? (
        <EmptyState
          icon={SquaresFour}
          title={storyboardCopy.empty.title}
          hint={storyboardCopy.empty.hint}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("../script")}
            >
              {storyboardCopy.empty.action}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {scenes.map((scene, position) => (
            <SceneSection
              key={scene.id}
              project={project}
              scene={scene}
              sceneNumber={position + 1}
              globalNumbers={globalNumbers}
            />
          ))}
        </div>
      )}
    </div>
  );
};
