import type { Character } from "@/domain/types";
import type { CharacterId } from "@/lib/id";
import { useAsset } from "@/stores/assets";

import { frameLabCopy } from "./copy";

type ReferenceChipsProps = {
  /** Characters attached to the shot's scene, in scene order. */
  sceneCharacters: readonly Character[];
  /** Character ids currently included in the shot. */
  includedIds: readonly CharacterId[];
  onToggle: (id: CharacterId) => void;
};

/**
 * One chip per scene character. Included characters ride along as identity
 * references: their portrait images attach to the generation request and
 * their look feeds the composed prompt.
 */
export const ReferenceChips = ({
  sceneCharacters,
  includedIds,
  onToggle,
}: ReferenceChipsProps) => {
  const missingPortrait = sceneCharacters.some(
    (character) =>
      includedIds.includes(character.id) && character.portraitAssetId === null,
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-fg-secondary">
        {frameLabCopy.console.referencesLabel}
      </span>
      {sceneCharacters.length === 0 ? (
        <p className="text-xs text-fg-muted">
          {frameLabCopy.console.noSceneCharacters}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sceneCharacters.map((character) => (
            <ReferenceChip
              key={character.id}
              character={character}
              included={includedIds.includes(character.id)}
              onToggle={() => onToggle(character.id)}
            />
          ))}
        </div>
      )}
      {missingPortrait ? (
        <p className="text-xs text-fg-muted">
          {frameLabCopy.console.noPortrait}
        </p>
      ) : null}
    </div>
  );
};

type ReferenceChipProps = {
  character: Character;
  included: boolean;
  onToggle: () => void;
};

const ReferenceChip = ({ character, included, onToggle }: ReferenceChipProps) => {
  const portrait = useAsset(character.portraitAssetId);
  const name = character.name.trim();
  const initial = name.charAt(0).toUpperCase() || "?";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={included}
      className={`flex items-center gap-2 border py-1 pl-1 pr-2.5 text-[13px] transition-colors duration-150 ${
        included
          ? "border-accent-media text-fg"
          : "border-line text-fg-muted hover:bg-ink-hover hover:text-fg-secondary"
      }`}
    >
      {portrait ? (
        <img
          src={portrait.url}
          alt=""
          className="size-6 shrink-0 object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center bg-ink-raised font-mono text-[11px] text-fg-muted"
        >
          {initial}
        </span>
      )}
      {name}
    </button>
  );
};
