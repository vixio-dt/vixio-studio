import { useId, useMemo, useState } from "react";

import { Button, Segmented, TextArea } from "@/components/ui";
import { MOTION_PRESETS, VIDEO_DURATIONS } from "@/domain/constants";
import { composeFramePrompt, composeVideoPrompt } from "@/domain/prompt";
import type { Asset, Character, Project, Scene, Shot } from "@/domain/types";
import type { ShotId } from "@/lib/id";
import { useProjectsStore } from "@/stores/projects";
import { useSettingsStore } from "@/stores/settings";
import { useTasksStore } from "@/stores/tasks";

import { motionCopy } from "./copy";
import { buildClipTask, type FailedClipTask } from "./motionLogic";

const DURATION_OPTIONS = VIDEO_DURATIONS.map((seconds) => ({
  value: String(seconds),
  label: motionCopy.console.durationOption(seconds),
}));

type MotionConsoleProps = {
  project: Project;
  scene: Scene;
  shot: Shot;
  characters: readonly Character[];
  /** 1-based position across the whole project, used in task labels. */
  globalNumber: number;
  frameAsset: Asset | null;
  /** A shot-video task for this shot is queued or running. */
  generating: boolean;
  /** Newest failure that is still worth surfacing, or null. */
  failedTask: FailedClipTask | null;
};

/**
 * The image-to-video console: camera move presets, clip duration, the
 * composed video prompt (visible and editable, artcraft doctrine), and the
 * generate action wired into the shared task queue.
 */
export const MotionConsole = ({
  project,
  scene,
  shot,
  characters,
  globalNumber,
  frameAsset,
  generating,
  failedTask,
}: MotionConsoleProps) => {
  const promptId = useId();
  const updateShot = useProjectsStore((state) => state.updateShot);
  const enqueueVideo = useTasksStore((state) => state.enqueueVideo);
  const dismissTask = useTasksStore((state) => state.dismissTask);
  const veoConfigured = useSettingsStore(
    (state) =>
      state.videoProvider === "gemini" && state.geminiApiKey.trim().length > 0,
  );

  const composedPrompt = useMemo(
    () =>
      composeVideoPrompt({
        framePrompt: composeFramePrompt({
          project,
          scene,
          shot,
          characters: [...characters],
        }),
        shot,
      }),
    [project, scene, shot, characters],
  );

  // Edits stick per shot until the user rebuilds or moves to another shot;
  // keying the draft by shot id derives the reset instead of effecting it.
  const [draftEdit, setDraftEdit] = useState<{
    shotId: ShotId;
    text: string;
  } | null>(null);
  const draft =
    draftEdit !== null && draftEdit.shotId === shot.id ? draftEdit.text : null;

  const prompt = draft ?? composedPrompt;
  const promptDirty = draft !== null && draft !== composedPrompt;

  const handleGenerate = () => {
    if (!frameAsset) return;
    enqueueVideo(
      buildClipTask({
        project,
        shot,
        prompt,
        startFrameUrl: frameAsset.url,
        drivingVideoUrl: null,
        globalNumber,
      }),
    );
  };

  return (
    <section className="flex flex-col gap-4 border border-line bg-ink-panel p-4">
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-fg-secondary">
          {motionCopy.console.cameraMove}
        </p>
        <div className="flex flex-wrap gap-2">
          {MOTION_PRESETS.map((preset) => {
            const selected = shot.movement === preset.movement;
            return (
              <button
                key={preset.movement}
                type="button"
                aria-pressed={selected}
                title={preset.promptFragment}
                onClick={() =>
                  updateShot(shot.id, { movement: preset.movement })
                }
                className={`h-7 border px-2.5 text-xs transition-colors duration-150 active:scale-[0.98] ${
                  selected
                    ? "border-accent-media text-fg"
                    : "border-line text-fg-muted hover:border-line-strong hover:text-fg-secondary"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-fg-secondary">
          {motionCopy.console.duration}
        </p>
        <Segmented
          ariaLabel={motionCopy.console.duration}
          options={DURATION_OPTIONS}
          value={String(shot.durationSeconds)}
          onChange={(value) =>
            updateShot(shot.id, { durationSeconds: Number(value) })
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={promptId}
            className="text-[13px] font-medium text-fg-secondary"
          >
            {motionCopy.console.prompt}
          </label>
          {promptDirty ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraftEdit(null)}
            >
              {motionCopy.console.rebuildPrompt}
            </Button>
          ) : null}
        </div>
        <TextArea
          id={promptId}
          value={prompt}
          onChange={(event) =>
            setDraftEdit({ shotId: shot.id, text: event.target.value })
          }
          className="min-h-24 font-mono text-[13px]"
        />
        <p className="text-xs text-fg-muted">
          {motionCopy.console.promptHelper}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="min-w-0 text-xs text-fg-muted">
          {veoConfigured
            ? motionCopy.console.veoNote
            : motionCopy.console.previewNote}
        </p>
        <Button
          variant="primary"
          size="md"
          busy={generating}
          disabled={!frameAsset}
          title={!frameAsset ? motionCopy.console.needsFrameReason : undefined}
          onClick={handleGenerate}
        >
          {motionCopy.console.generate}
        </Button>
      </div>

      {failedTask ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 border border-danger/40 px-3 py-2"
        >
          <p className="min-w-0 text-xs text-danger">
            {motionCopy.console.failedTitle}. {failedTask.message}
          </p>
          <button
            type="button"
            title={motionCopy.console.dismissFailed}
            onClick={() => dismissTask(failedTask.id)}
            className="shrink-0 text-xs text-fg-secondary transition-colors duration-150 hover:text-fg"
          >
            {motionCopy.console.dismiss}
          </button>
        </div>
      ) : null}
    </section>
  );
};
