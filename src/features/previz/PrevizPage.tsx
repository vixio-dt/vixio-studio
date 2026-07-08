import { Cube } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, Segmented } from "@/components/ui";
import { findCameraPreset } from "@/domain/constants";
import type { CameraPresetId } from "@/domain/types";
import { createAssetId, type ShotId } from "@/lib/id";
import {
  addProp,
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
import {
  selectCharactersForProject,
  selectScenesForProject,
  selectShotsForProject,
  useProjectsStore,
} from "@/stores/projects";

import { useActiveProject } from "../shared/useActiveProject";
import { useShotSelection } from "../shared/useShotSelection";
import { BlockingPanel } from "./BlockingPanel";
import { CameraPanel } from "./CameraPanel";
import { CapturePanel } from "./CapturePanel";
import { previzCopy } from "./copy";
import { PrevizShotRail } from "./PrevizShotRail";
import {
  formatScrubSeconds,
  isCapturing,
  type CaptureStatus,
  type KeyframeId,
  type StageMode,
} from "./previzLogic";
import { StageViewport } from "./StageViewport";

/**
 * The previz stage: shots on the left, the 3d blocking viewport in the
 * middle, and the set dressing, camera, and capture controls on the right
 * (stacked under the viewport below lg). Blockouts persist to localStorage;
 * captures land in the asset library and attach to the shot.
 */
export const PrevizPage = () => {
  const project = useActiveProject();
  const scenes = useProjectsStore((state) => state.scenes);
  const shots = useProjectsStore((state) => state.shots);
  const characters = useProjectsStore((state) => state.characters);
  const updateShot = useProjectsStore((state) => state.updateShot);
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

  /* ---------------------------------------------------------------- */
  /* Blockout state (localStorage-backed)                              */
  /* ---------------------------------------------------------------- */

  const [blockoutState, setBlockoutState] = useState<{
    shotId: ShotId;
    blockout: ShotBlockout;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedShot) {
      setBlockoutState(null);
      return;
    }
    const stored = loadBlockout(selectedShot.id);
    const resolved = resolveBlockout(selectedShot, stored);
    setBlockoutState({ shotId: selectedShot.id, blockout: resolved });
  }, [selectedShot]);

  useEffect(() => {
    if (!blockoutState) return;
    const result = saveBlockout(blockoutState.shotId, blockoutState.blockout);
    setSaveError(result.ok ? null : previzCopy.stage.saveFailed);
  }, [blockoutState]);

  const mutateBlockout = useCallback(
    (updater: (blockout: ShotBlockout) => ShotBlockout) => {
      setBlockoutState((current) =>
        current
          ? { shotId: current.shotId, blockout: updater(current.blockout) }
          : current,
      );
    },
    [],
  );

  const blockout =
    blockoutState && selectedShot && blockoutState.shotId === selectedShot.id
      ? blockoutState.blockout
      : null;

  /* ---------------------------------------------------------------- */
  /* Viewport interaction state                                        */
  /* ---------------------------------------------------------------- */

  const [mode, setMode] = useState<StageMode>("blocking");
  const [activeKey, setActiveKey] = useState<KeyframeId>("a");
  const [scrub, setScrub] = useState(0);
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureStatus>({ state: "idle" });

  const depthUrlRef = useRef<string | null>(null);
  const revokeDepth = useCallback(() => {
    if (depthUrlRef.current) {
      URL.revokeObjectURL(depthUrlRef.current);
      depthUrlRef.current = null;
    }
  }, []);
  useEffect(() => () => revokeDepth(), [revokeDepth]);

  const selectedShotIdRef = useRef<ShotId | null>(null);
  selectedShotIdRef.current = selectedShot?.id ?? null;

  // Reset per-shot UI state when the selection moves to another shot.
  const activeShotKey = selectedShot?.id ?? null;
  useEffect(() => {
    setSelectedBlockKey(null);
    setScrub(0);
    setActiveKey("a");
    setCapture({ state: "idle" });
    revokeDepth();
  }, [activeShotKey, revokeDepth]);

  /* ---------------------------------------------------------------- */
  /* Handlers                                                          */
  /* ---------------------------------------------------------------- */

  const handleMoveBlock = useCallback(
    (key: string, x: number, z: number) => {
      mutateBlockout((current) => moveBlock(current, key, x, z));
    },
    [mutateBlockout],
  );

  const handleRotateBlock = (key: string, rotationY: number) => {
    mutateBlockout((current) => rotateBlock(current, key, rotationY));
  };

  const handleAddProp = (kind: PropKind) => {
    if (!blockoutState) return;
    const added = addProp(blockoutState.blockout, kind);
    setBlockoutState({ shotId: blockoutState.shotId, blockout: added.blockout });
    setSelectedBlockKey(propBlockKey(added.propId));
  };

  const handleRemoveProp = (propId: string) => {
    mutateBlockout((current) => removeProp(current, propId));
    setSelectedBlockKey((current) =>
      current === propBlockKey(propId) ? null : current,
    );
  };

  const handleSelectPreset = (presetId: CameraPresetId) => {
    if (!selectedShot) return;
    updateShot(selectedShot.id, { cameraPresetId: presetId });
  };

  const handleReseed = () => {
    if (!selectedShot) return;
    const presetId = presetIdForShot(selectedShot);
    mutateBlockout((current) => ({
      ...current,
      camera: seedCameraTrack(presetId, subjectPoint(current.mannequins)),
      seededPresetId: presetId,
    }));
  };

  const handleSelectKeyframe = (key: KeyframeId) => {
    setActiveKey(key);
    setScrub(key === "a" ? 0 : 1);
  };

  const handleReplaceKeyframe = (key: KeyframeId, keyframe: CameraKeyframe) => {
    mutateBlockout((current) => ({
      ...current,
      camera: { ...current.camera, [key]: keyframe },
    }));
  };

  const handleOrbitKeyframe = useCallback(
    (yawDelta: number, pitchDelta: number) => {
      mutateBlockout((current) => ({
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
    [mutateBlockout, activeKey],
  );

  const handleDollyKeyframe = useCallback(
    (factor: number) => {
      mutateBlockout((current) => ({
        ...current,
        camera: {
          ...current.camera,
          [activeKey]: dollyKeyframe(current.camera[activeKey], factor),
        },
      }));
    },
    [mutateBlockout, activeKey],
  );

  /* ---------------------------------------------------------------- */
  /* Capture                                                           */
  /* ---------------------------------------------------------------- */

  const applyCaptureStatus = (shotId: ShotId, status: CaptureStatus) => {
    if (selectedShotIdRef.current === shotId) setCapture(status);
  };

  const runCapture = async () => {
    if (!project || !selectedShot || !blockout) return;
    if (isCapturing(capture)) return;
    const shot = selectedShot;
    const capturedBlockout = blockout;
    const castMembers = cast.map((character) => ({
      characterId: character.id,
      name: character.name,
    }));
    revokeDepth();
    setCapture({ state: "rendering", pass: "clay", fraction: 0 });

    const result = await captureBlockout({
      blockout: capturedBlockout,
      cast: castMembers,
      durationSeconds: Math.min(shot.durationSeconds, CAPTURE_MAX_SECONDS),
      onProgress: (progress) =>
        applyCaptureStatus(shot.id, {
          state: "rendering",
          pass: progress.pass,
          fraction: progress.fraction,
        }),
    });
    if (!result.ok) {
      applyCaptureStatus(shot.id, {
        state: "failed",
        message: result.error.message,
      });
      return;
    }

    applyCaptureStatus(shot.id, { state: "saving" });
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
      applyCaptureStatus(shot.id, {
        state: "failed",
        message: previzCopy.capture.saveFailed,
      });
      return;
    }

    if (selectedShotIdRef.current === shot.id) {
      const depthUrl = URL.createObjectURL(result.value.depth);
      depthUrlRef.current = depthUrl;
      setCapture({ state: "done", codec: result.value.codec, depthUrl });
    }
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

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

  const shotNumber = selectedShot
    ? (shotOrder.get(selectedShot.id) ?? 0) + 1
    : 0;
  const scrubTotal = selectedShot
    ? Math.min(selectedShot.durationSeconds, CAPTURE_MAX_SECONDS)
    : 0;

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

              {saveError ? (
                <p className="text-xs text-danger">{saveError}</p>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              {blockout ? (
                mode === "blocking" ? (
                  <BlockingPanel
                    blockout={blockout}
                    cast={cast}
                    selectedBlockKey={selectedBlockKey}
                    onSelectBlock={setSelectedBlockKey}
                    onAddProp={handleAddProp}
                    onRemoveProp={handleRemoveProp}
                    onRotateBlock={handleRotateBlock}
                  />
                ) : (
                  <CameraPanel
                    presetId={presetIdForShot(selectedShot)}
                    track={blockout.camera}
                    activeKey={activeKey}
                    onSelectPreset={handleSelectPreset}
                    onReseed={handleReseed}
                    onSelectKeyframe={handleSelectKeyframe}
                    onReplaceKeyframe={handleReplaceKeyframe}
                  />
                )
              ) : null}

              <div className="border-t border-line pt-4">
                <CapturePanel
                  shot={selectedShot}
                  shotNumber={shotNumber}
                  status={capture}
                  canCapture={blockout !== null && !isCapturing(capture)}
                  onCapture={() => void runCapture()}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
