import { DiceFive, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

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
};

export const CharacterCard = ({ project, character }: CharacterCardProps) => {
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
          {castCopy.deleteBody(displayName)}
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

  useEffect(() => {
    setDraft(character.name);
  }, [character.name]);

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
