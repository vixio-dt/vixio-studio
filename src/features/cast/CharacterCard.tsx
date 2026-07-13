import { DiceFive, SpeakerSimpleHigh, Trash } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import {
  Button,
  Dialog,
  Field,
  Segmented,
  TextArea,
  TextInput,
} from "@/components/ui";
import { composePortraitPrompt } from "@/domain/prompt";
import type {
  Character,
  CharacterRole,
  GenerationTask,
  Project,
} from "@/domain/types";
import { randomSeed } from "@/lib/random";
import { resolveAudioProvider } from "@/providers/registry";
import { useProjectsStore } from "@/stores/projects";
import { useTasksStore } from "@/stores/tasks";

import { CharacterPortrait } from "./CharacterPortrait";
import { castCopy } from "./copy";

const ROLE_OPTIONS: readonly { value: CharacterRole; label: string }[] = [
  { value: "lead", label: castCopy.roleLead },
  { value: "supporting", label: castCopy.roleSupporting },
  { value: "minor", label: castCopy.roleMinor },
];

type CharacterCardProps = {
  project: Project;
  character: Character;
  /** Position in the cast grid; suffixes the voice testids. */
  index: number;
};

export const CharacterCard = ({
  project,
  character,
  index,
}: CharacterCardProps) => {
  const updateCharacter = useProjectsStore((state) => state.updateCharacter);
  const deleteCharacter = useProjectsStore((state) => state.deleteCharacter);
  const attachPortraitToCharacter = useProjectsStore(
    (state) => state.attachPortraitToCharacter,
  );
  const enqueueImage = useTasksStore((state) => state.enqueueImage);

  // Newest portrait task for this character; task objects are stable
  // references, so this only re-renders the card when its own task moves.
  const latestPortraitTask = useTasksStore(
    (state): GenerationTask | null => {
      for (let position = state.order.length - 1; position >= 0; position -= 1) {
        const taskId = state.order[position];
        if (!taskId) continue;
        const task = state.tasks[taskId];
        if (!task) continue;
        if (
          task.target.kind === "character-portrait" &&
          task.target.characterId === character.id
        ) {
          return task;
        }
      }
      return null;
    },
  );

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const generating =
    latestPortraitTask !== null &&
    (latestPortraitTask.status.state === "queued" ||
      latestPortraitTask.status.state === "running");
  const failureMessage =
    latestPortraitTask !== null && latestPortraitTask.status.state === "failed"
      ? latestPortraitTask.status.message
      : null;

  const displayName = character.name.trim() || castCopy.unnamed;

  const handleGenerate = () => {
    enqueueImage({
      project,
      target: { kind: "character-portrait", characterId: character.id },
      label: castCopy.taskLabel(displayName),
      request: {
        prompt: composePortraitPrompt({ project, character }),
        aspectRatio: "1:1",
        seed: character.seed,
        styleId: project.styleId,
        referenceImageUrls: [],
      },
    });
  };

  return (
    <article className="flex flex-col gap-3 border border-line bg-ink-panel p-3">
      <CharacterPortrait
        character={character}
        generating={generating}
        failureMessage={failureMessage}
        onRetry={handleGenerate}
        onSelectPortrait={(assetId) =>
          attachPortraitToCharacter(character.id, assetId)
        }
      />

      <div className="flex items-center gap-1">
        <NameInput character={character} />
        <button
          type="button"
          title={castCopy.deleteCharacter}
          aria-label={castCopy.deleteCharacter}
          onClick={() => setConfirmingDelete(true)}
          className="flex size-7 shrink-0 items-center justify-center text-fg-muted transition-colors duration-150 hover:bg-ink-hover hover:text-danger"
        >
          <Trash size={15} aria-hidden />
        </button>
      </div>

      <Segmented
        options={ROLE_OPTIONS}
        value={character.role}
        onChange={(role) => updateCharacter(character.id, { role })}
        ariaLabel={castCopy.roleLabel}
        size="sm"
      />

      <Field label={castCopy.bioLabel}>
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            value={character.bio}
            onChange={(event) =>
              updateCharacter(character.id, { bio: event.target.value })
            }
            placeholder={castCopy.bioPlaceholder}
          />
        )}
      </Field>

      <Field
        label={castCopy.appearanceLabel}
        helper={castCopy.appearanceHelper}
      >
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            value={character.appearance}
            onChange={(event) =>
              updateCharacter(character.id, { appearance: event.target.value })
            }
            placeholder={castCopy.appearancePlaceholder}
          />
        )}
      </Field>

      <Field label={castCopy.wardrobeLabel} helper={castCopy.wardrobeHelper}>
        {({ inputId, describedBy }) => (
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            value={character.wardrobe}
            onChange={(event) =>
              updateCharacter(character.id, { wardrobe: event.target.value })
            }
            placeholder={castCopy.wardrobePlaceholder}
          />
        )}
      </Field>

      <VoiceSection character={character} index={index} />

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <Button
          variant="primary"
          size="sm"
          onClick={handleGenerate}
          busy={generating}
        >
          {castCopy.generatePortrait}
        </Button>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fg-muted">{castCopy.seedLabel}</span>
          <span className="font-mono text-xs text-fg-secondary">
            {character.seed}
          </span>
          <button
            type="button"
            title={castCopy.newSeed}
            aria-label={castCopy.newSeed}
            onClick={() => updateCharacter(character.id, { seed: randomSeed() })}
            className="flex size-7 items-center justify-center text-fg-secondary transition-colors duration-150 hover:bg-ink-hover hover:text-fg"
          >
            <DiceFive size={16} aria-hidden />
          </button>
        </div>
      </div>

      <Dialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title={castCopy.deleteCharacter}
      >
        <p className="text-sm text-fg-secondary">
          {castCopy.deleteBody(displayName, project.mode)}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmingDelete(false)}
          >
            {castCopy.cancel}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setConfirmingDelete(false);
              deleteCharacter(character.id);
            }}
          >
            {castCopy.confirmDelete}
          </Button>
        </div>
      </Dialog>
    </article>
  );
};

/** The bio's first sentence; the voice test reads this line aloud. */
const firstSentence = (text: string): string | null => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const match = /^[^.!?]*[.!?]?/.exec(trimmed);
  const sentence = (match?.[0] ?? trimmed).trim();
  return sentence.length > 0 ? sentence : null;
};

type VoiceTestState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "playing" }
  | { phase: "failed"; message: string };

type VoiceSectionProps = {
  character: Character;
  index: number;
};

/**
 * Voice casting: a display name plus the provider voice id used for every
 * generated dialogue line. The test button calls the audio seam directly
 * (no queue), busies while synthesizing, then shows a playing state until
 * the synthesized first sentence of the bio finishes.
 */
const VoiceSection = ({ character, index }: VoiceSectionProps) => {
  const updateCharacter = useProjectsStore((state) => state.updateCharacter);
  const [testState, setTestState] = useState<VoiceTestState>({ phase: "idle" });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const aliveRef = useRef(true);

  // Stop any preview playback when the card unmounts.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const displayName = character.name.trim() || castCopy.unnamed;

  const handleTest = async () => {
    setTestState({ phase: "running" });
    const text =
      firstSentence(character.bio) ?? castCopy.voiceTestLine(displayName);
    const voiceId = character.voiceId?.trim();
    const result = await resolveAudioProvider().generateSpeech(
      {
        text,
        ...(voiceId ? { voiceId } : {}),
        characterName: displayName,
      },
      () => undefined,
    );
    if (!aliveRef.current) return;
    if (!result.ok) {
      setTestState({ phase: "failed", message: result.error.message });
      return;
    }
    audioRef.current?.pause();
    const url = URL.createObjectURL(result.value.blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    const release = () => URL.revokeObjectURL(url);
    audio.onended = () => {
      release();
      if (aliveRef.current) setTestState({ phase: "idle" });
    };
    audio.onerror = () => {
      release();
      if (aliveRef.current) {
        setTestState({ phase: "failed", message: castCopy.voiceTestFailed });
      }
    };
    try {
      await audio.play();
      if (aliveRef.current) setTestState({ phase: "playing" });
    } catch (cause) {
      release();
      if (aliveRef.current) {
        setTestState({
          phase: "failed",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <Field label={castCopy.voiceNameLabel}>
        {({ inputId, describedBy }) => (
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            value={character.voiceName ?? ""}
            onChange={(event) =>
              updateCharacter(character.id, { voiceName: event.target.value })
            }
            placeholder={castCopy.voiceNamePlaceholder}
          />
        )}
      </Field>

      <Field
        label={castCopy.voiceIdLabel}
        helper={castCopy.voiceIdHelper}
        error={testState.phase === "failed" ? castCopy.voiceTestFailed + " " + testState.message : undefined}
      >
        {({ inputId, describedBy }) => (
          <div className="flex items-center gap-2">
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              data-testid={`cast-voice-id-${index}`}
              value={character.voiceId ?? ""}
              onChange={(event) =>
                updateCharacter(character.id, { voiceId: event.target.value })
              }
              placeholder={castCopy.voiceIdPlaceholder}
              className="font-mono"
            />
            <Button
              variant="outline"
              size="sm"
              data-testid="cast-voice-test"
              busy={testState.phase === "running"}
              aria-pressed={testState.phase === "playing"}
              onClick={() => void handleTest()}
            >
              <SpeakerSimpleHigh size={14} aria-hidden />
              {testState.phase === "playing"
                ? castCopy.voicePlaying
                : castCopy.testVoice}
            </Button>
          </div>
        )}
      </Field>
    </div>
  );
};

type NameInputProps = {
  character: Character;
};

/**
 * Quiet always-on name field: reads as a title, edits in place. Commits on
 * blur or Enter so the alphabetical grid does not reorder mid-keystroke.
 */
const NameInput = ({ character }: NameInputProps) => {
  const updateCharacter = useProjectsStore((state) => state.updateCharacter);
  const [draft, setDraft] = useState(character.name);
  const [committedName, setCommittedName] = useState(character.name);
  if (character.name !== committedName) {
    setCommittedName(character.name);
    setDraft(character.name);
  }

  const commit = () => {
    const next = draft.trim();
    setDraft(next);
    if (next !== character.name) updateCharacter(character.id, { name: next });
  };

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      aria-label={castCopy.nameLabel}
      placeholder={castCopy.namePlaceholder}
      className="h-8 w-full min-w-0 border-b border-transparent bg-transparent font-display text-base font-bold tracking-[-0.02em] text-fg transition-colors duration-150 placeholder:text-fg-muted hover:border-line focus:border-accent-media focus:outline-none"
    />
  );
};
