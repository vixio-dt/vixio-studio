import { Badge, MediaFrame, Skeleton } from "@/components/ui";
import { findComicLayout } from "@/domain/constants";
import type { ComicPage, Panel, ReadingDirection } from "@/domain/types";
import type { PanelId } from "@/lib/id";
import {
  displayNumberForPanel,
  frameAspectString,
  orderPanelsForReading,
} from "@/lib/comic/reading";
import { useAsset, useAssetsStore } from "@/stores/assets";

import { panelLabCopy } from "./copy";

type PanelRailProps = {
  /** Pages for the project, already ordered by index. */
  pages: readonly ComicPage[];
  panelsByPage: ReadonlyMap<string, readonly Panel[]>;
  direction: ReadingDirection;
  selectedPanelId: PanelId | null;
  onSelect: (id: PanelId) => void;
  className?: string;
};

/**
 * Left rail: every panel of the book grouped under its page, numbered in
 * reading order. Picking a row drives the stage, history, and console.
 */
export const PanelRail = ({
  pages,
  panelsByPage,
  direction,
  selectedPanelId,
  onSelect,
  className = "",
}: PanelRailProps) => (
  <nav
    aria-label={panelLabCopy.rail.label}
    className={`overflow-y-auto border-r border-line pb-3 ${className}`}
  >
    {pages.map((page, pageIndex) => {
      const layout = findComicLayout(page.layoutId);
      const panels = orderPanelsForReading(
        panelsByPage.get(page.id) ?? [],
        layout,
        direction,
      );
      return (
        <section key={page.id}>
          <h2 className="px-3 pb-1 pt-3 font-mono text-[11px] text-fg-muted">
            {panelLabCopy.rail.pageLabel(pageIndex + 1)}
          </h2>
          {panels.length === 0 ? (
            <p className="px-3 py-1 text-xs text-fg-muted">
              {panelLabCopy.rail.noPanels}
            </p>
          ) : (
            panels.map((panel, displayPosition) => (
              <PanelRow
                key={panel.id}
                panel={panel}
                aspect={frameAspectString(layout, panel.index)}
                number={displayNumberForPanel(layout, direction, panel.index)}
                unplaced={panel.index >= layout.frames.length}
                testId={`panel-item-${pageIndex}-${displayPosition}`}
                selected={panel.id === selectedPanelId}
                onSelect={() => onSelect(panel.id)}
              />
            ))
          )}
        </section>
      );
    })}
  </nav>
);

type PanelRowProps = {
  panel: Panel;
  aspect: string;
  /** 1-based display number in reading order. */
  number: number;
  /** True when the panel's index falls outside the page's current layout. */
  unplaced: boolean;
  testId: string;
  selected: boolean;
  onSelect: () => void;
};

const PanelRow = ({
  panel,
  aspect,
  number,
  unplaced,
  testId,
  selected,
  onSelect,
}: PanelRowProps) => {
  const image = useAsset(panel.imageAssetId ?? null);
  const hydrated = useAssetsStore((state) => state.hydrated);
  const waitingOnHydration = panel.imageAssetId !== undefined && !hydrated && !image;
  const description = panel.description.trim();

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full gap-2 border-l-2 p-2 text-left transition-colors duration-150 ${
        selected
          ? "border-accent-media bg-ink-raised"
          : "border-transparent hover:bg-ink-hover"
      }`}
    >
      <MediaFrame aspectRatio={aspect} className="w-12 shrink-0">
        {waitingOnHydration ? (
          <Skeleton className="absolute inset-0" />
        ) : image ? (
          <img
            src={image.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
      </MediaFrame>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-fg-secondary">#{number}</span>
          {unplaced ? (
            <Badge tone="neutral">{panelLabCopy.rail.unplaced}</Badge>
          ) : null}
        </span>
        <span
          className={`line-clamp-2 text-[13px] ${
            description.length > 0 ? "text-fg" : "text-fg-muted"
          }`}
        >
          {description.length > 0
            ? description
            : panelLabCopy.rail.noDescription}
        </span>
        {panel.balloons.length > 0 ? (
          <span className="font-mono text-[11px] text-fg-muted">
            {panelLabCopy.rail.balloonCount(panel.balloons.length)}
          </span>
        ) : null}
        {unplaced ? (
          <span className="text-[11px] text-fg-muted">
            {panelLabCopy.rail.unplacedHint}
          </span>
        ) : null}
      </span>
    </button>
  );
};
