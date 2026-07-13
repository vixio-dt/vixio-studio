import { Cube } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/ui";
import {
  selectCharactersForProject,
  selectScenesForProject,
  selectShotsForProject,
  useProjectsStore,
} from "@/stores/projects";

import { useActiveProject } from "../shared/useActiveProject";
import { useShotSelection } from "../shared/useShotSelection";
import { previzCopy } from "./copy";
import { PrevizShotRail } from "./PrevizShotRail";
import { ShotWorkspace } from "./ShotWorkspace";

/**
 * The previz stage: shots on the left, the 3d blocking viewport and its
 * controls on the right. The workspace is keyed by shot id so per-shot state
 * (blockout, camera keyframes, capture) initializes fresh on selection.
 */
export const PrevizPage = () => {
  const project = useActiveProject();
  const scenes = useProjectsStore((state) => state.scenes);
  const shots = useProjectsStore((state) => state.shots);
  const characters = useProjectsStore((state) => state.characters);
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
  const shotOrder = useMemo(
    () =>
      new Map(orderedShots.map((shot, position) => [shot.id, position] as const)),
    [orderedShots],
  );

  const selectedShot = useMemo(
    () => orderedShots.find((shot) => shot.id === selectedShotId) ?? null,
    [orderedShots, selectedShotId],
  );
  const cast = useMemo(
    () =>
      selectedShot
        ? projectCharacters.filter((character) =>
            selectedShot.characterIds.includes(character.id),
          )
        : [],
    [selectedShot, projectCharacters],
  );

  // Default-select the first shot when the param is empty or stale.
  useEffect(() => {
    if (selectedShot) return;
    const first = orderedShots[0];
    if (first) selectShot(first.id);
  }, [selectedShot, orderedShots, selectShot]);

  if (!project) return null;

  if (orderedShots.length === 0) {
    return (
      <div
        data-testid="page-previz"
        className="flex h-full items-center justify-center overflow-y-auto"
      >
        <EmptyState
          icon={Cube}
          title={previzCopy.empty.title}
          hint={previzCopy.empty.hint}
          action={
            <Link
              to="../storyboard"
              className="inline-flex h-8 items-center border border-line-strong px-3 text-[13px] text-fg transition-colors duration-150 hover:bg-ink-hover"
            >
              {previzCopy.empty.action}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div
      data-testid="page-previz"
      className="grid h-full grid-cols-[240px_minmax(0,1fr)]"
    >
      <PrevizShotRail
        project={project}
        scenes={sceneList}
        shots={shots}
        shotOrder={shotOrder}
        selectedShotId={selectedShot?.id ?? null}
        onSelect={selectShot}
      />

      <div className="min-w-0 overflow-y-auto">
        {selectedShot ? (
          <ShotWorkspace
            key={selectedShot.id}
            project={project}
            shot={selectedShot}
            cast={cast}
            shotNumber={(shotOrder.get(selectedShot.id) ?? 0) + 1}
          />
        ) : null}
      </div>
    </div>
  );
};
