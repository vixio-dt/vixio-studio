import { useState } from "react";

import { Button, Segmented } from "@/components/ui";
import type { Character } from "@/domain/types";
import {
  blockRotation,
  mannequinBlockKey,
  parseBlockKey,
  type PropKind,
  type ShotBlockout,
} from "@/lib/previz/blockout";

import { previzCopy } from "./copy";

const PROP_KINDS: readonly { value: PropKind; label: string }[] = [
  { value: "box", label: previzCopy.blocking.propKinds.box },
  { value: "cylinder", label: previzCopy.blocking.propKinds.cylinder },
  { value: "plane", label: previzCopy.blocking.propKinds.plane },
];

type BlockingPanelProps = {
  blockout: ShotBlockout;
  cast: readonly Character[];
  selectedBlockKey: string | null;
  onSelectBlock: (key: string | null) => void;
  onAddProp: (kind: PropKind) => void;
  onRemoveProp: (propId: string) => void;
  onRotateBlock: (key: string, rotationY: number) => void;
  /** True when a previous shot in this scene has a saved blockout to copy. */
  canCopyFromPrevious: boolean;
  onCopyFromPrevious: () => void;
};

/** Set dressing controls: cast list, prop palette, and the selected block. */
export const BlockingPanel = ({
  blockout,
  cast,
  selectedBlockKey,
  onSelectBlock,
  onAddProp,
  onRemoveProp,
  onRotateBlock,
  canCopyFromPrevious,
  onCopyFromPrevious,
}: BlockingPanelProps) => {
  const [propKind, setPropKind] = useState<PropKind>("box");
  const copy = previzCopy.blocking;

  const selectedRef =
    selectedBlockKey !== null ? parseBlockKey(selectedBlockKey) : null;
  const rotation =
    selectedBlockKey !== null ? blockRotation(blockout, selectedBlockKey) : null;
  const selectedName =
    selectedRef === null
      ? null
      : selectedRef.kind === "mannequin"
        ? (cast.find((character) => character.id === selectedRef.characterId)
            ?.name ?? copy.castLabel)
        : (PROP_KINDS.find(
            (kind) =>
              kind.value ===
              blockout.props.find((prop) => prop.id === selectedRef.propId)?.kind,
          )?.label ?? copy.propsLabel);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 border-b border-line pb-4">
        <Button
          size="sm"
          variant="outline"
          disabled={!canCopyFromPrevious}
          onClick={onCopyFromPrevious}
          data-testid="previz-copy-blocking"
        >
          {copy.copyFromPrevious}
        </Button>
        <p className="text-xs text-fg-muted">
          {canCopyFromPrevious
            ? copy.copyFromPreviousHelper
            : copy.copyFromPreviousUnavailable}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-fg-secondary">
          {copy.castLabel}
        </p>
        {cast.length === 0 ? (
          <p className="text-xs text-fg-muted">{copy.noCast}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {cast.map((character) => {
              const key = mannequinBlockKey(character.id);
              const selected = key === selectedBlockKey;
              return (
                <button
                  key={character.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectBlock(selected ? null : key)}
                  className={`inline-flex h-7 items-center border px-2 text-xs transition-colors duration-150 ${
                    selected
                      ? "border-accent-media/60 text-accent"
                      : "border-line-strong text-fg-muted hover:text-fg-secondary"
                  }`}
                >
                  {character.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-fg-secondary">
          {copy.propsLabel}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            ariaLabel={copy.propKindLabel}
            options={PROP_KINDS}
            value={propKind}
            onChange={setPropKind}
          />
          <Button
            size="sm"
            variant="outline"
            data-testid="previz-add-prop"
            onClick={() => onAddProp(propKind)}
          >
            {copy.addProp}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-[13px] font-medium text-fg-secondary">
          {copy.selectionLabel}
        </p>
        {selectedBlockKey === null || rotation === null ? (
          <p className="text-xs text-fg-muted">{copy.nothingSelected}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-fg">{selectedName}</p>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="flex justify-between text-[11px] text-fg-muted">
                {copy.rotationLabel}
                <span className="font-mono">
                  {Math.round((rotation * 180) / Math.PI)}
                </span>
              </span>
              <input
                type="range"
                min={-180}
                max={180}
                step={5}
                value={Math.round((rotation * 180) / Math.PI)}
                onChange={(event) =>
                  onRotateBlock(
                    selectedBlockKey,
                    (Number(event.target.value) * Math.PI) / 180,
                  )
                }
                className="h-6 w-full accent-accent-media"
              />
            </label>
            {selectedRef?.kind === "prop" ? (
              <Button
                size="sm"
                variant="danger"
                onClick={() => onRemoveProp(selectedRef.propId)}
              >
                {copy.removeProp}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
};
