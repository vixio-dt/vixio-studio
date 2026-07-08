import { ArrowDown, ArrowUp, Trash } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Select } from "@/components/ui";
import { COMIC_LAYOUTS, findComicLayout } from "@/domain/constants";
import type { ComicLayoutId, ComicPage, Panel, ReadingDirection } from "@/domain/types";
import type { PanelId } from "@/lib/id";
import { displayNumberForPanel, readingOrderForLayout } from "@/lib/comic/reading";

import { pagesCopy } from "./copy";

type PageCardProps = {
  page: ComicPage;
  /** Panels for this page, ordered by index. */
  panels: readonly Panel[];
  direction: ReadingDirection;
  /** 0-based position in the book. */
  position: number;
  pageCount: number;
  onOpenPanel: (panelId: PanelId | null) => void;
  onLayoutChange: (layoutId: ComicLayoutId) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
};

/**
 * One page of the book: a mini layout diagram with reading-order numbering,
 * the layout picker, and reorder and delete controls. Clicking the diagram
 * (or one of its frames) jumps into the panel lab.
 */
export const PageCard = ({
  page,
  panels,
  direction,
  position,
  pageCount,
  onOpenPanel,
  onLayoutChange,
  onMove,
  onRemove,
}: PageCardProps) => {
  const layout = findComicLayout(page.layoutId);
  const { width, height } = layout.pageSize;
  const pageNumber = position + 1;

  const firstPanelId = (): PanelId | null => {
    const order = readingOrderForLayout(layout, direction);
    for (const frameIndex of order) {
      const panel = panels.find((candidate) => candidate.index === frameIndex);
      if (panel) return panel.id;
    }
    return panels[0]?.id ?? null;
  };

  return (
    <article
      data-testid={`page-card-${position}`}
      className="flex flex-col gap-3 border border-line bg-ink-panel p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-bold tracking-[-0.02em]">
          {pagesCopy.card.pageLabel(pageNumber)}
        </h2>
        <div className="flex items-center">
          <IconAction
            label={pagesCopy.card.moveUp}
            disabled={position === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={14} aria-hidden />
          </IconAction>
          <IconAction
            label={pagesCopy.card.moveDown}
            disabled={position === pageCount - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={14} aria-hidden />
          </IconAction>
          <IconAction label={pagesCopy.card.remove} danger onClick={onRemove}>
            <Trash size={14} aria-hidden />
          </IconAction>
        </div>
      </header>

      <button
        type="button"
        aria-label={pagesCopy.card.open(pageNumber)}
        onClick={() => onOpenPanel(firstPanelId())}
        className="bg-white/5 p-1.5 ring-1 ring-line transition-colors duration-150 hover:ring-line-strong"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full bg-ink-canvas"
          style={{ aspectRatio: `${width} / ${height}` }}
          role="img"
          aria-hidden
        >
          {layout.frames.map((frame, frameIndex) => {
            const panel = panels.find(
              (candidate) => candidate.index === frameIndex,
            );
            const number = displayNumberForPanel(layout, direction, frameIndex);
            const fontSize = Math.min(width, height) * 0.07;
            return (
              <g
                key={frameIndex}
                onClick={(event) => {
                  if (!panel) return;
                  event.stopPropagation();
                  onOpenPanel(panel.id);
                }}
                aria-label={pagesCopy.card.openPanel(pageNumber, number)}
                className={panel ? "cursor-pointer" : undefined}
              >
                <rect
                  x={frame.x * width}
                  y={frame.y * height}
                  width={frame.w * width}
                  height={frame.h * height}
                  className={`stroke-line-strong ${
                    panel?.imageAssetId
                      ? "fill-accent-media/25"
                      : panel
                        ? "fill-ink-raised"
                        : "fill-transparent"
                  } transition-colors duration-150 hover:fill-ink-hover`}
                  strokeWidth={Math.min(width, height) * 0.006}
                />
                <text
                  x={frame.x * width + fontSize * 0.6}
                  y={frame.y * height + fontSize * 1.25}
                  fontSize={fontSize}
                  className="fill-fg-muted font-mono"
                >
                  {number}
                </text>
              </g>
            );
          })}
        </svg>
      </button>

      <div className="flex items-center justify-between gap-2">
        <label className="sr-only" htmlFor={`page-layout-${page.id}`}>
          {pagesCopy.card.layoutLabel}
        </label>
        <Select
          id={`page-layout-${page.id}`}
          data-testid="page-layout-select"
          value={page.layoutId}
          onChange={(event) =>
            onLayoutChange(event.target.value as ComicLayoutId)
          }
          className="h-8 w-auto grow text-[13px]"
        >
          {COMIC_LAYOUTS.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </Select>
        <span className="shrink-0 font-mono text-[11px] text-fg-muted">
          {pagesCopy.card.panelCount(panels.length)}
        </span>
      </div>
    </article>
  );
};

type IconActionProps = {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
};

const IconAction = ({ label, disabled, danger, onClick, children }: IconActionProps) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className={`flex size-7 items-center justify-center transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
      danger
        ? "text-fg-muted hover:bg-danger/10 hover:text-danger"
        : "text-fg-muted hover:bg-ink-hover hover:text-fg"
    }`}
  >
    {children}
  </button>
);
