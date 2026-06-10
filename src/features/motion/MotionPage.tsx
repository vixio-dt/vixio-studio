import { FilmReel } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { Button, EmptyState } from "@/components/ui";
import { useActiveProject } from "@/features/shared/useActiveProject";
import { useShotSelection } from "@/features/shared/useShotSelection";
import { useAsset, useAssetsStore } from "@/stores/assets";
import {
  selectCharactersForProject,
  selectScenesForProject,
  selectShotsForProject,
  selectShotsForScene,
  useProjectsStore,
} from "@/stores/projects";
import { useTasksStore } from "@/stores/tasks";

import { motionCopy } from "./copy";
import { MotionConsole } from "./MotionConsole";
import { findActiveClipTask, findLatestFailedClipTask } from "./motionLogic";
import { MotionStage } from "./MotionStage";
import { ShotRail, type RailGroup } from "./ShotRail";

/**
 * The motion room: pick a shot on the rail, then turn its start frame into
 * a clip with a camera move, a duration, and an editable video prompt.
 */
export const MotionPage = () => {
  const project = useActiveProject();
  const navigate = useNavigate();
  const scenesById = useProjectsStore((state) => state.scenes);
  const shotsById = useProjectsStore((state) => state.shots);
  const charactersById = useProjectsStore((state) => state.characters);
  const tasks = useTasksStore((state) => state.tasks);
  const hydrated = useAssetsStore((state) => state.hydrated);
  const { selectedShotId, selectShot } = useShotSelection();

  const scenes = useMemo(
    () => (project ? selectScenesForProject(scenesById, project.id) : []),
    [scenesById, project],
  );
  const shots = useMemo(
    () =>
      project ? selectShotsForProject(shotsById, scenesById, project.id) : [],
    [shotsById, scenesById, project],
  );
  const characters = useMemo(
    () =>
      project ? selectCharactersForProject(charactersById, project.id) : [],
    [charactersById, project],
  );

  const groups = useMemo(
    (): RailGroup[] =>
      scenes
        .map((scene) => ({
          scene,
          shots: selectShotsForScene(shotsById, scene.id),
        }))
        .filter((group) => group.shots.length > 0),
    [scenes, shotsById],
  );

  const numberByShot = useMemo(
    () => new Map(shots.map((shot, position) => [shot.id, position + 1])),
    [shots],
  );

  // Default selection: the first shot that already has a frame, else the
  // first shot. Runs whenever the current selection stops being valid.
  useEffect(() => {
    if (shots.length === 0) return;
    if (selectedShotId && shots.some((shot) => shot.id === selectedShotId)) {
      return;
    }
    const preferred =
      shots.find((shot) => shot.frameAssetId !== null) ?? shots[0];
    if (preferred) selectShot(preferred.id);
  }, [shots, selectedShotId, selectShot]);

  const selectedShot = useMemo(() => {
    if (selectedShotId) {
      const found = shots.find((shot) => shot.id === selectedShotId);
      if (found) return found;
    }
    return shots.find((shot) => shot.frameAssetId !== null) ?? shots[0] ?? null;
  }, [shots, selectedShotId]);

  const frameAsset = useAsset(selectedShot?.frameAssetId ?? null);
  const videoAsset = useAsset(selectedShot?.videoAssetId ?? null);

  const activeTask = useMemo(
    () => (selectedShot ? findActiveClipTask(tasks, selectedShot.id) : null),
    [tasks, selectedShot],
  );
  const failedTask = useMemo(() => {
    if (!selectedShot || activeTask) return null;
    const failed = findLatestFailedClipTask(tasks, selectedShot.id);
    if (!failed) return null;
    // A success newer than the failure makes the failure row stale.
    if (videoAsset && failed.createdAt <= videoAsset.createdAt) return null;
    return failed;
  }, [tasks, selectedShot, activeTask, videoAsset]);

  // The shell guards missing projects; this covers deletion races only.
  if (!project) return null;

  if (shots.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <EmptyState
          icon={FilmReel}
          title={motionCopy.empty.title}
          hint={motionCopy.empty.hint}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("../storyboard")}
            >
              {motionCopy.empty.action}
            </Button>
          }
        />
      </div>
    );
  }

  if (!selectedShot) return null;
  const scene = scenesById[selectedShot.sceneId];
  const globalNumber = numberByShot.get(selectedShot.id) ?? 0;
  const waitingOnHydration =
    !hydrated &&
    ((selectedShot.videoAssetId !== null && !videoAsset) ||
      (selectedShot.frameAssetId !== null && !frameAsset));

  return (
    /* Below 1024px the rail collapses to a fixed-height strip above the stage. */
    <div className="grid h-full grid-cols-1 grid-rows-[176px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1">
      <ShotRail
        aspectRatio={project.aspectRatio}
        groups={groups}
        numberByShot={numberByShot}
        selectedShotId={selectedShot.id}
        onSelect={selectShot}
      />

      <div className="min-h-0 overflow-y-auto p-4">
        <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4">
          <MotionStage
            project={project}
            shot={selectedShot}
            globalNumber={globalNumber}
            frameAsset={frameAsset}
            videoAsset={videoAsset}
            generating={activeTask !== null}
            waitingOnHydration={waitingOnHydration}
          />
          {scene ? (
            <MotionConsole
              project={project}
              scene={scene}
              shot={selectedShot}
              characters={characters}
              globalNumber={globalNumber}
              frameAsset={frameAsset}
              generating={activeTask !== null}
              failedTask={failedTask}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
