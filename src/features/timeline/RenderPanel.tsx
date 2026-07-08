import { FilmSlate } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { Button, MediaFrame, Skeleton } from "@/components/ui";
import type {
  Asset,
  AudioTrack,
  Project,
  Scene,
  Shot,
} from "@/domain/types";
import { createAssetId, type AssetId } from "@/lib/id";
import {
  renderFinalCut,
  type RenderOutput,
} from "@/lib/render/renderFinalCut";
import { nowIso } from "@/lib/time";
import { useAssetsStore } from "@/stores/assets";

import { timelineCopy } from "./copy";
import { slugifyTitle } from "./exporters";

const renderCopy = timelineCopy.render;

type RenderPanelProps = {
  project: Project;
  scenes: readonly Scene[];
  shots: readonly Shot[];
  assets: Record<AssetId, Asset>;
  tracks: readonly AudioTrack[];
};

type PanelState =
  | { phase: "idle" }
  | { phase: "rendering"; frame: number; totalFrames: number }
  | { phase: "failed"; message: string }
  | { phase: "done"; url: string; output: RenderOutput; saved: boolean };

const formatMegabytes = (bytes: number): string =>
  `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * The final render: every shot with burned captions plus the audio mix,
 * encoded in the browser via WebCodecs and muxed with mediabunny. The label
 * reports the real container the runtime could encode (webm or mp4).
 */
export const RenderPanel = ({
  project,
  scenes,
  shots,
  assets,
  tracks,
}: RenderPanelProps) => {
  const [state, setState] = useState<PanelState>({ phase: "idle" });
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  // Revoke the result url when replaced or on unmount; cancel any run.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const releaseUrl = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  const handleRender = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    releaseUrl();
    setState({ phase: "rendering", frame: 0, totalFrames: 1 });

    const result = await renderFinalCut(
      { project, scenes, shots, assets, tracks },
      {
        signal: controller.signal,
        onProgress: ({ frame, totalFrames }) => {
          // Throttle state churn; every frame at 24fps is wasted paint.
          if (frame % 6 === 0 || frame === totalFrames) {
            setState({ phase: "rendering", frame, totalFrames });
          }
        },
      },
    );

    if (!result.ok) {
      if (result.error.code === "generation-cancelled") {
        setState({ phase: "idle" });
      } else {
        setState({ phase: "failed", message: result.error.message });
      }
      return;
    }
    const url = URL.createObjectURL(result.value.blob);
    urlRef.current = url;
    setState({ phase: "done", url, output: result.value, saved: false });
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleDownload = () => {
    if (state.phase !== "done") return;
    const anchor = document.createElement("a");
    anchor.href = state.url;
    anchor.download = `${slugifyTitle(project.title)}-final.${state.output.container}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleSave = async () => {
    if (state.phase !== "done" || state.saved) return;
    setSaving(true);
    const { output } = state;
    await useAssetsStore.getState().saveAsset(
      {
        id: createAssetId(),
        projectId: project.id,
        kind: "video",
        width: output.width,
        height: output.height,
        duration: output.durationSeconds,
        prompt: renderCopy.assetLabel,
        model: `vixio-render (${output.videoCodec})`,
        seed: 0,
        createdAt: nowIso(),
      },
      output.blob,
    );
    setSaving(false);
    setState({ ...state, saved: true });
  };

  const percent =
    state.phase === "rendering" && state.totalFrames > 0
      ? Math.min(100, Math.floor((state.frame / state.totalFrames) * 100))
      : 0;

  return (
    <section className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold tracking-[-0.02em]">
          {renderCopy.title}
        </h2>
        <div className="flex items-center gap-2">
          {state.phase === "rendering" ? (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              {renderCopy.cancel}
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            data-testid="cut-render"
            disabled={state.phase === "rendering"}
            onClick={() => void handleRender()}
          >
            <FilmSlate size={14} aria-hidden />
            {state.phase === "failed" ? renderCopy.retry : renderCopy.start}
          </Button>
        </div>
      </div>

      <p
        data-testid="cut-render-status"
        role={state.phase === "failed" ? "alert" : undefined}
        className={`text-xs ${
          state.phase === "failed" ? "text-danger" : "text-fg-secondary"
        }`}
      >
        {state.phase === "idle" ? (
          renderCopy.hint
        ) : state.phase === "rendering" ? (
          <span className="font-mono">
            {percent}% {renderCopy.frameOf(state.frame, state.totalFrames)}
          </span>
        ) : state.phase === "failed" ? (
          `${renderCopy.failed} ${state.message}`
        ) : (
          <>
            {renderCopy.doneLabel(
              state.output.container,
              Math.min(state.output.width, state.output.height),
            )}{" "}
            <span className="font-mono">
              {formatMegabytes(state.output.blob.size)}
            </span>
          </>
        )}
      </p>

      {state.phase === "rendering" ? (
        <MediaFrame
          aspectRatio={project.aspectRatio}
          live
          className="mx-auto w-full max-w-[640px]"
        >
          <Skeleton className="absolute inset-0" />
        </MediaFrame>
      ) : null}

      {state.phase === "done" ? (
        <div className="flex flex-col gap-2">
          <MediaFrame
            aspectRatio={project.aspectRatio}
            className="mx-auto w-full max-w-[640px]"
          >
            <video
              src={state.url}
              controls
              playsInline
              title={renderCopy.playerTitle}
              className="absolute inset-0 h-full w-full bg-ink-canvas object-contain"
            />
          </MediaFrame>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              data-testid="cut-render-download"
              onClick={handleDownload}
            >
              {renderCopy.download}
            </Button>
            <Button
              variant="outline"
              size="sm"
              busy={saving}
              disabled={state.saved}
              onClick={() => void handleSave()}
            >
              {state.saved ? renderCopy.savedToAssets : renderCopy.saveToAssets}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
};
