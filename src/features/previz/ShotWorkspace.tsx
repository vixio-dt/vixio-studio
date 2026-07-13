import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Segmented } from "@/components/ui";
import { findCameraPreset } from "@/domain/constants";
import type { CameraPresetId, Character, Project, Shot } from "@/domain/types";
import { createAssetId } from "@/lib/id";
import {
  addProp,
  copyBlockingFromSource,
  loadBlockout,
  moveBlock,
  presetIdForShot,
  propBlockKey,
  removeProp,
  resolveBlockout,
  rotateBlock,
  saveBlockout,
  subjectPoint,
  type CameraKeyframe,
  type PropKind,
  type ShotBlockout,
} from "@/lib/previz/blockout";
import {
  dollyKeyframe,
  orbitKeyframe,
  seedCameraTrack,
} from "@/lib/previz/cameraMath";
import {
  CAPTURE_HEIGHT,
  CAPTURE_MAX_SECONDS,
  CAPTURE_WIDTH,
  captureBlockout,
} from "@/lib/previz/capture";
import { nowIso } from "@/lib/time";
import { useAssetsStore } from "@/stores/assets";
import { selectShotsForScene, useProjectsStore } from "@/stores/projects";

import { BlockingPanel } from "./BlockingPanel";
import { CameraPanel } from "./CameraPanel";
import { CapturePanel } from "./CapturePanel";
import { previzCopy } from "./copy";
import {
  formatScrubSeconds,
  isCapturing,
  type CaptureStatus,
  type KeyframeId,
  type StageMode,
} from "./previzLogic";
import { StageViewport } from "./StageViewport";

type ShotWorkspaceProps = {
  project: Project;
  shot: Shot;
  /** Characters attached to the shot, in project order. */
  cast: readonly Character[];
  /** 1-based project-wide shot number for labels. */
  shotNumber: number;
};

/**
 * Everything to the right of the shot rail for ONE shot: the viewport, the
 * blocking and camera panels, and capture. The parent keys this component by
 * shot id, so all per-shot state initializes fresh on selection and the
 * blockout loads exactly once per mount; edits persist through handlers.
 */
export const ShotWorkspace = ({
  project,
  shot,
  cast,
  shotNumber,
}: ShotWorkspaceProps) => {
  const updateShot = useProjectsStore((state) => state.updateShot);
  const shotsById = useProjectsStore((state) => state.shots);

  // The previous shot in the same scene, if it has ever been saved: source
  // for "copy blocking from previous shot" so a fresh shot does not start
  // from a bare stage after the last one was fully dressed.
  const previousShot = useMemo(() => {
    const sceneShots = selectShotsForScene(shotsById, shot.sceneId);
    const position = sceneShots.findIndex((candidate) => candidate.id === shot.id);
    return position > 0 ? (sceneShots[position - 1] ?? null) : null;
  }, [shotsById, shot.sceneId, shot.id]);
  const previousBlockout = useMemo(
    () => (previousShot ? loadBlockout(previousShot.id) : null),
    [previousShot],
  );

  const [blockout, setBlockoutView] = useState<ShotBlockout>(() =>
    resolveBlockout(shot, loadBlockout(shot.id)),
  );
  const blockoutRef = useRef(blockout);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [mode, setMode] = useState<StageMode>("blocking");
  const [activeKey, setActiveKey] = useState<KeyframeId>("a");
  const [scrub, setScrub] = useState(0);
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureStatus>({ state: "idle" });

  const depthUrlRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    // StrictMode runs this cleanup once on mount, so re-arm on setup.
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (depthUrlRef.current) URL.revokeObjectURL(depthUrlRef.current);
    };
  }, []);

  /** All blockout edits flow through here: update state, persist, report. */
  const mutate = useCallback(
    (updater: (current: ShotBlockout) => ShotBlockout) => {
      const next = updater(blockoutRef.current);
      blockoutRef.current = next;
      setBlockoutView(next);
      const result = saveBlockout(shot.id, next);
      setSaveError(result.ok ? null : previzCopy.stage.saveFailed);
    },
    [shot.id],
  );

  /* ---------------------------------------------------------------- */
  /* Blocking handlers                                                 */
  /* ---------------------------------------------------------------- */

  const handleMoveBlock = useCallback(
    (key: string, x: number, z: number) => {
      mutate((current) => moveBlock(current, key, x, z));
    },
    [mutate],
  );

  const handleRotateBlock = (key: string, rotationY: number) => {
    mutate((current) => rotateBlock(current, key, rotationY));
  };

  const handleAddProp = (kind: PropKind) => {
    const added = addProp(blockoutRef.current, kind);
    mutate(() => added.blockout);
    setSelectedBlockKey(propBlockKey(added.propId));
  };

  const handleRemoveProp = (propId: string) => {
    mutate((current) => removeProp(current, propId));
    setSelectedBlockKey((current) =>
      current === propBlockKey(propId) ? null : current,
    );
  };

  const handleCopyFromPrevious = () => {
    if (!previousBlockout) return;
    mutate((current) => copyBlockingFromSource(current, previousBlockout));
  };

  /* ---------------------------------------------------------------- */
  /* Camera handlers                                                   */
  /* ---------------------------------------------------------------- */

  const reseedCamera = (presetId: CameraPresetId) => {
    mutate((current) => ({
      ...current,
      camera: seedCameraTrack(
        presetId,
        subjectPoint(current.mannequins),
        shot.lens,
        shot.size,
      ),
      seededPresetId: presetId,
    }));
  };

  const handleSelectPreset = (presetId: CameraPresetId) => {
    updateShot(shot.id, { cameraPresetId: presetId });
    reseedCamera(presetId);
  };

  const handleSelectKeyframe = (key: KeyframeId) => {
    setActiveKey(key);
    setScrub(key === "a" ? 0 : 1);
  };

  const handleReplaceKeyframe = (key: KeyframeId, keyframe: CameraKeyframe) => {
    mutate((current) => ({
      ...current,
      camera: { ...current.camera, [key]: keyframe },
    }));
  };

  const handleOrbitKeyframe = useCallback(
    (yawDelta: number, pitchDelta: number) => {
      mutate((current) => ({
        ...current,
        camera: {
          ...current.camera,
          [activeKey]: orbitKeyframe(
            current.camera[activeKey],
            yawDelta,
            pitchDelta,
          ),
        },
      }));
    },
    [mutate, activeKey],
  );

  const handleDollyKeyframe = useCallback(
    (factor: number) => {
      mutate((current) => ({
        ...current,
        camera: {
          ...current.camera,
          [activeKey]: dollyKeyframe(current.camera[activeKey], factor),
        },
      }));
    },
    [mutate, activeKey],
  );

  /* ---------------------------------------------------------------- */
  /* Capture                                                           */
  /* ---------------------------------------------------------------- */

  const runCapture = async () => {
    if (isCapturing(capture)) return;
    if (depthUrlRef.current) {
      URL.revokeObjectURL(depthUrlRef.current);
      depthUrlRef.current = null;
    }
    setCapture({ state: "rendering", pass: "clay", fraction: 0 });

    const result = await captureBlockout({
      blockout: blockoutRef.current,
      cast: cast.map((character) => ({
        characterId: character.id,
        name: character.name,
      })),
      durationSeconds: Math.min(shot.durationSeconds, CAPTURE_MAX_SECONDS),
      onProgress: (progress) => {
        if (!aliveRef.current) return;
        setCapture({
          state: "rendering",
          pass: progress.pass,
          fraction: progress.fraction,
        });
      },
    });
    if (!result.ok) {
      if (aliveRef.current) {
        setCapture({ state: "failed", message: result.error.message });
      }
      return;
    }

    if (aliveRef.current) setCapture({ state: "saving" });
    const presetLabel =
      findCameraPreset(presetIdForShot(shot))?.label ?? "Static";
    try {
      const asset = await useAssetsStore.getState().saveAsset(
        {
          id: createAssetId(),
          projectId: project.id,
          kind: "video",
          width: CAPTURE_WIDTH,
          height: CAPTURE_HEIGHT,
          duration: result.value.durationSeconds,
          prompt: previzCopy.capture.assetPrompt(presetLabel),
          model: `previz ${result.value.codec}`,
          seed: shot.seed,
          createdAt: nowIso(),
        },
        result.value.clay,
      );
      useProjectsStore.getState().updateShot(shot.id, { previzAssetId: asset.id });
    } catch {
      if (aliveRef.current) {
        setCapture({ state: "failed", message: previzCopy.capture.saveFailed });
      }
      return;
    }

    if (!aliveRef.current) return;
    const depthUrl = URL.createObjectURL(result.value.depth);
    depthUrlRef.current = depthUrl;
    setCapture({
      state: "done",
      codec: result.value.codec,
      depthUrl,
      // The avc-first encoder emits mp4; the download name must match the
      // container or extension-keyed tools reject the file.
      depthExtension: result.value.depth.type.includes("mp4") ? "mp4" : "webm",
    });
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const scrubTotal = Math.min(shot.durationSeconds, CAPTURE_MAX_SECONDS);

  return (
    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-3">
        <StageViewport
          blockout={blockout}
          cast={cast}
          mode={mode}
          scrub={scrub}
          selectedBlockKey={selectedBlockKey}
          onSelectBlock={setSelectedBlockKey}
          onMoveBlock={handleMoveBlock}
          onOrbitKeyframe={handleOrbitKeyframe}
          onDollyKeyframe={handleDollyKeyframe}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            size="sm"
            ariaLabel={previzCopy.stage.modeLabel}
            options={[
              { value: "blocking", label: previzCopy.stage.modeBlocking },
              { value: "camera", label: previzCopy.stage.modeCamera },
            ]}
            value={mode}
            onChange={setMode}
          />
          <p className="min-w-40 flex-1 text-xs text-fg-muted">
            {mode === "blocking"
              ? previzCopy.stage.blockingHint
              : previzCopy.stage.cameraHint}
          </p>
        </div>

        <label className="flex items-center gap-3">
          <span className="text-[11px] text-fg-muted">
            {previzCopy.stage.scrubLabel}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            data-testid="previz-scrub"
            value={scrub}
            onChange={(event) => setScrub(Number(event.target.value))}
            className="h-6 min-w-0 flex-1 accent-accent-media"
          />
          <span className="font-mono text-[11px] text-fg-secondary">
            {previzCopy.stage.scrubTime(
              formatScrubSeconds(scrub * scrubTotal),
              formatScrubSeconds(scrubTotal),
            )}
          </span>
        </label>

        {saveError ? <p className="text-xs text-danger">{saveError}</p> : null}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        {mode === "blocking" ? (
          <BlockingPanel
            blockout={blockout}
            cast={cast}
            selectedBlockKey={selectedBlockKey}
            onSelectBlock={setSelectedBlockKey}
            onAddProp={handleAddProp}
            onRemoveProp={handleRemoveProp}
            onRotateBlock={handleRotateBlock}
            canCopyFromPrevious={previousBlockout !== null}
            onCopyFromPrevious={handleCopyFromPrevious}
          />
        ) : (
          <CameraPanel
            presetId={presetIdForShot(shot)}
            track={blockout.camera}
            activeKey={activeKey}
            onSelectPreset={handleSelectPreset}
            onReseed={() => reseedCamera(presetIdForShot(shot))}
            onSelectKeyframe={handleSelectKeyframe}
            onReplaceKeyframe={handleReplaceKeyframe}
          />
        )}

        <div className="border-t border-line pt-4">
          <CapturePanel
            shot={shot}
            shotNumber={shotNumber}
            status={capture}
            canCapture={!isCapturing(capture)}
            onCapture={() => void runCapture()}
          />
        </div>
      </div>
    </div>
  );
};
