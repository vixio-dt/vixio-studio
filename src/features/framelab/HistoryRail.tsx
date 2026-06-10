import { MediaFrame, Skeleton } from "@/components/ui";
import type { Project, Shot } from "@/domain/types";
import type { AssetId, TaskId } from "@/lib/id";
import { useAsset } from "@/stores/assets";
import { useProjectsStore } from "@/stores/projects";

import { frameLabCopy } from "./copy";

type HistoryRailProps = {
  project: Project;
  shot: Shot;
  /** Ids of queued or running frame tasks for this shot; one skeleton tile each. */
  pendingTaskIds: readonly TaskId[];
  /** "rail" is the right column at lg and up; "strip" sits under the stage below lg. */
  layout: "rail" | "strip";
};

/**
 * Take history: newest first, one pulsing tile per in-flight generation,
 * one click to make any past take the active frame again.
 */
export const HistoryRail = ({
  project,
  shot,
  pendingTaskIds,
  layout,
}: HistoryRailProps) => {
  const attachFrameToShot = useProjectsStore((state) => state.attachFrameToShot);
  const isRail = layout === "rail";
  const tileWidth = isRail ? "w-full" : "w-24 shrink-0";
  const isEmpty = pendingTaskIds.length === 0 && shot.frameHistory.length === 0;

  const content = isEmpty ? (
    <p
      className={
        isRail
          ? "mx-auto py-3 text-[11px] text-fg-muted [writing-mode:vertical-rl]"
          : "py-1 text-[11px] text-fg-muted"
      }
    >
      {frameLabCopy.history.empty}
    </p>
  ) : (
    <>
      {pendingTaskIds.map((taskId) => (
        <div key={taskId} className={tileWidth}>
          <MediaFrame aspectRatio={project.aspectRatio} live>
            <Skeleton className="absolute inset-0" />
          </MediaFrame>
        </div>
      ))}
      {shot.frameHistory.map((assetId, position) => (
        <HistoryTile
          key={assetId}
          assetId={assetId}
          aspectRatio={project.aspectRatio}
          active={assetId === shot.frameAssetId}
          position={position + 1}
          widthClass={tileWidth}
          onUse={() => attachFrameToShot(shot.id, assetId)}
        />
      ))}
    </>
  );

  if (isRail) {
    return (
      <aside
        aria-label={frameLabCopy.history.label}
        className="hidden flex-col gap-2 overflow-y-auto border-l border-line p-2 lg:flex"
      >
        {content}
      </aside>
    );
  }

  return (
    <div
      role="group"
      aria-label={frameLabCopy.history.label}
      className="mx-auto flex w-full max-w-[860px] gap-2 overflow-x-auto lg:hidden"
    >
      {content}
    </div>
  );
};

type HistoryTileProps = {
  assetId: AssetId;
  aspectRatio: string;
  active: boolean;
  /** 1-based, newest first. */
  position: number;
  widthClass: string;
  onUse: () => void;
};

const HistoryTile = ({
  assetId,
  aspectRatio,
  active,
  position,
  widthClass,
  onUse,
}: HistoryTileProps) => {
  const asset = useAsset(assetId);

  return (
    <button
      type="button"
      onClick={onUse}
      title={frameLabCopy.history.use}
      aria-label={frameLabCopy.history.takeLabel(position)}
      aria-pressed={active}
      className={`${widthClass} transition-colors duration-150 ${
        active ? "ring-1 ring-accent-media" : ""
      }`}
    >
      <MediaFrame aspectRatio={aspectRatio}>
        {asset ? (
          <img
            src={asset.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <Skeleton className="absolute inset-0" />
        )}
      </MediaFrame>
    </button>
  );
};
