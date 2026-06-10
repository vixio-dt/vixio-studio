import { FilmReel, Warning } from "@phosphor-icons/react";

import { MediaFrame, Skeleton } from "@/components/ui";
import type { Scene, Shot } from "@/domain/types";
import type { ShotId } from "@/lib/id";
import { useAsset, useAssetsStore } from "@/stores/assets";

import { motionCopy } from "./copy";
import { slugLine } from "./motionLogic";

export type RailGroup = {
  scene: Scene;
  shots: readonly Shot[];
};

type ShotRailProps = {
  aspectRatio: string;
  groups: readonly RailGroup[];
  /** 1-based shot numbers across the whole project. */
  numberByShot: ReadonlyMap<ShotId, number>;
  selectedShotId: ShotId | null;
  onSelect: (id: ShotId) => void;
};

/**
 * Light shot rail for the motion room: every shot in script order, grouped
 * under scene slugs, with a glyph telling the clip status at a glance.
 */
export const ShotRail = ({
  aspectRatio,
  groups,
  numberByShot,
  selectedShotId,
  onSelect,
}: ShotRailProps) => (
  <nav
    aria-label={motionCopy.rail.title}
    className="min-h-0 overflow-y-auto border-b border-line lg:border-b-0 lg:border-r"
  >
    <div className="flex flex-col pb-4">
      {groups.map(({ scene, shots }, groupIndex) => (
        <section key={scene.id}>
          <p className="px-3 pb-1 pt-3 font-mono text-[10px] text-fg-muted">
            {groupIndex + 1}. {slugLine(scene)}
          </p>
          {shots.map((shot) => (
            <RailRow
              key={shot.id}
              shot={shot}
              number={numberByShot.get(shot.id) ?? 0}
              aspectRatio={aspectRatio}
              selected={shot.id === selectedShotId}
              onSelect={onSelect}
            />
          ))}
        </section>
      ))}
    </div>
  </nav>
);

type RailRowProps = {
  shot: Shot;
  number: number;
  aspectRatio: string;
  selected: boolean;
  onSelect: (id: ShotId) => void;
};

const RailRow = ({
  shot,
  number,
  aspectRatio,
  selected,
  onSelect,
}: RailRowProps) => {
  const frame = useAsset(shot.frameAssetId);
  const hydrated = useAssetsStore((state) => state.hydrated);
  const waitingOnHydration =
    shot.frameAssetId !== null && !hydrated && !frame;

  const status = shot.videoAssetId
    ? motionCopy.rail.clipReady
    : shot.frameAssetId
      ? motionCopy.rail.frameReady
      : motionCopy.rail.needsFrame;

  return (
    <button
      type="button"
      onClick={() => onSelect(shot.id)}
      aria-pressed={selected}
      title={status}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-150 ${
        selected ? "bg-ink-raised" : "hover:bg-ink-hover"
      }`}
    >
      <div className="w-14 shrink-0">
        <MediaFrame aspectRatio={aspectRatio}>
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
      </div>
      <span className="shrink-0 font-mono text-[11px] text-fg-muted">
        #{number}
      </span>
      <span
        className={`line-clamp-2 min-w-0 flex-1 text-xs leading-snug ${
          selected ? "text-fg" : "text-fg-secondary"
        } ${shot.description.trim().length === 0 ? "text-fg-muted" : ""}`}
      >
        {shot.description.trim() || motionCopy.rail.noDescription}
      </span>
      <span
        role="img"
        aria-label={status}
        className="flex w-4 shrink-0 items-center justify-center"
      >
        {shot.videoAssetId ? (
          <FilmReel size={14} className="text-accent" aria-hidden />
        ) : shot.frameAssetId ? (
          <span
            aria-hidden
            className="size-2 rounded-full border border-line-strong"
          />
        ) : (
          <Warning size={14} className="text-danger" aria-hidden />
        )}
      </span>
    </button>
  );
};
