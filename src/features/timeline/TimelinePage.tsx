import {
  FilmStrip,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SpeakerSimpleHigh,
  SpeakerSimpleX,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button, EmptyState } from "@/components/ui";
import { useActiveProject } from "@/features/shared/useActiveProject";
import { formatSeconds } from "@/lib/time";
import { useAssetsStore } from "@/stores/assets";
import {
  selectAudioTracksForProject,
  selectCharactersForProject,
  selectScenesForProject,
  selectShotsForProject,
  selectShotsForScene,
  useProjectsStore,
} from "@/stores/projects";

import { AudioLanes } from "./AudioLanes";
import { timelineCopy } from "./copy";
import {
  buildCutEntries,
  elapsedSeconds,
  playbackOffsets,
  playbackTotalSeconds,
  totalSeconds,
} from "./cutLogic";
import {
  exportContactSheet,
  exportCutData,
  type SceneGroup,
} from "./exporters";
import { Filmstrip } from "./Filmstrip";
import { PlaybackStage } from "./PlaybackStage";
import { RenderPanel } from "./RenderPanel";
import { usePlayback, type PlaybackMix } from "./usePlayback";

/**
 * The cut: every shot in global script order, hard cuts at scene bounds.
 * Rendered clips play as video, frame-only shots get a Ken Burns drift,
 * bare shots show a slate. Exports a contact sheet PNG and a cut JSON.
 */
export const TimelinePage = () => {
  const project = useActiveProject();
  const navigate = useNavigate();
  const scenesById = useProjectsStore((state) => state.scenes);
  const shotsById = useProjectsStore((state) => state.shots);
  const charactersById = useProjectsStore((state) => state.characters);
  const audioTracksById = useProjectsStore((state) => state.audioTracks);
  const assets = useAssetsStore((state) => state.assets);
  const hydrated = useAssetsStore((state) => state.hydrated);

  const scenes = useMemo(
    () => (project ? selectScenesForProject(scenesById, project.id) : []),
    [scenesById, project],
  );
  const shots = useMemo(
    () =>
      project ? selectShotsForProject(shotsById, scenesById, project.id) : [],
    [shotsById, scenesById, project],
  );
  const characters = useMemo(
    () =>
      project ? selectCharactersForProject(charactersById, project.id) : [],
    [charactersById, project],
  );
  const groups = useMemo(
    (): SceneGroup[] =>
      scenes
        .map((scene) => ({
          scene,
          shots: selectShotsForScene(shotsById, scene.id),
        }))
        .filter((group) => group.shots.length > 0),
    [scenes, shotsById],
  );

  const tracks = useMemo(
    () =>
      project ? selectAudioTracksForProject(audioTracksById, project.id) : [],
    [audioTracksById, project],
  );

  const entries = useMemo(
    () => buildCutEntries(shots, scenesById, assets),
    [shots, scenesById, assets],
  );
  // Video entries advance via onEnded; the timer doubles as a watchdog with
  // a grace margin so a stalled or unseekable clip never freezes the cut.
  const timings = useMemo(
    () =>
      entries.map((entry) =>
        entry.kind === "video"
          ? entry.playbackSeconds + 2
          : entry.playbackSeconds,
      ),
    [entries],
  );

  // Preview mix: dialogue clips at their shot offsets, music and ambience
  // looped behind the whole cut. Playback schedules it through WebAudio.
  const mix = useMemo((): PlaybackMix => {
    const offsets = playbackOffsets(entries);
    const cues = entries.flatMap((entry, position) => {
      const asset = entry.shot.dialogueAssetId
        ? assets[entry.shot.dialogueAssetId]
        : undefined;
      const at = offsets[position];
      return asset && asset.url.length > 0 && at !== undefined
        ? [{ url: asset.url, at }]
        : [];
    });
    const loops = tracks.flatMap((track) => {
      const asset = track.assetId ? assets[track.assetId] : undefined;
      return asset && asset.url.length > 0
        ? [{ id: track.id, url: asset.url, gain: track.gain, muted: track.muted }]
        : [];
    });
    return {
      cues,
      loops,
      offsets,
      totalSeconds: playbackTotalSeconds(entries),
    };
  }, [entries, tracks, assets]);

  const playback = usePlayback(timings, mix);
  const [muted, setMuted] = useState(true);
  const [exportingBoard, setExportingBoard] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // The shell guards missing projects; this covers deletion races only.
  if (!project) return null;

  if (shots.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <EmptyState
          icon={FilmStrip}
          title={timelineCopy.empty.title}
          hint={timelineCopy.empty.hint}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("../script")}
            >
              {timelineCopy.empty.action}
            </Button>
          }
        />
      </div>
    );
  }

  const current = entries[playback.index] ?? entries[0];
  const renderedClips = shots.filter(
    (shot) => shot.videoAssetId !== null,
  ).length;
  const runtime = totalSeconds(entries);
  const elapsed = elapsedSeconds(entries, playback.index);

  const handleExportBoard = async () => {
    setExportingBoard(true);
    setExportError(null);
    const result = await exportContactSheet({ project, groups, assets });
    setExportingBoard(false);
    if (!result.ok) setExportError(result.error.message);
  };

  const handleExportCut = () => {
    setExportError(null);
    const result = exportCutData({ project, groups, characters });
    if (!result.ok) setExportError(result.error.message);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-4 p-4">
        {/* Header collapses to stacked rows below 1024px. */}
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="font-mono text-xs text-fg-secondary">
            <span className="text-fg">{formatSeconds(runtime)}</span>{" "}
            <span className="text-fg-muted">
              {timelineCopy.header.clipsRendered(renderedClips, shots.length)}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              busy={exportingBoard}
              onClick={() => void handleExportBoard()}
            >
              {timelineCopy.header.exportBoard}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCut}>
              {timelineCopy.header.exportCut}
            </Button>
          </div>
        </header>

        {exportError ? (
          <p role="alert" className="text-xs text-danger">
            {timelineCopy.header.exportFailed} {exportError}
          </p>
        ) : null}

        {current ? (
          <PlaybackStage
            project={project}
            entry={current}
            globalNumber={playback.index + 1}
            playing={playback.playing}
            muted={muted}
            waitingOnHydration={current.pendingAssets && !hydrated}
            onEnded={playback.next}
          />
        ) : null}

        <div className="flex items-center justify-center gap-3 font-mono text-xs text-fg-secondary">
          <button
            type="button"
            aria-label={timelineCopy.transport.previous}
            title={timelineCopy.transport.previous}
            disabled={playback.index === 0}
            onClick={playback.prev}
            className="flex size-8 items-center justify-center text-fg-muted transition-colors duration-150 hover:bg-ink-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SkipBack size={16} aria-hidden />
          </button>
          <Button
            variant="outline"
            size="sm"
            aria-label={
              playback.playing
                ? timelineCopy.transport.pause
                : timelineCopy.transport.play
            }
            onClick={playback.playing ? playback.pause : playback.play}
          >
            {playback.playing ? (
              <Pause size={14} aria-hidden />
            ) : (
              <Play size={14} aria-hidden />
            )}
          </Button>
          <button
            type="button"
            aria-label={timelineCopy.transport.next}
            title={timelineCopy.transport.next}
            disabled={playback.index >= entries.length - 1}
            onClick={playback.next}
            className="flex size-8 items-center justify-center text-fg-muted transition-colors duration-150 hover:bg-ink-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SkipForward size={16} aria-hidden />
          </button>
          <span>
            {timelineCopy.transport.shotOf(playback.index + 1, entries.length)}
          </span>
          <span className="text-fg-muted">
            {formatSeconds(elapsed)} / {formatSeconds(runtime)}
          </span>
        </div>

        <div className="-mt-2 flex justify-center">
          <button
            type="button"
            aria-label={
              muted ? timelineCopy.transport.unmute : timelineCopy.transport.mute
            }
            aria-pressed={!muted}
            title={
              muted ? timelineCopy.transport.unmute : timelineCopy.transport.mute
            }
            onClick={() => setMuted((current) => !current)}
            className="flex size-8 items-center justify-center text-fg-muted transition-colors duration-150 hover:bg-ink-hover hover:text-fg"
          >
            {muted ? (
              <SpeakerSimpleX size={16} aria-hidden />
            ) : (
              <SpeakerSimpleHigh size={16} aria-hidden />
            )}
          </button>
        </div>

        <Filmstrip
          entries={entries}
          currentIndex={playback.index}
          onSeek={playback.seek}
        />

        <AudioLanes
          project={project}
          entries={entries}
          tracks={tracks}
          totalSeconds={mix.totalSeconds}
        />

        <RenderPanel
          project={project}
          scenes={scenes}
          shots={shots}
          assets={assets}
          tracks={tracks}
        />
      </div>
    </div>
  );
};
