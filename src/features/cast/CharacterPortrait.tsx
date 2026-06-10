import { UsersThree } from "@phosphor-icons/react";

import { MediaFrame, Skeleton } from "@/components/ui";
import type { Character } from "@/domain/types";
import type { AssetId } from "@/lib/id";
import { useAsset, useAssetsStore } from "@/stores/assets";

import { castCopy } from "./copy";

type CharacterPortraitProps = {
  character: Character;
  /** A character-portrait task for this character is queued or running. */
  generating: boolean;
  /** Message of the latest failed portrait task, if any. */
  failureMessage: string | null;
  onRetry: () => void;
  onSelectPortrait: (assetId: AssetId) => void;
};

/**
 * Portrait surface for one cast card: the active portrait in the app's one
 * bezel, an inline failure row with retry, and the history strip. All four
 * states ship: skeleton while generating or hydrating, designed placeholder
 * when empty, inline error, and the image itself on success.
 */
export const CharacterPortrait = ({
  character,
  generating,
  failureMessage,
  onRetry,
  onSelectPortrait,
}: CharacterPortraitProps) => {
  const portrait = useAsset(character.portraitAssetId);
  const hydrated = useAssetsStore((state) => state.hydrated);
  const waitingForHydration = character.portraitAssetId !== null && !hydrated;
  const displayName = character.name.trim() || castCopy.unnamed;

  return (
    <div className="flex flex-col gap-2">
      <MediaFrame aspectRatio="1:1" live={generating}>
        {generating || waitingForHydration ? (
          <Skeleton className="absolute inset-0" />
        ) : portrait ? (
          <img
            src={portrait.url}
            alt={castCopy.portraitAlt(displayName)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <UsersThree size={24} className="text-fg-muted" aria-hidden />
            <p className="text-[13px] font-medium text-fg-secondary">
              {castCopy.noPortraitTitle}
            </p>
            <p className="text-xs text-fg-muted">{castCopy.noPortraitHint}</p>
          </div>
        )}
      </MediaFrame>

      {failureMessage !== null && !generating ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 border border-danger/40 px-2.5 py-1.5"
        >
          <p className="min-w-0 text-xs text-danger">
            {castCopy.portraitFailed} {failureMessage}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 text-xs text-fg-secondary transition-colors duration-150 hover:text-fg"
          >
            {castCopy.retry}
          </button>
        </div>
      ) : null}

      {character.portraitHistory.length > 1 ? (
        <div
          role="group"
          aria-label={castCopy.historyLabel}
          className="flex gap-1.5 overflow-x-auto pb-0.5"
        >
          {character.portraitHistory.map((assetId) => (
            <PortraitThumb
              key={assetId}
              assetId={assetId}
              active={assetId === character.portraitAssetId}
              onSelect={() => onSelectPortrait(assetId)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

type PortraitThumbProps = {
  assetId: AssetId;
  active: boolean;
  onSelect: () => void;
};

const PortraitThumb = ({ assetId, active, onSelect }: PortraitThumbProps) => {
  const asset = useAsset(assetId);

  return (
    <button
      type="button"
      onClick={onSelect}
      title={castCopy.usePortrait}
      aria-label={castCopy.usePortrait}
      aria-pressed={active}
      className={`relative size-12 shrink-0 overflow-hidden bg-ink-canvas transition-colors duration-150 ${
        active
          ? "ring-2 ring-accent-media"
          : "ring-1 ring-line hover:ring-line-strong"
      }`}
    >
      {asset ? (
        <img src={asset.url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Skeleton className="h-full w-full" />
      )}
    </button>
  );
};
