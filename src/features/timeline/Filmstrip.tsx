import { useAsset } from "@/stores/assets";
import type { Shot } from "@/domain/types";

import { timelineCopy } from "./copy";
import { formatShortSeconds, slugLine, type CutEntry } from "./cutLogic";

type FilmstripProps = {
  entries: readonly CutEntry[];
  currentIndex: number;
  onSeek: (index: number) => void;
};

/**
 * The cut at a glance: one tile per shot, width proportional to duration,
 * scene boundaries marked by canvas-colored spacers (hard cuts).
 */
export const Filmstrip = ({
  entries,
  currentIndex,
  onSeek,
}: FilmstripProps) => (
  <div
    role="group"
    aria-label={timelineCopy.filmstrip.label}
    className="mt-4 flex items-stretch gap-px overflow-x-auto bg-line p-px"
  >
    {entries.map((entry, index) => {
      const spacer =
        entry.sceneStart && index > 0 ? (
          <div
            key={`${entry.shot.id}-cut`}
            aria-hidden
            title={entry.scene ? slugLine(entry.scene) : undefined}
            className="w-2 shrink-0 bg-ink-canvas"
          />
        ) : null;
      return [
        spacer,
        <FilmstripTile
          key={entry.shot.id}
          shot={entry.shot}
          seconds={entry.seconds}
          number={index + 1}
          current={index === currentIndex}
          onSeek={() => onSeek(index)}
        />,
      ];
    })}
  </div>
);

type FilmstripTileProps = {
  shot: Shot;
  seconds: number;
  number: number;
  current: boolean;
  onSeek: () => void;
};

const FilmstripTile = ({
  shot,
  seconds,
  number,
  current,
  onSeek,
}: FilmstripTileProps) => {
  const frame = useAsset(shot.frameAssetId);
  const width = Math.max(56, Math.round(seconds * 24));

  return (
    <button
      type="button"
      onClick={onSeek}
      aria-label={timelineCopy.filmstrip.goToShot(number)}
      aria-current={current ? "true" : undefined}
      style={{
        width: `${width}px`,
        backgroundImage: frame ? `url(${frame.url})` : undefined,
      }}
      className={`relative h-16 shrink-0 bg-ink-raised bg-cover bg-center transition-colors duration-150 ${
        current ? "ring-1 ring-accent-media" : ""
      }`}
    >
      <span className="absolute inset-x-0 bottom-0 truncate bg-ink-canvas/70 px-1 py-0.5 text-left font-mono text-[10px] text-fg-secondary">
        #{number} {formatShortSeconds(seconds)}
      </span>
    </button>
  );
};
