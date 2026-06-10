import { Plus } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui";
import type { Character, Project, Scene } from "@/domain/types";
import type { ShotId } from "@/lib/id";
import { formatSeconds } from "@/lib/time";
import { useAssetsStore } from "@/stores/assets";
import {
  selectCharactersForProject,
  selectShotsForScene,
  useProjectsStore,
} from "@/stores/projects";
import { useTasksStore } from "@/stores/tasks";

import {
  buildFrameTask,
  findActiveFrameTask,
  lightingForTime,
  slugLine,
} from "./boardLogic";
import { storyboardCopy } from "./copy";
import { ShotCard } from "./ShotCard";

type SceneSectionProps = {
  project: Project;
  scene: Scene;
  /** 1-based position of the scene in the script order. */
  sceneNumber: number;
  /** 1-based shot numbers across the whole project. */
  globalNumbers: ReadonlyMap<ShotId, number>;
};

export const SceneSection = ({
  project,
  scene,
  sceneNumber,
  globalNumbers,
}: SceneSectionProps) => {
  const navigate = useNavigate();
  const shots = useProjectsStore((state) => state.shots);
  const characters = useProjectsStore((state) => state.characters);
  const addShot = useProjectsStore((state) => state.addShot);
  const updateShot = useProjectsStore((state) => state.updateShot);
  const tasks = useTasksStore((state) => state.tasks);

  const sceneShots = useMemo(
    () => selectShotsForScene(shots, scene.id),
    [shots, scene.id],
  );
  const projectCharacters = useMemo(
    () => selectCharactersForProject(characters, project.id),
    [characters, project.id],
  );
  const sceneCharacters = useMemo(
    () =>
      scene.characterIds
        .map((id) => characters[id])
        .filter((character): character is Character => character !== undefined),
    [characters, scene.characterIds],
  );

  const totalDuration = sceneShots.reduce(
    (sum, shot) => sum + shot.durationSeconds,
    0,
  );
  const pendingShots = useMemo(
    () =>
      sceneShots.filter(
        (shot) =>
          shot.frameAssetId === null &&
          findActiveFrameTask(tasks, shot.id) === null,
      ),
    [sceneShots, tasks],
  );

  const handleGenerateAll = () => {
    const assets = useAssetsStore.getState().assets;
    const enqueueImage = useTasksStore.getState().enqueueImage;
    sceneShots.forEach((shot, position) => {
      if (shot.frameAssetId !== null) return;
      if (findActiveFrameTask(tasks, shot.id) !== null) return;
      enqueueImage(
        buildFrameTask({
          project,
          scene,
          shot,
          characters: projectCharacters,
          assets,
          sceneNumber,
          shotNumber: position + 1,
        }),
      );
    });
  };

  const handleAddShot = () => {
    const last = sceneShots[sceneShots.length - 1];
    addShot({
      sceneId: scene.id,
      projectId: project.id,
      index: last ? last.index + 1 : 0,
      description: "",
      dialogue: null,
      size: "medium",
      angle: "eye-level",
      movement: "static",
      lens: "35mm",
      lighting: lightingForTime(scene.timeOfDay),
      durationSeconds: 5,
      characterIds: [...scene.characterIds],
    });
  };

  const moveShot = (position: number, direction: -1 | 1) => {
    const current = sceneShots[position];
    const neighbor = sceneShots[position + direction];
    if (!current || !neighbor) return;
    updateShot(current.id, { index: neighbor.index });
    updateShot(neighbor.id, { index: current.index });
  };

  return (
    <section aria-label={slugLine(scene)} className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h2 className="font-mono text-sm text-fg">
            <span className="text-fg-muted">{sceneNumber}.</span>{" "}
            {slugLine(scene)}
          </h2>
          {scene.summary.trim().length > 0 ? (
            <p className="max-w-2xl text-[13px] leading-snug text-fg-secondary">
              {scene.summary}
            </p>
          ) : null}
          {sceneCharacters.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {sceneCharacters.map((character) => (
                <span
                  key={character.id}
                  className="inline-flex h-6 items-center border border-line px-2 text-xs text-fg-muted"
                >
                  {character.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            aria-label={storyboardCopy.scene.runtimeLabel}
            className="font-mono text-xs text-fg-muted"
          >
            {formatSeconds(totalDuration)}
          </span>
          {sceneShots.length > 0 && pendingShots.length === 0 ? (
            <span className="text-xs text-fg-muted">
              {storyboardCopy.scene.framesReady}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={pendingShots.length === 0}
            onClick={handleGenerateAll}
          >
            {storyboardCopy.scene.generateAll}
          </Button>
        </div>
      </header>

      {sceneShots.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 border border-dashed border-line px-4 py-3">
          <p className="text-[13px] text-fg-muted">
            {storyboardCopy.scene.noShots}
          </p>
          <Button size="sm" onClick={() => navigate("../script")}>
            {storyboardCopy.scene.breakIntoShots}
          </Button>
          <Button size="sm" onClick={handleAddShot}>
            {storyboardCopy.shot.add}
          </Button>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {sceneShots.map((shot, position) => (
            <ShotCard
              key={shot.id}
              project={project}
              scene={scene}
              shot={shot}
              globalNumber={globalNumbers.get(shot.id) ?? position + 1}
              sceneNumber={sceneNumber}
              shotNumber={position + 1}
              projectCharacters={projectCharacters}
              sceneCharacters={sceneCharacters}
              canMoveLeft={position > 0}
              canMoveRight={position < sceneShots.length - 1}
              onMoveLeft={() => moveShot(position, -1)}
              onMoveRight={() => moveShot(position, 1)}
            />
          ))}
          <button
            type="button"
            onClick={handleAddShot}
            className="flex w-64 shrink-0 flex-col items-center justify-center gap-2 border border-dashed border-line-strong py-10 text-fg-muted transition-colors duration-150 hover:bg-ink-hover hover:text-fg-secondary"
          >
            <Plus size={18} aria-hidden />
            <span className="text-[13px]">{storyboardCopy.shot.add}</span>
          </button>
        </div>
      )}
    </section>
  );
};
