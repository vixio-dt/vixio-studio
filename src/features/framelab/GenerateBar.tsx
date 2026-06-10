import { DiceFive, LockSimple, LockSimpleOpen } from "@phosphor-icons/react";
import { useState } from "react";

import { Button, Segmented, TextInput } from "@/components/ui";
import type { Shot } from "@/domain/types";
import { randomSeed } from "@/lib/random";
import { useProjectsStore } from "@/stores/projects";

import { frameLabCopy } from "./copy";

const BATCH_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "4", label: "4" },
] as const;

type BatchCount = (typeof BATCH_OPTIONS)[number]["value"];

type GenerateBarProps = {
  shot: Shot;
  /** A frame task for this shot is queued or running. */
  busy: boolean;
  /** False while the prompt is empty. */
  canGenerate: boolean;
  onGenerate: (takeCount: number) => void;
};

/**
 * Seed cluster, batch picker, and the one primary action. The seed writes
 * back to the shot immediately; the lock decides whether takes reuse it.
 */
export const GenerateBar = ({
  shot,
  busy,
  canGenerate,
  onGenerate,
}: GenerateBarProps) => {
  const updateShot = useProjectsStore((state) => state.updateShot);
  const [seedDraft, setSeedDraft] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchCount>("1");

  const seedText = seedDraft ?? String(shot.seed);

  const handleSeedChange = (value: string) => {
    setSeedDraft(value);
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      updateShot(shot.id, { seed: parsed });
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          value={seedText}
          onChange={(event) => handleSeedChange(event.target.value)}
          onBlur={() => setSeedDraft(null)}
          inputMode="numeric"
          aria-label={frameLabCopy.console.seedInputLabel}
          title={frameLabCopy.console.seedInputLabel}
          className="w-28 font-mono"
        />
        <button
          type="button"
          onClick={() => updateShot(shot.id, { seed: randomSeed() })}
          title={frameLabCopy.console.reroll}
          aria-label={frameLabCopy.console.reroll}
          className="flex size-8 items-center justify-center text-fg-secondary transition-colors duration-150 hover:bg-ink-hover hover:text-fg"
        >
          <DiceFive size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => updateShot(shot.id, { seedLocked: !shot.seedLocked })}
          aria-pressed={shot.seedLocked}
          title={
            shot.seedLocked
              ? frameLabCopy.console.lockOn
              : frameLabCopy.console.lockOff
          }
          aria-label={
            shot.seedLocked
              ? frameLabCopy.console.lockOn
              : frameLabCopy.console.lockOff
          }
          className={`flex size-8 items-center justify-center transition-colors duration-150 hover:bg-ink-hover ${
            shot.seedLocked ? "text-accent" : "text-fg-muted hover:text-fg"
          }`}
        >
          {shot.seedLocked ? (
            <LockSimple size={16} aria-hidden />
          ) : (
            <LockSimpleOpen size={16} aria-hidden />
          )}
        </button>
        <Segmented
          size="sm"
          ariaLabel={frameLabCopy.console.batchLabel}
          options={BATCH_OPTIONS}
          value={batch}
          onChange={setBatch}
        />
      </div>
      <Button
        variant="primary"
        busy={busy}
        disabled={!canGenerate}
        onClick={() => onGenerate(Number.parseInt(batch, 10))}
      >
        {frameLabCopy.console.generate}
      </Button>
    </div>
  );
};
