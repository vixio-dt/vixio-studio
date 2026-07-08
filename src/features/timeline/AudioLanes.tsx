import {
  MusicNotes,
  Pause,
  Play,
  Plus,
  SpeakerSimpleHigh,
  SpeakerSimpleX,
  Trash,
  Waveform,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { Button, TextInput } from "@/components/ui";
import type {
  AudioLane,
  AudioTrack,
  Character,
  GenerationTask,
  Project,
} from "@/domain/types";
import type { CharacterId } from "@/lib/id";
import { useAsset } from "@/stores/assets";
import { useProjectsStore } from "@/stores/projects";
import { useTasksStore } from "@/stores/tasks";

import { timelineCopy } from "./copy";
import { formatShortSeconds, type CutEntry } from "./cutLogic";

const laneCopy = timelineCopy.lanes;

type AudioLanesProps = {
  project: Project;
  entries: readonly CutEntry[];
  /** Ordered music-then-ambience tracks; row testids suffix this order. */
  tracks: readonly AudioTrack[];
  /** Stage total in seconds; caps generated track length at 30s. */
  totalSeconds: number;
};

/**
 * The audio bed under the filmstrip: a dialogue lane with one chip per
 * speaking shot, and music and ambience lanes with promptable looped tracks.
 * Generation runs through the shared task queue; results attach themselves.
 */
export const AudioLanes = ({
  project,
  entries,
  tracks,
  totalSeconds,
}: AudioLanesProps) => {
  const dialogueEntries = entries.filter(
    (entry) => (entry.shot.dialogue ?? "").trim().length > 0,
  );
  const trackSeconds = Math.max(1, Math.min(30, totalSeconds));

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-4">
      <h2 className="font-display text-base font-bold tracking-[-0.02em]">
        {laneCopy.title}
      </h2>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-fg-secondary">
          {laneCopy.dialogueLane}
        </p>
        {dialogueEntries.length === 0 ? (
          <p className="text-xs text-fg-muted">{laneCopy.dialogueEmpty}</p>
        ) : (
          <div className="flex flex-col gap-px bg-line">
            {dialogueEntries.map((entry) => (
              <DialogueChip
                key={entry.shot.id}
                project={project}
                entry={entry}
                index={entries.indexOf(entry)}
              />
            ))}
          </div>
        )}
      </div>

      <LanePanel
        lane="music"
        project={project}
        tracks={tracks}
        trackSeconds={trackSeconds}
      />
      <LanePanel
        lane="ambience"
        project={project}
        tracks={tracks}
        trackSeconds={trackSeconds}
      />
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Dialogue lane                                                       */
/* ------------------------------------------------------------------ */

const useLatestTask = (
  matches: (task: GenerationTask) => boolean,
): GenerationTask | null =>
  useTasksStore((state): GenerationTask | null => {
    for (let position = state.order.length - 1; position >= 0; position -= 1) {
      const taskId = state.order[position];
      if (!taskId) continue;
      const task = state.tasks[taskId];
      if (task && matches(task)) return task;
    }
    return null;
  });

const isActive = (task: GenerationTask | null): boolean =>
  task !== null &&
  (task.status.state === "queued" || task.status.state === "running");

const failureOf = (task: GenerationTask | null): string | null =>
  task !== null && task.status.state === "failed" ? task.status.message : null;

type DialogueChipProps = {
  project: Project;
  entry: CutEntry;
  /** Position across the whole cut; 1-based in labels, suffix in testids. */
  index: number;
};

const DialogueChip = ({ project, entry, index }: DialogueChipProps) => {
  const { shot } = entry;
  const charactersById = useProjectsStore((state) => state.characters);
  const enqueueDialogue = useTasksStore((state) => state.enqueueDialogue);
  const asset = useAsset(shot.dialogueAssetId ?? null);
  const task = useLatestTask(
    (candidate) =>
      candidate.target.kind === "shot-dialogue" &&
      candidate.target.shotId === shot.id,
  );

  const speaker = firstSpeaker(shot.characterIds, charactersById);
  const generating = isActive(task);
  const failure = failureOf(task);
  const shotNumber = index + 1;

  const handleGenerate = () => {
    enqueueDialogue({
      project,
      shot,
      character: speaker,
      label: laneCopy.dialogueTask(shotNumber),
    });
  };

  return (
    <div className="flex flex-col gap-1 bg-ink-panel p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-fg-secondary">
          #{shotNumber}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm text-fg">
          {shot.dialogue}
        </p>
        <span className="text-xs text-fg-muted">
          {speaker?.voiceName?.trim() || speaker?.voiceId?.trim()
            ? laneCopy.voiceOf(
                speaker?.voiceName?.trim() || (speaker?.voiceId ?? ""),
              )
            : laneCopy.noVoice}
        </span>
        {asset ? (
          <>
            <span className="font-mono text-xs text-fg-secondary">
              {formatShortSeconds(asset.duration ?? 0)}
            </span>
            <ClipPlayButton
              url={asset.url}
              playLabel={laneCopy.playDialogue(shotNumber)}
              stopLabel={laneCopy.stopDialogue(shotNumber)}
            />
          </>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          data-testid={`cut-dialogue-generate-${index}`}
          busy={generating}
          onClick={handleGenerate}
        >
          {asset ? laneCopy.regenerate : laneCopy.generate}
        </Button>
      </div>
      {failure ? (
        <p role="alert" className="text-xs text-danger">
          {laneCopy.generationFailed} {failure}
        </p>
      ) : null}
    </div>
  );
};

const firstSpeaker = (
  characterIds: readonly CharacterId[],
  charactersById: Record<CharacterId, Character>,
): Character | null => {
  const firstId = characterIds[0];
  return firstId ? (charactersById[firstId] ?? null) : null;
};

type ClipPlayButtonProps = {
  url: string;
  playLabel: string;
  stopLabel: string;
};

/** One-shot preview of a generated clip; pressing again stops it. */
const ClipPlayButton = ({ url, playLabel, stopLabel }: ClipPlayButtonProps) => {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  const handleToggle = () => {
    if (playing) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    void audio.play().catch(() => setPlaying(false));
    setPlaying(true);
  };

  const label = playing ? stopLabel : playLabel;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={handleToggle}
      className="flex size-7 items-center justify-center text-fg-secondary transition-colors duration-150 hover:bg-ink-hover hover:text-fg"
    >
      {playing ? (
        <Pause size={14} aria-hidden />
      ) : (
        <Play size={14} aria-hidden />
      )}
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* Music and ambience lanes                                            */
/* ------------------------------------------------------------------ */

type LanePanelProps = {
  lane: AudioLane;
  project: Project;
  tracks: readonly AudioTrack[];
  trackSeconds: number;
};

const LanePanel = ({ lane, project, tracks, trackSeconds }: LanePanelProps) => {
  const addAudioTrack = useProjectsStore((state) => state.addAudioTrack);
  const laneTracks = tracks.filter((track) => track.lane === lane);
  const music = lane === "music";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-fg-secondary">
          {music ? laneCopy.musicLane : laneCopy.ambienceLane}
        </p>
        <Button
          variant="ghost"
          size="sm"
          data-testid={music ? "cut-track-add-music" : "cut-track-add-ambience"}
          onClick={() =>
            addAudioTrack({
              projectId: project.id,
              lane,
              prompt: "",
              gain: 0.8,
              muted: false,
            })
          }
        >
          <Plus size={14} aria-hidden />
          {music ? laneCopy.addMusic : laneCopy.addAmbience}
        </Button>
      </div>
      {laneTracks.length === 0 ? (
        <p className="text-xs text-fg-muted">{laneCopy.laneEmpty}</p>
      ) : (
        <div className="flex flex-col gap-px bg-line">
          {laneTracks.map((track) => (
            <TrackRow
              key={track.id}
              project={project}
              track={track}
              index={tracks.indexOf(track)}
              trackSeconds={trackSeconds}
            />
          ))}
        </div>
      )}
    </div>
  );
};

type TrackRowProps = {
  project: Project;
  track: AudioTrack;
  /** Position across all of the project's tracks; suffixes the testid. */
  index: number;
  trackSeconds: number;
};

const TrackRow = ({ project, track, index, trackSeconds }: TrackRowProps) => {
  const updateAudioTrack = useProjectsStore((state) => state.updateAudioTrack);
  const removeAudioTrack = useProjectsStore((state) => state.removeAudioTrack);
  const enqueueAudioTrack = useTasksStore((state) => state.enqueueAudioTrack);
  const asset = useAsset(track.assetId ?? null);
  const task = useLatestTask(
    (candidate) =>
      candidate.target.kind === "audio-track" &&
      candidate.target.trackId === track.id,
  );

  const music = track.lane === "music";
  const generating = isActive(task);
  const failure = failureOf(task);
  const LaneIcon = music ? MusicNotes : Waveform;

  const handleGenerate = () => {
    enqueueAudioTrack({
      project,
      track,
      durationSeconds: trackSeconds,
      label: music ? laneCopy.musicTask : laneCopy.ambienceTask,
    });
  };

  return (
    <div className="flex flex-col gap-2 bg-ink-panel p-2">
      <div className="flex flex-wrap items-center gap-2">
        <LaneIcon size={14} className="shrink-0 text-fg-muted" aria-hidden />
        <TextInput
          aria-label={
            music ? laneCopy.musicPromptLabel : laneCopy.ambiencePromptLabel
          }
          value={track.prompt}
          onChange={(event) =>
            updateAudioTrack(track.id, { prompt: event.target.value })
          }
          placeholder={
            music
              ? laneCopy.musicPromptPlaceholder
              : laneCopy.ambiencePromptPlaceholder
          }
          className="h-8 min-w-40 flex-1 basis-52 text-[13px]"
        />
        <Button
          variant="outline"
          size="sm"
          data-testid={`cut-track-generate-${index}`}
          busy={generating}
          disabled={track.prompt.trim().length === 0}
          onClick={handleGenerate}
        >
          {asset ? laneCopy.regenerate : laneCopy.generate}
        </Button>
        <button
          type="button"
          aria-label={track.muted ? laneCopy.unmute : laneCopy.mute}
          aria-pressed={track.muted}
          title={track.muted ? laneCopy.unmute : laneCopy.mute}
          onClick={() => updateAudioTrack(track.id, { muted: !track.muted })}
          className={`flex size-7 items-center justify-center transition-colors duration-150 hover:bg-ink-hover ${
            track.muted ? "text-fg-muted" : "text-fg-secondary hover:text-fg"
          }`}
        >
          {track.muted ? (
            <SpeakerSimpleX size={14} aria-hidden />
          ) : (
            <SpeakerSimpleHigh size={14} aria-hidden />
          )}
        </button>
        <button
          type="button"
          aria-label={laneCopy.removeTrack}
          title={laneCopy.removeTrack}
          onClick={() => removeAudioTrack(track.id)}
          className="flex size-7 items-center justify-center text-fg-muted transition-colors duration-150 hover:bg-ink-hover hover:text-danger"
        >
          <Trash size={14} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          {laneCopy.gainLabel}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            data-testid="cut-track-gain"
            value={track.gain}
            onChange={(event) =>
              updateAudioTrack(track.id, {
                gain: Number(event.target.value),
              })
            }
            className="h-1 w-28 accent-accent-media"
          />
          <span className="font-mono text-fg-secondary">
            {track.gain.toFixed(2)}
          </span>
        </label>
        {asset ? (
          <>
            <span className="font-mono text-xs text-fg-secondary">
              {formatShortSeconds(asset.duration ?? 0)}
            </span>
            <div
              role="img"
              aria-label={laneCopy.levelLabel}
              className="h-1 w-24 bg-ink-raised"
            >
              <div
                className={track.muted ? "h-full bg-fg-muted/40" : "h-full bg-accent-media"}
                style={{ width: `${Math.round(track.gain * 100)}%` }}
              />
            </div>
          </>
        ) : null}
      </div>

      {failure ? (
        <p role="alert" className="text-xs text-danger">
          {laneCopy.generationFailed} {failure}
        </p>
      ) : null}
    </div>
  );
};
