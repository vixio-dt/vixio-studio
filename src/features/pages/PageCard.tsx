import { ArrowDown, ArrowUp, Trash } from "@phosphor-icons/react";
import type { ChangeEvent, ReactNode } from "react";
import { useState } from "react";

import { Button, Dialog, Select, Skeleton } from "@/components/ui";
import { COMIC_LAYOUTS, findComicLayout } from "@/domain/constants";
import type { ComicLayoutId, ComicPage, Panel, ReadingDirection } from "@/domain/types";
import type { PanelId } from "@/lib/id";
import { displayNumberForPanel, readingOrderForLayout } from "@/lib/comic/reading";
import { usePageThumbnail } from "@/lib/comic/pageThumbnail";

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
  const { url: thumbnailUrl, failed: thumbnailFailed } = usePageThumbnail(
    page,
    panels,
  );

  /** Layout the panel count no longer fully fits; confirm before switching. */
  const [pendingLayoutId, setPendingLayoutId] = useState<ComicLayoutId | null>(
    null,
  );
  const pendingFrameCount = pendingLayoutId
    ? findComicLayout(pendingLayoutId).frames.length
    : 0;

  const firstPanelId = (): PanelId | null => {
    const order = readingOrderForLayout(layout, direction);
    for (const frameIndex of order) {
      const panel = panels.find((candidate) => candidate.index === frameIndex);
      if (panel) return panel.id;
    }
    return panels[0]?.id ?? null;
  };

  const handleLayoutSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextLayoutId = event.target.value as ComicLayoutId;
    const nextFrameCount = findComicLayout(nextLayoutId).frames.length;
    if (nextFrameCount < panels.length) {
      setPendingLayoutId(nextLayoutId);
      return;
    }
    onLayoutChange(nextLayoutId);
  };

  const confirmLayoutSwitch = () => {
    if (pendingLayoutId) onLayoutChange(pendingLayoutId);
    setPendingLayoutId(null);
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
        className="relative block w-full overflow-hidden bg-ink-canvas p-1.5 ring-1 ring-line transition-colors duration-150 hover:ring-line-strong"
      >
        <div className="relative" style={{ aspectRatio: `${width} / ${height}` }}>
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : thumbnailFailed ? (
            <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-[11px] text-danger">
              {pagesCopy.card.thumbnailFailed}
            </p>
          ) : (
            <Skeleton className="absolute inset-0" />
          )}
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="absolute inset-0 block h-full w-full"
            preserveAspectRatio="none"
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
                    fill="transparent"
                    className="stroke-line-strong transition-colors duration-150 hover:fill-accent-media/20"
                    strokeWidth={Math.min(width, height) * 0.006}
                  />
                  <text
                    x={frame.x * width + fontSize * 0.6}
                    y={frame.y * height + fontSize * 1.25}
                    fontSize={fontSize}
                    className="fill-fg font-mono"
                    style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)" }}
                    strokeWidth={fontSize * 0.22}
                  >
                    {number}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </button>

      <div className="flex items-center justify-between gap-2">
        <label className="sr-only" htmlFor={`page-layout-${page.id}`}>
          {pagesCopy.card.layoutLabel}
        </label>
        <Select
          id={`page-layout-${page.id}`}
          data-testid="page-layout-select"
          value={page.layoutId}
          onChange={handleLayoutSelect}
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

      <Dialog
        open={pendingLayoutId !== null}
        onClose={() => setPendingLayoutId(null)}
        title={pagesCopy.shrinkDialog.title}
      >
        <div className="flex flex-col gap-4">
          <p className="font-mono text-sm text-fg-secondary">
            {pagesCopy.shrinkDialog.body(
              pendingFrameCount,
              panels.length,
              panels.length - pendingFrameCount,
            )}
          </p>
          <footer className="flex items-center justify-end gap-2 border-t border-line pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingLayoutId(null)}
            >
              {pagesCopy.shrinkDialog.cancel}
            </Button>
            <Button
              variant="primary"
              size="sm"
              data-testid="layout-shrink-confirm"
              onClick={confirmLayoutSwitch}
            >
              {pagesCopy.shrinkDialog.confirm}
            </Button>
          </footer>
        </div>
      </Dialog>
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
