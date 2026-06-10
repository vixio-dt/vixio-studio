import { FilmSlate, Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { Button, EmptyState, Skeleton } from "@/components/ui";
import type { Project } from "@/domain/types";
import { useActiveProject } from "@/features/shared/useActiveProject";
import {
  selectCharactersForProject,
  selectScenesForProject,
  useProjectsStore,
} from "@/stores/projects";

import { scriptCopy } from "./copy";
import { DevelopmentPanel } from "./DevelopmentPanel";
import { SceneCard } from "./SceneCard";
import { DEFAULT_SCENE_COUNT } from "./scriptLogic";
import { useGenerateScript } from "./useGenerateScript";

/**
 * The script room: development controls on the left, the scene list on the
 * right. Below lg the columns collapse into one scroll with the development
 * panel on top.
 */
export const ScriptPage = () => {
  const project = useActiveProject();
  // The shell guards missing projects; this covers deletion races only.
  if (!project) return null;
  return <ScriptWorkspace project={project} />;
};

const ScriptWorkspace = ({ project }: { project: Project }) => {
  const scenesById = useProjectsStore((state) => state.scenes);
  const charactersById = useProjectsStore((state) => state.characters);
  const addScene = useProjectsStore((state) => state.addScene);

  const [sceneCount, setSceneCount] = useState(DEFAULT_SCENE_COUNT);
  const { phase, generate } = useGenerateScript(project);

  const scenes = useMemo(
    () => selectScenesForProject(scenesById, project.id),
    [scenesById, project.id],
  );
  const projectCharacters = useMemo(
    () => selectCharactersForProject(charactersById, project.id),
    [charactersById, project.id],
  );

  const handleAddScene = () => {
    const last = scenes[scenes.length - 1];
    addScene({
      projectId: project.id,
      index: last ? last.index + 1 : 0,
      setting: "interior",
      location: scriptCopy.scenes.newLocation,
      timeOfDay: "day",
      summary: "",
      body: "",
      characterIds: [],
    });
  };

  const generating = phase.state === "running";

  return (
    <div className="h-full overflow-y-auto lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      <section
        aria-label={scriptCopy.development.panelAria}
        className="border-b border-line lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r"
      >
        <DevelopmentPanel
          project={project}
          sceneCount={sceneCount}
          onSceneCountChange={setSceneCount}
          sceneTotal={scenes.length}
          phase={phase}
          onGenerate={(input) => void generate({ ...input, sceneCount })}
        />
      </section>

      <section
        aria-label={scriptCopy.scenes.paneAria}
        className="lg:min-h-0 lg:overflow-y-auto"
      >
        <div className="flex flex-col gap-4 p-4">
          <header className="flex items-center justify-between gap-3">
            <p className="text-sm text-fg-muted">
              <span className="font-mono text-fg-secondary">
                {scenes.length}
              </span>{" "}
              {scenes.length === 1
                ? scriptCopy.scenes.countOne
                : scriptCopy.scenes.countMany}
            </p>
            <Button variant="ghost" size="sm" onClick={handleAddScene}>
              <Plus size={14} aria-hidden />
              {scriptCopy.scenes.addScene}
            </Button>
          </header>

          {generating ? (
            <SceneListSkeleton count={sceneCount} />
          ) : scenes.length === 0 ? (
            <EmptyState
              icon={FilmSlate}
              title={scriptCopy.scenes.emptyTitle}
              hint={scriptCopy.scenes.emptyHint}
              action={
                <Button variant="outline" size="sm" onClick={handleAddScene}>
                  <Plus size={14} aria-hidden />
                  {scriptCopy.scenes.addScene}
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              {scenes.map((scene, position) => (
                <SceneCard
                  key={scene.id}
                  project={project}
                  scene={scene}
                  sceneNumber={position + 1}
                  projectCharacters={projectCharacters}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

/** Shape-matched placeholders while the provider drafts the script. */
const SceneListSkeleton = ({ count }: { count: number }) => (
  <div className="flex flex-col gap-4" aria-hidden>
    {Array.from({ length: count }, (_, position) => (
      <div
        key={position}
        className="flex flex-col gap-3 border border-line bg-ink-panel p-4"
      >
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-6 w-64" />
      </div>
    ))}
  </div>
);
