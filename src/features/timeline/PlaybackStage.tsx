import { useEffect, useRef, useState } from "react";

import { MediaFrame, Skeleton } from "@/components/ui";
import type { Project } from "@/domain/types";

import { timelineCopy } from "./copy";
import { slugLine, type CutEntry } from "./cutLogic";

type PlaybackStageProps = {
  project: Project;
  entry: CutEntry;
  /** 1-based position across the whole project. */
  globalNumber: number;
  playing: boolean;
  muted: boolean;
  /** Assets referenced by the shot have not hydrated from IndexedDB yet. */
  waitingOnHydration: boolean;
  onEnded: () => void;
};

/**
 * The cut's stage: rendered clips play as video, frame-only shots get a
 * Ken Burns drift sized to the shot duration, and bare shots show a short
 * slate. Hard cuts everywhere; the playback hook owns all timing.
 */
export const PlaybackStage = ({
  project,
  entry,
  globalNumber,
  playing,
  muted,
  waitingOnHydration,
  onEnded,
}: PlaybackStageProps) => {
  const slate = entry.scene
    ? slugLine(entry.scene)
    : timelineCopy.stage.slateFallback(globalNumber);

  return (
    <MediaFrame
      aspectRatio={project.aspectRatio}
      className="mx-auto w-full max-w-[900px]"
    >
      {waitingOnHydration ? (
        <Skeleton className="absolute inset-0" />
      ) : entry.kind === "video" && entry.videoAsset ? (
        <StageVideo
          key={entry.shot.id}
          src={entry.videoAsset.url}
          playing={playing}
          muted={muted}
          onEnded={onEnded}
        />
      ) : entry.kind === "image" && entry.frameAsset ? (
        <KenBurnsImage
          key={entry.shot.id}
          src={entry.frameAsset.url}
          alt={timelineCopy.stage.frameAlt(globalNumber)}
          durationSeconds={entry.seconds}
          seed={entry.shot.seed}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="px-4 text-center font-mono text-sm text-fg-muted">
            {slate}
          </p>
        </div>
      )}

      {entry.shot.dialogue ? (
        <p className="absolute bottom-4 left-1/2 max-w-[80%] -translate-x-1/2 bg-ink-canvas/70 px-3 py-1 text-center text-sm backdrop-blur-sm">
          {entry.shot.dialogue}
        </p>
      ) : null}
    </MediaFrame>
  );
};

type StageVideoProps = {
  src: string;
  playing: boolean;
  muted: boolean;
  onEnded: () => void;
};

const StageVideo = ({ src, playing, muted, onEnded }: StageVideoProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;
    if (playing) {
      void node.play().catch(() => undefined);
    } else {
      node.pause();
    }
  }, [playing]);

  return (
    <video
      ref={videoRef}
      src={src}
      muted={muted}
      playsInline
      onEnded={onEnded}
      className="absolute inset-0 h-full w-full bg-ink-canvas object-contain"
    />
  );
};

/** Drift directions picked deterministically from the shot seed. */
const KEN_BURNS_DRIFTS = [
  "-1.4%, -1.0%",
  "1.4%, -1.0%",
  "-1.4%, 1.0%",
  "1.4%, 1.0%",
] as const;

type KenBurnsImageProps = {
  src: string;
  alt: string;
  durationSeconds: number;
  seed: number;
};

const KenBurnsImage = ({
  src,
  alt,
  durationSeconds,
  seed,
}: KenBurnsImageProps) => {
  const [active, setActive] = useState(false);

  // Flip one frame after mount so the transition runs from the rest state.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const drift = KEN_BURNS_DRIFTS[Math.abs(seed) % 4] ?? KEN_BURNS_DRIFTS[0];

  return (
    <img
      src={src}
      alt={alt}
      className="absolute inset-0 h-full w-full object-cover will-change-transform"
      style={{
        transform: active
          ? `scale(1.06) translate(${drift})`
          : "scale(1) translate(0%, 0%)",
        transitionProperty: "transform",
        transitionDuration: `${durationSeconds}s`,
        transitionTimingFunction: "linear",
      }}
    />
  );
};
