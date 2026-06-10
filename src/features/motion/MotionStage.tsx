import { Aperture } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";

import { Button, MediaFrame, Skeleton } from "@/components/ui";
import type { Asset, Project, Shot } from "@/domain/types";
import { formatRelativeTime, formatSeconds } from "@/lib/time";

import { motionCopy } from "./copy";

type MotionStageProps = {
  project: Project;
  shot: Shot;
  /** 1-based position across the whole project. */
  globalNumber: number;
  frameAsset: Asset | null;
  videoAsset: Asset | null;
  /** A shot-video task for this shot is queued or running. */
  generating: boolean;
  /** Assets referenced by the shot have not hydrated from IndexedDB yet. */
  waitingOnHydration: boolean;
};

/**
 * The motion stage: the rendered clip when it exists, the start frame as a
 * captioned still while it waits, and a pointer to the frame lab when the
 * shot has nothing to animate yet. Generation shows the live edge plus a
 * shape-matched skeleton overlay.
 */
export const MotionStage = ({
  project,
  shot,
  globalNumber,
  frameAsset,
  videoAsset,
  generating,
  waitingOnHydration,
}: MotionStageProps) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-2">
      <MediaFrame aspectRatio={project.aspectRatio} live={generating}>
        {videoAsset ? (
          <video
            key={videoAsset.id}
            src={videoAsset.url}
            controls
            loop
            playsInline
            className="absolute inset-0 h-full w-full bg-ink-canvas object-contain"
          />
        ) : frameAsset ? (
          <>
            <img
              src={frameAsset.url}
              alt={motionCopy.stage.frameAlt(globalNumber)}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="absolute bottom-2 left-2 bg-ink-canvas/70 px-2 py-0.5 font-mono text-[11px] text-fg-secondary">
              {motionCopy.stage.startFrameCaption}
            </span>
          </>
        ) : waitingOnHydration ? (
          <Skeleton className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <Aperture size={22} className="text-fg-muted" aria-hidden />
            <p className="text-sm font-medium text-fg-secondary">
              {motionCopy.stage.needsFrameTitle}
            </p>
            <p className="max-w-sm text-xs text-fg-muted">
              {motionCopy.stage.needsFrameHint}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`../framelab?shot=${shot.id}`)}
            >
              {motionCopy.stage.openFrameLab}
            </Button>
          </div>
        )}
        {generating ? <Skeleton className="absolute inset-0" /> : null}
      </MediaFrame>

      {videoAsset ? (
        <p className="font-mono text-[11px] text-fg-muted">
          {formatSeconds(videoAsset.duration ?? shot.durationSeconds)}
          {" · "}
          {videoAsset.model}
          {" · "}
          {formatRelativeTime(videoAsset.createdAt)}
        </p>
      ) : null}
    </div>
  );
};
