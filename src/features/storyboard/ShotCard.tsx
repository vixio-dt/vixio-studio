import {
  Aperture,
  CaretLeft,
  CaretRight,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button, Dialog, MediaFrame, Skeleton } from "@/components/ui";
import { CAMERA_MOVEMENTS, SHOT_SIZES } from "@/domain/constants";
import type { Character, Project, Scene, Shot } from "@/domain/types";
import { useAsset, useAssetsStore } from "@/stores/assets";
import { useProjectsStore } from "@/stores/projects";
import { useTasksStore } from "@/stores/tasks";

import {
  buildFrameTask,
  findActiveFrameTask,
  findLatestFailedFrameTask,
  labelFor,
} from "./boardLogic";
import { storyboardCopy } from "./copy";
import { ShotEditDialog } from "./ShotEditDialog";

type ShotCardProps = {
  project: Project;
  scene: Scene;
  shot: Shot;
  /** 1-based position across the whole project, for the "#n" readout. */
  globalNumber: number;
  /** 1-based numbers used in task labels: "Frame, scene 2 shot 3". */
  sceneNumber: number;
  shotNumber: number;
  projectCharacters: readonly Character[];
  sceneCharacters: readonly Character[];
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
};

const ActionButton = ({
  label,
  onClick,
  disabled = false,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className={`flex size-7 items-center justify-center text-fg-muted transition-colors duration-150 hover:bg-ink-hover disabled:cursor-not-allowed disabled:opacity-40 ${
      danger ? "hover:text-danger" : "hover:text-fg"
    }`}
  >
    {children}
  </button>
);

export const ShotCard = ({
  project,
  scene,
  shot,
  globalNumber,
  sceneNumber,
  shotNumber,
  projectCharacters,
  sceneCharacters,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
}: ShotCardProps) => {
  const navigate = useNavigate();
  const deleteShot = useProjectsStore((state) => state.deleteShot);
  const frameAsset = useAsset(shot.frameAssetId);
  const assetsHydrated = useAssetsStore((state) => state.hydrated);
  const tasks = useTasksStore((state) => state.tasks);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const activeTask = useMemo(
    () => findActiveFrameTask(tasks, shot.id),
    [tasks, shot.id],
  );
  const failedTask = useMemo(
    () =>
      frameAsset || activeTask
        ? null
        : findLatestFailedFrameTask(tasks, shot.id),
    [tasks, shot.id, frameAsset, activeTask],
  );

  const handleRetry = () => {
    const assets = useAssetsStore.getState().assets;
    useTasksStore.getState().enqueueImage(
      buildFrameTask({
        project,
        scene,
        shot,
        characters: projectCharacters,
        assets,
        sceneNumber,
        shotNumber,
      }),
    );
  };

  const handleDelete = () => {
    setDeleteOpen(false);
    deleteShot(shot.id);
  };

  const waitingOnHydration =
    shot.frameAssetId !== null && !assetsHydrated && !frameAsset;

  return (
    <article className="flex w-64 shrink-0 flex-col border border-line bg-ink-panel">
      <MediaFrame aspectRatio={project.aspectRatio} live={activeTask !== null}>
        {activeTask || waitingOnHydration ? (
          <Skeleton className="absolute inset-0" />
        ) : frameAsset ? (
          <img
            src={frameAsset.url}
            alt={storyboardCopy.shot.frameAlt(globalNumber)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : failedTask ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
            <p className="text-xs text-danger">{storyboardCopy.shot.failed}</p>
            <Button size="sm" variant="outline" onClick={handleRetry}>
              {storyboardCopy.shot.retry}
            </Button>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Aperture size={22} className="text-fg-muted" aria-hidden />
          </div>
        )}
      </MediaFrame>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-xs text-fg-secondary">
          <span className="font-mono">#{globalNumber}</span>{" "}
          {labelFor(SHOT_SIZES, shot.size)} ·{" "}
          {labelFor(CAMERA_MOVEMENTS, shot.movement)}
        </p>

        {shot.description.trim().length > 0 ? (
          <p className="line-clamp-2 min-h-9 text-[13px] leading-snug text-fg">
            {shot.description}
          </p>
        ) : (
          <p className="min-h-9 text-[13px] leading-snug text-fg-muted">
            {storyboardCopy.shot.noDescription}
          </p>
        )}

        {shot.dialogue ? (
          <p className="line-clamp-1 text-xs italic text-fg-muted">
            {`"${shot.dialogue}"`}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between border-t border-line pt-2">
          <span className="font-mono text-xs text-fg-secondary">
            {shot.durationSeconds}s
          </span>
          <div className="flex items-center">
            <ActionButton
              label={storyboardCopy.shot.edit}
              onClick={() => setEditOpen(true)}
            >
              <PencilSimple size={14} aria-hidden />
            </ActionButton>
            <ActionButton
              label={storyboardCopy.shot.openFrameLab}
              onClick={() => navigate(`../framelab?shot=${shot.id}`)}
            >
              <Aperture size={14} aria-hidden />
            </ActionButton>
            <ActionButton
              label={storyboardCopy.shot.moveLeft}
              onClick={onMoveLeft}
              disabled={!canMoveLeft}
            >
              <CaretLeft size={14} aria-hidden />
            </ActionButton>
            <ActionButton
              label={storyboardCopy.shot.moveRight}
              onClick={onMoveRight}
              disabled={!canMoveRight}
            >
              <CaretRight size={14} aria-hidden />
            </ActionButton>
            <ActionButton
              label={storyboardCopy.shot.delete}
              onClick={() => setDeleteOpen(true)}
              danger
            >
              <Trash size={14} aria-hidden />
            </ActionButton>
          </div>
        </div>
      </div>

      {editOpen ? (
        <ShotEditDialog
          shot={shot}
          sceneCharacters={sceneCharacters}
          onClose={() => setEditOpen(false)}
        />
      ) : null}

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={storyboardCopy.deleteDialog.title}
      >
        <p className="text-sm text-fg-secondary">
          {storyboardCopy.deleteDialog.body(globalNumber)}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" onClick={() => setDeleteOpen(false)}>
            {storyboardCopy.deleteDialog.cancel}
          </Button>
          <Button size="sm" variant="danger" onClick={handleDelete}>
            {storyboardCopy.deleteDialog.confirm}
          </Button>
        </div>
      </Dialog>
    </article>
  );
};
