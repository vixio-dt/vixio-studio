import { FilmSlate } from "@phosphor-icons/react";
import { useRef } from "react";

import { Button, MediaFrame, Skeleton } from "@/components/ui";
import type { Shot } from "@/domain/types";
import { useAsset, useAssetsStore } from "@/stores/assets";

import { previzCopy } from "./copy";
import { isCapturing, type CaptureStatus } from "./previzLogic";

type CapturePanelProps = {
  shot: Shot;
  /** 1-based project-wide shot number for labels. */
  shotNumber: number;
  status: CaptureStatus;
  canCapture: boolean;
  onCapture: () => void;
};

const statusText = (status: CaptureStatus): string => {
  const copy = previzCopy.capture;
  switch (status.state) {
    case "idle":
      return copy.statusIdle;
    case "rendering":
      return status.pass === "clay"
        ? copy.statusClay(Math.round(status.fraction * 100))
        : copy.statusDepth(Math.round(status.fraction * 100));
    case "saving":
      return copy.statusSaving;
    case "failed":
      return copy.statusFailed(status.message);
    case "done":
      return copy.statusDone(status.codec);
  }
};

/**
 * The capture surface: renders the clay pass into a MediaFrame with a live
 * edge while the two offscreen passes run, then replays the saved clip and
 * offers the depth pass as a download.
 */
export const CapturePanel = ({
  shot,
  shotNumber,
  status,
  canCapture,
  onCapture,
}: CapturePanelProps) => {
  const copy = previzCopy.capture;
  const videoRef = useRef<HTMLVideoElement>(null);
  const clip = useAsset(shot.previzAssetId ?? null);
  const assetsHydrated = useAssetsStore((state) => state.hydrated);

  const busy = isCapturing(status);
  const waitingOnHydration =
    shot.previzAssetId !== undefined && !assetsHydrated && !clip;

  return (
    <section className="flex flex-col gap-2">
      <p className="text-[13px] font-medium text-fg-secondary">{copy.title}</p>

      <MediaFrame aspectRatio="16:9" live={busy}>
        {clip && clip.url.length > 0 && !busy ? (
          <video
            ref={videoRef}
            src={clip.url}
            controls
            loop
            playsInline
            aria-label={copy.clipAlt(shotNumber)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        {busy || waitingOnHydration ? (
          <Skeleton className="absolute inset-0" />
        ) : null}
        {!clip && !busy && !waitingOnHydration ? (
          status.state === "failed" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-xs text-danger">{statusText(status)}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={onCapture}
                disabled={!canCapture}
              >
                {copy.retry}
              </Button>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
              <FilmSlate size={20} className="text-fg-muted" aria-hidden />
              <p className="text-xs text-fg-secondary">{copy.idleHint}</p>
            </div>
          )
        ) : null}
      </MediaFrame>

      <p
        data-testid="previz-status"
        className={`font-mono text-[11px] ${
          status.state === "failed" ? "text-danger" : "text-fg-muted"
        }`}
      >
        {statusText(status)}
      </p>

      {clip ? (
        <p className="font-mono text-[11px] text-fg-muted">
          {copy.meta(clip.duration ?? 0)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          data-testid="previz-capture"
          busy={busy}
          disabled={!canCapture || busy}
          onClick={onCapture}
        >
          {clip ? copy.recapture : copy.capture}
        </Button>
        {clip && !busy ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              video.currentTime = 0;
              void video.play();
            }}
          >
            {copy.replay}
          </Button>
        ) : null}
        {status.state === "done" ? (
          <a
            href={status.depthUrl}
            download={`shot-${shotNumber}-depth.webm`}
            className="inline-flex h-8 items-center border border-line-strong px-3 text-[13px] text-fg transition-colors duration-150 hover:bg-ink-hover"
          >
            {copy.downloadDepth}
          </a>
        ) : null}
      </div>
    </section>
  );
};
