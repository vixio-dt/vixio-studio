import { Aperture } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";

import { EmptyState, MediaFrame, Skeleton } from "@/components/ui";
import { formatRelativeTime } from "@/lib/time";
import { useAsset, useAssetsStore } from "@/stores/assets";
import {
  selectCharactersForProject,
  selectScenesForProject,
  selectShotsForProject,
  useProjectsStore,
} from "@/stores/projects";
import { useTasksStore } from "@/stores/tasks";

import { useActiveProject } from "../shared/useActiveProject";
import { useShotSelection } from "../shared/useShotSelection";
import { frameLabCopy } from "./copy";
import {
  activeFrameTasks,
  charactersForScene,
  latestFrameFailure,
} from "./frameLogic";
import { HistoryRail } from "./HistoryRail";
import { PromptConsole } from "./PromptConsole";
import { ShotRail } from "./ShotRail";

/**
 * The frame lab: one shot at a time, full control over the image prompt.
 * Shot picker on the left, stage and console in the middle, take history on
 * the right (under the stage below lg).
 */
export const FrameLabPage = () => {
  const project = useActiveProject();
  const scenes = useProjectsStore((state) => state.scenes);
  const shots = useProjectsStore((state) => state.shots);
  const characters = useProjectsStore((state) => state.characters);
  const tasks = useTasksStore((state) => state.tasks);
  const assetsHydrated = useAssetsStore((state) => state.hydrated);
  const { selectedShotId, selectShot } = useShotSelection();

  const sceneList = useMemo(
    () => (project ? selectScenesForProject(scenes, project.id) : []),
    [scenes, project],
  );
  const orderedShots = useMemo(
    () => (project ? selectShotsForProject(shots, scenes, project.id) : []),
    [shots, scenes, project],
  );
  const projectCharacters = useMemo(
    () => (project ? selectCharactersForProject(characters, project.id) : []),
    [characters, project],
  );

  const selectedShot = useMemo(
    () => orderedShots.find((shot) => shot.id === selectedShotId) ?? null,
    [orderedShots, selectedShotId],
  );

  // Default-select the first shot when the param is empty or stale.
  useEffect(() => {
    if (selectedShot) return;
    const first = orderedShots[0];
    if (first) selectShot(first.id);
  }, [selectedShot, orderedShots, selectShot]);

  const scene = selectedShot ? (scenes[selectedShot.sceneId] ?? null) : null;
  const sceneCharacters = useMemo(
    () => (scene ? charactersForScene(scene, projectCharacters) : []),
    [scene, projectCharacters],
  );
  const pendingTaskIds = useMemo(
    () =>
      selectedShot
        ? activeFrameTasks(tasks, selectedShot.id).map((task) => task.id)
        : [],
    [tasks, selectedShot],
  );
  const failure = useMemo(
    () => (selectedShot ? latestFrameFailure(tasks, selectedShot.id) : null),
    [tasks, selectedShot],
  );
  const frameAsset = useAsset(selectedShot?.frameAssetId ?? null);

  if (!project) return null;

  if (orderedShots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center overflow-y-auto">
        <EmptyState
          icon={Aperture}
          title={frameLabCopy.empty.title}
          hint={frameLabCopy.empty.hint}
          action={
            <Link
              to="../script"
              className="inline-flex h-8 items-center border border-line-strong px-3 text-[13px] text-fg transition-colors duration-150 hover:bg-ink-hover"
            >
              {frameLabCopy.empty.action}
            </Link>
          }
        />
      </div>
    );
  }

  const generating = pendingTaskIds.length > 0;
  const waitingOnHydration =
    selectedShot !== null &&
    selectedShot.frameAssetId !== null &&
    !assetsHydrated &&
    !frameAsset;
  const globalNumber = selectedShot
    ? orderedShots.findIndex((shot) => shot.id === selectedShot.id) + 1
    : 0;

  return (
    <div className="grid h-full grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)_112px]">
      <ShotRail
        project={project}
        scenes={sceneList}
        shots={shots}
        selectedShotId={selectedShot?.id ?? null}
        onSelect={selectShot}
      />

      <section className="flex min-w-0 flex-col gap-4 overflow-y-auto p-4">
        {selectedShot && scene ? (
          <>
            <MediaFrame
              aspectRatio={project.aspectRatio}
              live={generating}
              className="mx-auto w-full max-w-[860px]"
            >
              {frameAsset ? (
                <img
                  src={frameAsset.url}
                  alt={frameLabCopy.stage.frameAlt(globalNumber)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
              {generating || waitingOnHydration ? (
                <Skeleton
                  className={`absolute inset-0 ${frameAsset ? "opacity-75" : ""}`}
                />
              ) : null}
              {!frameAsset && !generating && !waitingOnHydration ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <Aperture size={26} className="text-fg-muted" aria-hidden />
                  <p className="text-sm text-fg-secondary">
                    {frameLabCopy.stage.noFrame}
                  </p>
                </div>
              ) : null}
            </MediaFrame>

            {frameAsset ? (
              <p className="mx-auto flex w-full max-w-[860px] flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-muted">
                <span>{frameLabCopy.stage.seed(frameAsset.seed)}</span>
                <span>{frameAsset.model}</span>
                <span>{formatRelativeTime(frameAsset.createdAt)}</span>
              </p>
            ) : null}

            <HistoryRail
              layout="strip"
              project={project}
              shot={selectedShot}
              pendingTaskIds={pendingTaskIds}
            />

            <PromptConsole
              key={selectedShot.id}
              project={project}
              scene={scene}
              shot={selectedShot}
              projectCharacters={projectCharacters}
              sceneCharacters={sceneCharacters}
              globalNumber={globalNumber}
              busy={generating}
              failure={failure}
            />
          </>
        ) : null}
      </section>

      {selectedShot ? (
        <HistoryRail
          layout="rail"
          project={project}
          shot={selectedShot}
          pendingTaskIds={pendingTaskIds}
        />
      ) : (
        <div className="hidden border-l border-line lg:block" aria-hidden />
      )}
    </div>
  );
};
