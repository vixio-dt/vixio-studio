import {
  ArrowsClockwise,
  DiceFive,
  LockSimple,
  LockSimpleOpen,
} from "@phosphor-icons/react";
import { useId, useMemo, useState } from "react";

import { Button, Field, TextArea, TextInput } from "@/components/ui";
import { composePanelPrompt } from "@/domain/prompt";
import type { AspectRatio, Character, Panel, Project } from "@/domain/types";
import type { CharacterId } from "@/lib/id";
import { randomSeed } from "@/lib/random";
import { useProjectsStore } from "@/stores/projects";
import { useTasksStore } from "@/stores/tasks";

import { panelLabCopy } from "./copy";
import type { PanelFailure } from "./panelLogic";

type PanelConsoleProps = {
  project: Project;
  panel: Panel;
  /** Full project cast; the composer filters by the panel's character ids. */
  characters: readonly Character[];
  /** Supported ratio nearest the panel's layout frame, for generation. */
  frameAspect: AspectRatio;
  pageNumber: number;
  panelNumber: number;
  /** A panel-image task for this panel is queued or running. */
  busy: boolean;
  failure: PanelFailure | null;
};

/**
 * The artcraft-style control surface for one panel: the composed prompt stays
 * visible and editable, every ingredient writes back to the panel, and
 * Generate enqueues through the shared task queue. Mount with key={panel.id}
 * so local state resets per panel.
 */
export const PanelConsole = ({
  project,
  panel,
  characters,
  frameAspect,
  pageNumber,
  panelNumber,
  busy,
  failure,
}: PanelConsoleProps) => {
  const updatePanel = useProjectsStore((state) => state.updatePanel);
  const enqueuePanelImage = useTasksStore((state) => state.enqueuePanelImage);
  const dismissTask = useTasksStore((state) => state.dismissTask);
  const promptId = useId();

  const composed = useMemo(
    () =>
      composePanelPrompt({
        project,
        panel,
        characters: [...characters],
      }),
    [project, panel, characters],
  );

  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [notes, setNotes] = useState(panel.promptNotes);
  const [seedDraft, setSeedDraft] = useState<string | null>(null);

  // Description, cast, and note edits recompose the prompt live until the
  // user types into it; Rebuild hands control back to the composer.
  const prompt = dirty ? draft : composed;
  const promptText = prompt.trim();

  const handleRebuild = () => {
    setDirty(false);
    setDraft("");
  };

  const toggleCharacter = (id: CharacterId) => {
    const next = panel.characterIds.includes(id)
      ? panel.characterIds.filter((candidate) => candidate !== id)
      : [...panel.characterIds, id];
    updatePanel(panel.id, { characterIds: next });
  };

  const seedText = seedDraft ?? String(panel.seed);
  const handleSeedChange = (value: string) => {
    setSeedDraft(value);
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      updatePanel(panel.id, { seed: parsed });
    }
  };

  const handleGenerate = () => {
    if (promptText.length === 0) return;
    let seed = panel.seed;
    if (!panel.seedLocked) {
      seed = randomSeed();
      updatePanel(panel.id, { seed });
    }
    enqueuePanelImage({
      project,
      panel,
      characters,
      label: panelLabCopy.taskLabel(pageNumber, panelNumber),
      seed,
      prompt: promptText,
      aspectRatio: frameAspect,
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor={promptId}
            className="text-[13px] font-medium text-fg-secondary"
          >
            {panelLabCopy.console.promptLabel}
          </label>
          <Button variant="ghost" size="sm" onClick={handleRebuild}>
            <ArrowsClockwise size={14} aria-hidden />
            {panelLabCopy.console.rebuild}
          </Button>
        </div>
        <TextArea
          id={promptId}
          data-testid="panel-prompt"
          value={prompt}
          onChange={(event) => {
            setDraft(event.target.value);
            setDirty(true);
          }}
          className="min-h-28 font-mono text-[13px]"
        />
        <p className="text-right font-mono text-[11px] text-fg-muted">
          {panelLabCopy.console.charCount(prompt.length)}
        </p>
      </div>

      <Field
        label={panelLabCopy.console.descriptionLabel}
        helper={panelLabCopy.console.descriptionHelper}
      >
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            value={panel.description}
            onChange={(event) =>
              updatePanel(panel.id, { description: event.target.value })
            }
            className="min-h-20 text-[13px]"
          />
        )}
      </Field>

      <Field
        label={panelLabCopy.console.notesLabel}
        helper={panelLabCopy.console.notesHelper}
      >
        {({ inputId, describedBy }) => (
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if (notes !== panel.promptNotes) {
                updatePanel(panel.id, { promptNotes: notes });
              }
            }}
          />
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-fg-secondary">
          {panelLabCopy.console.charactersLabel}
        </span>
        {characters.length === 0 ? (
          <p className="text-xs text-fg-muted">
            {panelLabCopy.console.noCharacters}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {characters.map((character) => {
              const included = panel.characterIds.includes(character.id);
              return (
                <button
                  key={character.id}
                  type="button"
                  aria-pressed={included}
                  onClick={() => toggleCharacter(character.id)}
                  className={`h-7 border px-2.5 text-xs transition-colors duration-150 ${
                    included
                      ? "border-accent-media/60 bg-ink-raised text-fg"
                      : "border-line-strong text-fg-secondary hover:bg-ink-hover"
                  }`}
                >
                  {character.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

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
            {panelLabCopy.console.dismiss}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TextInput
            value={seedText}
            onChange={(event) => handleSeedChange(event.target.value)}
            onBlur={() => setSeedDraft(null)}
            inputMode="numeric"
            aria-label={panelLabCopy.console.seedInputLabel}
            title={panelLabCopy.console.seedInputLabel}
            className="w-28 font-mono"
          />
          <button
            type="button"
            onClick={() => updatePanel(panel.id, { seed: randomSeed() })}
            title={panelLabCopy.console.reroll}
            aria-label={panelLabCopy.console.reroll}
            className="flex size-8 items-center justify-center text-fg-secondary transition-colors duration-150 hover:bg-ink-hover hover:text-fg"
          >
            <DiceFive size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() =>
              updatePanel(panel.id, { seedLocked: !panel.seedLocked })
            }
            aria-pressed={panel.seedLocked}
            title={
              panel.seedLocked
                ? panelLabCopy.console.lockOn
                : panelLabCopy.console.lockOff
            }
            aria-label={
              panel.seedLocked
                ? panelLabCopy.console.lockOn
                : panelLabCopy.console.lockOff
            }
            className={`flex size-8 items-center justify-center transition-colors duration-150 hover:bg-ink-hover ${
              panel.seedLocked ? "text-accent" : "text-fg-muted hover:text-fg"
            }`}
          >
            {panel.seedLocked ? (
              <LockSimple size={16} aria-hidden />
            ) : (
              <LockSimpleOpen size={16} aria-hidden />
            )}
          </button>
        </div>
        <Button
          variant="primary"
          data-testid="panel-generate"
          busy={busy}
          disabled={promptText.length === 0}
          onClick={handleGenerate}
        >
          {panelLabCopy.console.generate}
        </Button>
      </div>
    </div>
  );
};
