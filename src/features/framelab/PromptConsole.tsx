import { ArrowsClockwise } from "@phosphor-icons/react";
import { useId, useMemo, useState } from "react";

import { Button, Field, Select, TextArea, TextInput } from "@/components/ui";
import {
  CAMERA_ANGLES,
  LENSES,
  LIGHTING_CHOICES,
  SHOT_SIZES,
} from "@/domain/constants";
import { composeFramePrompt } from "@/domain/prompt";
import type { Character, Project, Scene, Shot } from "@/domain/types";
import type { CharacterId } from "@/lib/id";
import { randomSeed } from "@/lib/random";
import { useAssetsStore } from "@/stores/assets";
import { useProjectsStore } from "@/stores/projects";
import { useTasksStore } from "@/stores/tasks";

import { frameLabCopy } from "./copy";
import { portraitUrlsForShot, type FrameFailure } from "./frameLogic";
import { GenerateBar } from "./GenerateBar";
import { ReferenceChips } from "./ReferenceChips";

type PromptConsoleProps = {
  project: Project;
  scene: Scene;
  shot: Shot;
  /** Full cast; the prompt composer filters by the shot's character ids. */
  projectCharacters: readonly Character[];
  /** Characters attached to this shot's scene, for the reference chips. */
  sceneCharacters: readonly Character[];
  /** 1-based position across the whole project, used in task labels. */
  globalNumber: number;
  /** A frame task for this shot is queued or running. */
  busy: boolean;
  failure: FrameFailure | null;
};

/**
 * The artcraft-style control surface: the composed prompt stays visible and
 * editable, every camera ingredient writes back to the shot immediately, and
 * Generate enqueues one task per requested take. Mount with key={shot.id} so
 * local state resets per shot.
 */
export const PromptConsole = ({
  project,
  scene,
  shot,
  projectCharacters,
  sceneCharacters,
  globalNumber,
  busy,
  failure,
}: PromptConsoleProps) => {
  const updateShot = useProjectsStore((state) => state.updateShot);
  const enqueueImage = useTasksStore((state) => state.enqueueImage);
  const dismissTask = useTasksStore((state) => state.dismissTask);
  const promptId = useId();

  const composed = useMemo(
    () =>
      composeFramePrompt({
        project,
        scene,
        shot,
        characters: [...projectCharacters],
      }),
    [project, scene, shot, projectCharacters],
  );

  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [notes, setNotes] = useState(shot.promptNotes);

  // Camera, reference, and note edits recompose the prompt live until the
  // user types into it; Rebuild hands control back to the composer.
  const prompt = dirty ? draft : composed;
  const promptText = prompt.trim();

  const handleRebuild = () => {
    setDirty(false);
    setDraft("");
  };

  const toggleCharacter = (id: CharacterId) => {
    const next = shot.characterIds.includes(id)
      ? shot.characterIds.filter((candidate) => candidate !== id)
      : [...shot.characterIds, id];
    updateShot(shot.id, { characterIds: next });
  };

  const handleGenerate = (takeCount: number) => {
    if (promptText.length === 0) return;
    const assets = useAssetsStore.getState().assets;
    const referenceImageUrls = portraitUrlsForShot(
      shot,
      projectCharacters,
      assets,
    );
    let firstSeed = shot.seed;
    if (!shot.seedLocked) {
      firstSeed = randomSeed();
      updateShot(shot.id, { seed: firstSeed });
    }
    for (let take = 0; take < takeCount; take++) {
      const seed = shot.seedLocked
        ? shot.seed
        : take === 0
          ? firstSeed
          : randomSeed();
      enqueueImage({
        project,
        target: { kind: "shot-frame", shotId: shot.id },
        label:
          takeCount > 1
            ? frameLabCopy.taskTakeLabel(globalNumber, take + 1)
            : frameLabCopy.taskLabel(globalNumber),
        request: {
          prompt: promptText,
          aspectRatio: project.aspectRatio,
          seed,
          styleId: project.styleId,
          referenceImageUrls,
        },
      });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 border border-line bg-ink-panel p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor={promptId}
            className="text-[13px] font-medium text-fg-secondary"
          >
            {frameLabCopy.console.promptLabel}
          </label>
          <Button variant="ghost" size="sm" onClick={handleRebuild}>
            <ArrowsClockwise size={14} aria-hidden />
            {frameLabCopy.console.rebuild}
          </Button>
        </div>
        <TextArea
          id={promptId}
          value={prompt}
          onChange={(event) => {
            setDraft(event.target.value);
            setDirty(true);
          }}
          className="min-h-28 font-mono text-[13px]"
        />
        <p className="text-right font-mono text-[11px] text-fg-muted">
          {frameLabCopy.console.charCount(prompt.length)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <VocabSelect
          label={frameLabCopy.console.sizeLabel}
          value={shot.size}
          options={SHOT_SIZES}
          onChange={(size) => updateShot(shot.id, { size })}
        />
        <VocabSelect
          label={frameLabCopy.console.angleLabel}
          value={shot.angle}
          options={CAMERA_ANGLES}
          onChange={(angle) => updateShot(shot.id, { angle })}
        />
        <VocabSelect
          label={frameLabCopy.console.lensLabel}
          value={shot.lens}
          options={LENSES}
          onChange={(lens) => updateShot(shot.id, { lens })}
        />
        <VocabSelect
          label={frameLabCopy.console.lightingLabel}
          value={shot.lighting}
          options={LIGHTING_CHOICES}
          onChange={(lighting) => updateShot(shot.id, { lighting })}
        />
      </div>

      <ReferenceChips
        sceneCharacters={sceneCharacters}
        includedIds={shot.characterIds}
        onToggle={toggleCharacter}
      />

      <Field
        label={frameLabCopy.console.notesLabel}
        helper={frameLabCopy.console.notesHelper}
      >
        {({ inputId, describedBy }) => (
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if (notes !== shot.promptNotes) {
                updateShot(shot.id, { promptNotes: notes });
              }
            }}
          />
        )}
      </Field>

      {failure ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border border-danger/40 px-3 py-1.5"
        >
          <p className="min-w-0 text-xs text-danger">{failure.message}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dismissTask(failure.taskId)}
          >
            {frameLabCopy.console.dismiss}
          </Button>
        </div>
      ) : null}

      <GenerateBar
        shot={shot}
        busy={busy}
        canGenerate={promptText.length > 0}
        onGenerate={handleGenerate}
      />
    </div>
  );
};

type VocabSelectProps<TValue extends string> = {
  label: string;
  value: TValue;
  options: readonly { value: TValue; label: string }[];
  onChange: (value: TValue) => void;
};

const VocabSelect = <TValue extends string>({
  label,
  value,
  options,
  onChange,
}: VocabSelectProps<TValue>) => (
  <Field label={label}>
    {({ inputId, describedBy }) => (
      <Select
        id={inputId}
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    )}
  </Field>
);
