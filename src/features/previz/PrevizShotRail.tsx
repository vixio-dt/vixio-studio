import { MediaFrame, Skeleton } from "@/components/ui";
import type { Project, Scene, Shot } from "@/domain/types";
import type { ShotId } from "@/lib/id";
import { useAsset, useAssetsStore } from "@/stores/assets";
import { selectShotsForScene } from "@/stores/projects";

import { previzCopy } from "./copy";

const slugLine = (scene: Scene): string => {
  const prefix = scene.setting === "interior" ? "INT." : "EXT.";
  return `${prefix} ${scene.location.toUpperCase()}, ${scene.timeOfDay.toUpperCase()}`;
};

type PrevizShotRailProps = {
  project: Project;
  /** Scenes for the project, already ordered by index. */
  scenes: readonly Scene[];
  shots: Record<ShotId, Shot>;
  /** 0-based project-wide shot order, drives the row testids. */
  shotOrder: ReadonlyMap<ShotId, number>;
  selectedShotId: ShotId | null;
  onSelect: (id: ShotId) => void;
};

/** Left rail: every shot grouped under its scene, mirroring the frame lab. */
export const PrevizShotRail = ({
  project,
  scenes,
  shots,
  shotOrder,
  selectedShotId,
  onSelect,
}: PrevizShotRailProps) => (
  <nav
    aria-label={previzCopy.rail.label}
    className="overflow-y-auto border-r border-line pb-3"
  >
    {scenes.map((scene) => {
      const sceneShots = selectShotsForScene(shots, scene.id);
      return (
        <section key={scene.id}>
          <h2 className="px-3 pb-1 pt-3 font-mono text-[11px] text-fg-muted">
            {slugLine(scene)}
          </h2>
          {sceneShots.length === 0 ? (
            <p className="px-3 py-1 text-xs text-fg-muted">
              {previzCopy.rail.noShots}
            </p>
          ) : (
            sceneShots.map((shot, position) => (
              <ShotRow
                key={shot.id}
                shot={shot}
                aspectRatio={project.aspectRatio}
                position={position + 1}
                orderIndex={shotOrder.get(shot.id) ?? 0}
                selected={shot.id === selectedShotId}
                onSelect={() => onSelect(shot.id)}
              />
            ))
          )}
        </section>
      );
    })}
  </nav>
);

type ShotRowProps = {
  shot: Shot;
  aspectRatio: string;
  /** 1-based position within the scene, for the "#n" readout. */
  position: number;
  /** 0-based project-wide order, for the testid suffix. */
  orderIndex: number;
  selected: boolean;
  onSelect: () => void;
};

const ShotRow = ({
  shot,
  aspectRatio,
  position,
  orderIndex,
  selected,
  onSelect,
}: ShotRowProps) => {
  const frame = useAsset(shot.frameAssetId);
  const hydrated = useAssetsStore((state) => state.hydrated);
  const waitingOnHydration = shot.frameAssetId !== null && !hydrated && !frame;
  const description = shot.description.trim();

  return (
    <button
      type="button"
      data-testid={`previz-shot-item-${orderIndex}`}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full gap-2 border-l-2 p-2 text-left transition-colors duration-150 ${
        selected
          ? "border-accent-media bg-ink-raised"
          : "border-transparent hover:bg-ink-hover"
      }`}
    >
      <MediaFrame aspectRatio={aspectRatio} className="w-14 shrink-0">
        {waitingOnHydration ? (
          <Skeleton className="absolute inset-0" />
        ) : frame ? (
          <img
            src={frame.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
      </MediaFrame>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-[11px] text-fg-secondary">
          #{position}
        </span>
        <span
          className={`line-clamp-1 text-[13px] ${
            description.length > 0 ? "text-fg" : "text-fg-muted"
          }`}
        >
          {description.length > 0 ? description : previzCopy.rail.noDescription}
        </span>
        <span className="font-mono text-[11px] text-fg-muted">
          {shot.durationSeconds}s
        </span>
      </span>
    </button>
  );
};
